<?php

namespace Tests\Feature;

use App\Models\TransJadwal;
use App\Models\TransNilai;
use App\Models\TransRencanaRemedial;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\Concerns\MembuatDataSekolah;
use Tests\TestCase;

/**
 * Pusat notifikasi "Perlu Tindakan": isi per peran, cakupan mapel/kelas guru, status dibaca,
 * dan notifikasi muncul lagi bila isinya berubah.
 */
class NotifikasiTest extends TestCase
{
    use RefreshDatabase, MembuatDataSekolah;

    protected function setUp(): void
    {
        parent::setUp();
        // Hari Minggu tidak ada pengingat presensi dan presensi ditolak; tes dijalankan pada hari Rabu agar tidak bergantung hari nyata
        $this->travelTo(now()->next('Wednesday')->setTime(10, 0));
        $this->buatSekolah();
    }

    public function test_hari_minggu_tanpa_pengingat_presensi_dan_kegiatan_ditolak(): void
    {
        $this->travelTo(now()->next('Sunday')->setTime(10, 0));
        $minggu = $this->hariIni();
        Sanctum::actingAs($this->sekolah->kepsek);
        $this->postJson('/api/jadwal', ['judul' => 'Rapat', 'mulai' => "{$minggu}T08:00", 'selesai' => "{$minggu}T09:00", 'pola' => 'sekali'])
            ->assertUnprocessable()->assertJsonValidationErrors('mulai');
        $this->postJson('/api/jadwal', ['judul' => 'Rapat', 'mulai' => "{$this->hariIni(1)}T08:00", 'selesai' => "{$this->hariIni(1)}T09:00", 'pola' => 'kustom', 'hari' => [0, 1], 'sampai' => $this->hariIni(14)])
            ->assertUnprocessable()->assertJsonValidationErrors('hari.0');
        $this->postJson('/api/presensi/batch', ['id_kelas' => 'KLS-A', 'id_periode' => 'PER-T', 'tanggal' => $minggu, 'records' => [
            ['id_siswa' => 'SIS-1', 'status_kehadiran' => 'HADIR'],
        ]])->assertUnprocessable()->assertJsonValidationErrors('tanggal');
        $this->assertNotContains('presensi-sekolah', $this->jenis($this->notif()));
    }

    private function hariIni(int $geser = 0): string
    {
        return now(config('app.zona_sekolah'))->addDays($geser)->toDateString();
    }

    private function notif(): array
    {
        return $this->getJson('/api/notifikasi')->assertOk()->json();
    }

    private function jenis(array $res): array
    {
        return array_column($res['data'], 'jenis');
    }

    private function nilaiRendah(string $idSiswa = 'SIS-1'): string
    {
        $this->postJson('/api/nilai/batch', $this->sekolah->meta + ['tanggal' => '2030-01-05', 'records' => [
            ['id_siswa' => $idSiswa, 'nilai' => 50],
        ]])->assertOk();
        return TransNilai::where('id_siswa', $idSiswa)->value('id_nilai');
    }

    public function test_guru_diingatkan_nilai_belum_ditindaklanjuti_lalu_remedial_terlambat(): void
    {
        Sanctum::actingAs($this->sekolah->guruA);
        $idNilai = $this->nilaiRendah();

        $res = $this->notif();
        $this->assertContains('tindak-lanjut', $this->jenis($res));
        $item = collect($res['data'])->firstWhere('jenis', 'tindak-lanjut');
        $this->assertStringContainsString('Ani', $item['pesan']);

        // Rencana dibuat untuk tanggal yang sudah lewat → berubah menjadi remedial terlambat (mendesak)
        $this->postJson('/api/remedial', ['id_nilai' => [$idNilai], 'opsi_tindakan' => 'Tes Ulang', 'tanggal_rencana' => $this->hariIni(-2)])->assertOk();
        $res = $this->notif();
        $this->assertNotContains('tindak-lanjut', $this->jenis($res));
        $this->assertSame('danger', $res['data'][0]['tingkat']);
        $this->assertSame('remedial-terlambat', $res['data'][0]['jenis']);
        $this->assertSame(1, $res['mendesak']);

        // Guru mapel lain tidak melihatnya
        Sanctum::actingAs($this->sekolah->guruB);
        $this->assertNotContains('remedial-terlambat', $this->jenis($this->notif()));
    }

    public function test_tandai_dibaca_dan_muncul_lagi_bila_isinya_berubah(): void
    {
        Sanctum::actingAs($this->sekolah->guruA);
        $this->nilaiRendah('SIS-1');
        $tindakLanjut = fn() => collect($this->notif()['data'])->firstWhere('jenis', 'tindak-lanjut');
        $this->assertFalse($tindakLanjut()['dibaca']);

        $this->postJson('/api/notifikasi/baca')->assertOk();
        $this->assertSame(0, $this->notif()['belum_dibaca']);
        $this->assertTrue($tindakLanjut()['dibaca']);

        // Siswa lain ikut di bawah KKM: notifikasi yang sama berubah isi → belum dibaca lagi
        $this->nilaiRendah('SIS-2');
        $this->assertFalse($tindakLanjut()['dibaca']);
        $this->assertSame(1, $this->notif()['belum_dibaca']);
    }

    public function test_jadwal_dan_presensi_hari_ini(): void
    {
        TransJadwal::create([
            'id_jadwal' => 'JDW-1', 'id_periode' => 'PER-T', 'id_kelas' => 'KLS-A', 'id_guru' => 'GR-A', 'id_mapel' => 'MPL-A',
            'judul' => 'Matematika', 'mulai' => $this->hariIni() . ' 07:30', 'selesai' => $this->hariIni() . ' 08:40', 'status_sesi' => 'Menunggu',
        ]);
        TransJadwal::create([
            'id_jadwal' => 'JDW-0', 'id_periode' => 'PER-T', 'id_kelas' => 'KLS-A', 'id_guru' => 'GR-A', 'id_mapel' => 'MPL-A',
            'judul' => 'Matematika', 'mulai' => $this->hariIni(-3) . ' 07:30', 'selesai' => $this->hariIni(-3) . ' 08:40', 'status_sesi' => 'Menunggu',
        ]);

        // Guru A wali kelas KLS-A: jadwal hari ini, sesi lalu belum ditutup, presensi belum diisi, catatan wali
        Sanctum::actingAs($this->sekolah->guruA);
        $jenis = $this->jenis($this->notif());
        foreach (['jadwal-hari-ini', 'jadwal-terbuka', 'presensi-binaan', 'catatan-wali'] as $j) $this->assertContains($j, $jenis);

        // Kepsek melihat rekap kelas yang belum presensi; setelah presensi diisi notifikasinya hilang
        Sanctum::actingAs($this->sekolah->kepsek);
        $this->assertContains('presensi-sekolah', $this->jenis($this->notif()));
        $this->postJson('/api/presensi/batch', ['id_kelas' => 'KLS-A', 'id_periode' => 'PER-T', 'tanggal' => $this->hariIni(), 'records' => [
            ['id_siswa' => 'SIS-1', 'status_kehadiran' => 'HADIR'],
        ]])->assertOk();
        $this->assertNotContains('presensi-sekolah', $this->jenis($this->notif()));
    }

    public function test_admin_diperingatkan_login_gagal_berulang(): void
    {
        User::whereKey($this->sekolah->guruB->id)->update(['username' => 'guru.b']);
        for ($i = 0; $i < 3; $i++) $this->postJson('/api/login', ['login' => 'guru.b', 'password' => 'salah' . $i])->assertUnprocessable();

        Sanctum::actingAs($this->sekolah->admin);
        $item = collect($this->notif()['data'])->firstWhere('jenis', 'login-gagal');
        $this->assertSame('danger', $item['tingkat']);
        $this->assertStringContainsString('guru.b (3×)', $item['pesan']);

        Sanctum::actingAs($this->sekolah->kepsek); // khusus admin
        $this->assertNotContains('login-gagal', $this->jenis($this->notif()));
    }

    public function test_portal_siswa_melihat_jadwal_remedial_anaknya(): void
    {
        Sanctum::actingAs($this->sekolah->guruA);
        $idNilai = $this->nilaiRendah();
        $this->postJson('/api/remedial', ['id_nilai' => [$idNilai], 'opsi_tindakan' => 'Bimbingan Individual', 'tanggal_rencana' => $this->hariIni(2)])->assertOk();

        Sanctum::actingAs($this->sekolah->siswa);
        $res = $this->notif();
        $this->assertSame(['portal-remedial'], $this->jenis($res));
        $this->assertStringContainsString('Bimbingan Individual', $res['data'][0]['pesan']);

        // "Buka" langsung ke kartu tindak lanjut ini di portal
        $idRencana = TransRencanaRemedial::value('id_rencana');
        $siswa = $this->sekolah->siswa->id_siswa;
        $this->assertSame("/dashboard/portal?tab=tindak&siswa={$siswa}&periode=PER-T&rencana={$idRencana}", $res['data'][0]['tautan']);
    }
}

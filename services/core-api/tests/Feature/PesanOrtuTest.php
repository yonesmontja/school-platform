<?php

namespace Tests\Feature;

use App\Models\LogAktivitas;
use App\Models\LogPerubahan;
use App\Models\MasterOrtu;
use App\Models\Student;
use App\Models\TransNilai;
use App\Models\TransPresensi;
use App\Models\User;
use App\Services\NotifikasiService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Laravel\Sanctum\Sanctum;
use Tests\Concerns\MembuatDataSekolah;
use Tests\TestCase;

/**
 * Pesan wali kelas ↔ orang tua (utas per siswa, dibaca, notifikasi, akses) dan rapor berjalan pekanan.
 */
class PesanOrtuTest extends TestCase
{
    use RefreshDatabase, MembuatDataSekolah;

    private User $ortu;

    protected function setUp(): void
    {
        parent::setUp();
        $this->buatSekolah();
        MasterOrtu::unguarded(fn() => MasterOrtu::create(['id_ortu' => 'ORT-1', 'nama_ayah' => 'Pak Ani', 'nama_ibu' => 'Bu Ani', 'no_wa' => '081234567890']));
        Student::where('id_siswa', 'SIS-1')->update(['id_ortu' => 'ORT-1']);
        $this->ortu = User::create(['name' => 'Bu Ani', 'username' => 'ortu_ani', 'password' => 'rahasia123', 'role' => 'ortu', 'id_ortu' => 'ORT-1', 'aktif' => true]);
    }

    public function test_orang_tua_dan_wali_kelas_berbalas_pesan(): void
    {
        // Orang tua menulis ke utas anaknya
        Sanctum::actingAs($this->ortu);
        $this->getJson('/api/pesan')->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.id_siswa', 'SIS-1');
        $this->postJson('/api/pesan/SIS-1', ['isi' => '  Ani izin besok ke dokter.  '])->assertOk()->assertJsonPath('data.isi', 'Ani izin besok ke dokter.');
        // Tidak boleh ke utas anak lain
        $this->postJson('/api/pesan/SIS-2', ['isi' => 'Halo'])->assertForbidden();
        $this->getJson('/api/pesan/SIS-4')->assertForbidden();

        // Isi pesan tidak masuk log perubahan; pengiriman tercatat ringkas
        $this->assertTrue(LogAktivitas::where('aksi', 'KIRIM_PESAN')->exists());
        $this->assertStringNotContainsString('dokter', json_encode(LogAktivitas::all()->toArray()) . json_encode(LogPerubahan::all()->toArray()));

        // Wali kelas: utas binaan, 1 belum dibaca, notifikasi
        Sanctum::actingAs($this->sekolah->guruA);
        $utas = collect($this->getJson('/api/pesan')->assertOk()->json('data'));
        $this->assertCount(3, $utas);
        $this->assertSame(1, $utas->firstWhere('id_siswa', 'SIS-1')['belum_dibaca']);
        $notif = (new NotifikasiService($this->sekolah->guruA))->semua()->firstWhere('jenis', 'pesan-baru');
        $this->assertSame('/dashboard/pesan?siswa=SIS-1', $notif['tautan']);

        // Membuka utas menandai dibaca, lalu membalas
        $this->getJson('/api/pesan/SIS-1')->assertOk()->assertJsonPath('data.0.peran', 'Orang tua/wali')->assertJsonPath('data.0.saya', false);
        $this->assertNull((new NotifikasiService($this->sekolah->guruA))->semua()->firstWhere('jenis', 'pesan-baru'));
        $this->postJson('/api/pesan/SIS-1', ['isi' => 'Baik, semoga lekas sembuh.'])->assertOk();
        $this->postJson('/api/pesan/SIS-1', ['isi' => '   '])->assertStatus(422);

        // Guru B (bukan wali 4A) ditolak
        Sanctum::actingAs($this->sekolah->guruB);
        $this->getJson('/api/pesan/SIS-1')->assertForbidden();

        // Orang tua mendapat notifikasi balasan dengan tautan ke tab Pesan portal
        $notif = (new NotifikasiService($this->ortu))->semua()->firstWhere('jenis', 'pesan-baru');
        $this->assertStringContainsString('tab=pesan', $notif['tautan']);
        Sanctum::actingAs($this->ortu);
        $this->getJson('/api/pesan/SIS-1')->assertOk()->assertJsonCount(2, 'data')->assertJsonPath('data.1.peran', 'Wali kelas');

        // Kepala sekolah melihat utas yang punya pesan
        Sanctum::actingAs($this->sekolah->kepsek);
        $this->assertContains('SIS-1', array_column($this->getJson('/api/pesan')->json('data'), 'id_siswa'));
    }

    public function test_rapor_berjalan_pekan_ini(): void
    {
        $senin = now(config('app.zona_sekolah'))->startOfWeek();
        TransPresensi::create(['id_presensi' => (string) Str::uuid(), 'id_siswa' => 'SIS-1', 'id_kelas' => 'KLS-A', 'id_periode' => 'PER-T',
            'tanggal' => $senin->toDateString(), 'status_kehadiran' => 'SAKIT', 'keterangan' => 'Demam']);
        TransNilai::create(['id_nilai' => (string) Str::uuid(), 'id_siswa' => 'SIS-1', 'nilai' => 60, 'tanggal' => $senin->toDateString()] + $this->sekolah->meta);
        // Nilai pekan lalu tidak ikut
        TransNilai::create(['id_nilai' => (string) Str::uuid(), 'id_siswa' => 'SIS-1', 'nilai' => 99, 'tanggal' => $senin->copy()->subDays(3)->toDateString()] + $this->sekolah->meta);

        Sanctum::actingAs($this->ortu);
        $r = $this->getJson('/api/portal/pekan?id_siswa=SIS-1')->assertOk();
        $this->assertSame(1, $r->json('hitung.SAKIT'));
        $this->assertCount(1, $r->json('nilai'));
        $this->assertFalse($r->json('nilai.0.tuntas'));
        $this->assertStringContainsString('belum tuntas', $r->json('teks'));
        $this->assertNull($r->json('tautan_wa'), 'Akun portal tidak mendapat tautan kirim WA');
        $this->getJson('/api/portal/pekan?id_siswa=SIS-2')->assertForbidden();

        // Pekan lalu
        $this->assertSame(99.0, (float) $this->getJson('/api/portal/pekan?id_siswa=SIS-1&minggu=-1')->json('nilai.0.nilai'));

        // Wali kelas mendapat tautan WhatsApp ke nomor orang tua
        Sanctum::actingAs($this->sekolah->guruA);
        $wa = $this->getJson('/api/portal/pekan?id_siswa=SIS-1')->assertOk()->json('tautan_wa');
        $this->assertStringStartsWith('https://wa.me/6281234567890?text=', $wa);
    }
}

<?php

namespace Tests\Feature;

use App\Models\LogAktivitas;
use App\Models\TransJurnal;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use LogicException;
use Tests\Concerns\MembuatDataSekolah;
use Tests\TestCase;

/**
 * Audit trail: login/logout, setiap perubahan data beserta nilai sebelum & sesudah, percobaan yang gagal,
 * event output dari browser, sensor data rahasia, hak lihat, dan log yang tidak bisa diubah.
 */
class LogAktivitasTest extends TestCase
{
    use RefreshDatabase, MembuatDataSekolah;

    protected function setUp(): void
    {
        parent::setUp();
        $this->buatSekolah();
        // Data contoh dibuat di luar permintaan HTTP sehingga tercatat sebagai proses sistem; dibersihkan agar tes fokus
        DB::table('log_aktivitas')->delete();
    }

    public function test_perubahan_di_luar_permintaan_tercatat_sebagai_sistem(): void
    {
        \App\Models\MasterRuangan::create(['id_ruangan' => 'R-1', 'nama_ruangan' => 'Lab IPA']);
        $log = LogAktivitas::with('perubahan')->sole();
        $this->assertSame('SISTEM', $log->kategori);
        $this->assertSame('Lab IPA', $log->perubahan[0]->label);
    }

    private function simpanNilai(int $nilai)
    {
        return $this->postJson('/api/nilai/batch', $this->sekolah->meta + ['tanggal' => '2030-01-05', 'records' => [
            ['id_siswa' => 'SIS-1', 'nilai' => $nilai],
        ]]);
    }

    public function test_login_berhasil_gagal_dan_logout_tercatat(): void
    {
        User::whereKey($this->sekolah->guruA->id)->update(['username' => 'guru.a']);
        $this->postJson('/api/login', ['login' => 'guru.a', 'password' => 'salah123'])->assertUnprocessable();
        $token = $this->postJson('/api/login', ['login' => 'guru.a', 'password' => 'rahasia123'])->assertOk()->json('access_token');
        $this->withToken($token)->postJson('/api/logout')->assertOk();

        $log = LogAktivitas::orderBy('id')->get();
        $this->assertSame(['LOGIN_GAGAL', 'LOGIN', 'LOGOUT'], $log->pluck('aksi')->all());
        $this->assertFalse($log[0]->berhasil);
        $this->assertSame($this->sekolah->guruA->id, $log[1]->user_id);
        $this->assertSame('AUTH', $log[1]->kategori);
        $this->assertSame(0, $log[1]->jumlah_perubahan); // login_terakhir & token tidak dianggap perubahan data
    }

    public function test_perubahan_data_tercatat_dengan_nilai_sebelum_dan_sesudah(): void
    {
        Sanctum::actingAs($this->sekolah->guruA);
        $this->simpanNilai(60)->assertOk();
        $this->simpanNilai(85)->assertOk();

        $logs = LogAktivitas::with('perubahan')->where('modul', 'Nilai')->orderBy('id')->get();
        $this->assertCount(2, $logs);
        $this->assertSame('Menyimpan lembar nilai (1 baris)', $logs[0]->deskripsi);
        $this->assertSame('TAMBAH', $logs[0]->perubahan[0]->aksi);
        $this->assertSame('Ani', $logs[0]->perubahan[0]->label);

        $ubah = $logs[1]->perubahan->firstWhere('aksi', 'UBAH');
        $this->assertEquals(60, $ubah->data_lama['nilai']);
        $this->assertEquals(85, $ubah->data_baru['nilai']);
        $this->assertSame(['isian'], array_keys($logs[1]->meta));
    }

    public function test_percobaan_ditolak_tercatat_gagal_tanpa_perubahan(): void
    {
        Sanctum::actingAs($this->sekolah->guruB); // bukan pengampu MPL-A
        $this->simpanNilai(70)->assertForbidden();

        $log = LogAktivitas::sole();
        $this->assertFalse($log->berhasil);
        $this->assertSame(403, $log->status_http);
        $this->assertStringContainsString('gagal', $log->deskripsi);
        $this->assertSame(0, $log->perubahan()->count());
    }

    public function test_kata_sandi_selalu_disensor(): void
    {
        Sanctum::actingAs($this->sekolah->admin);
        $this->postJson('/api/users', ['name' => 'Akun Baru', 'username' => 'akun.baru', 'password' => 'RahasiaSekali9', 'role' => 'kepsek'])->assertCreated();

        $log = LogAktivitas::with('perubahan')->where('modul', 'Pengguna')->sole();
        $this->assertSame('••• disensor •••', $log->meta['isian']['password']);
        $this->assertArrayNotHasKey('password', $log->perubahan[0]->data_baru);
        $this->assertStringNotContainsString('RahasiaSekali9', json_encode($log->toArray() + ['p' => $log->perubahan->toArray()]));
    }

    public function test_event_output_dan_hak_lihat_log(): void
    {
        Sanctum::actingAs($this->sekolah->guruA);
        $this->postJson('/api/log-aktivitas/event', ['aksi' => 'CETAK', 'modul' => 'Rapor', 'deskripsi' => 'Mencetak rapor 4A'])->assertOk();
        $this->postJson('/api/log-aktivitas/event', ['aksi' => 'HAPUS', 'modul' => 'Rapor', 'deskripsi' => 'x'])->assertUnprocessable();
        Sanctum::actingAs($this->sekolah->guruB);
        $this->postJson('/api/log-aktivitas/event', ['aksi' => 'BUKA_HALAMAN', 'modul' => 'Jadwal', 'deskripsi' => 'Membuka Jadwal'])->assertOk();

        // Guru hanya melihat miliknya
        $milikB = $this->getJson('/api/log-aktivitas')->assertOk()->json('data');
        $this->assertSame(['BUKA_HALAMAN'], array_column($milikB, 'aksi'));
        $idA = LogAktivitas::where('aksi', 'CETAK')->value('id');
        $this->getJson("/api/log-aktivitas/{$idA}")->assertForbidden();

        // Kepsek melihat semua, termasuk filter kategori & ringkasan
        Sanctum::actingAs($this->sekolah->kepsek);
        $this->assertSame(['CETAK'], array_column($this->getJson('/api/log-aktivitas?kategori=OUTPUT')->json('data'), 'aksi'));
        $ringkasan = $this->getJson('/api/log-aktivitas/ringkasan')->assertOk();
        $this->assertSame(2, $ringkasan->json('total'));
        $this->assertSame(2, $ringkasan->json('pengguna_aktif'));

        Sanctum::actingAs($this->sekolah->siswa);
        $this->getJson('/api/log-aktivitas')->assertForbidden();

        $this->expectException(LogicException::class);
        LogAktivitas::first()->update(['deskripsi' => 'diubah']);
    }

    public function test_guru_jurnal_mengikuti_pemilik_akun_atau_guru_pengampu(): void
    {
        $jurnal = fn(array $isi = []) => $this->postJson('/api/jurnal/store', $isi + [
            'tanggal' => '2030-01-05', 'id_siswa' => 'SIS-1', 'id_kelas' => 'KLS-A', 'id_materi' => 'MTR-T',
            'narasi_kejadian' => 'Ananda aktif bertanya saat diskusi pecahan.', 'mode_dampak' => 'PISAH',
        ])->assertCreated()->json('data.id_jurnal');

        Sanctum::actingAs($this->sekolah->guruB);
        $this->assertSame('GR-B', TransJurnal::find($jurnal())->id_guru);

        // Admin tanpa memilih guru: guru pengampu mapel materinya; tanpa materi: wali kelas
        Sanctum::actingAs($this->sekolah->admin);
        $this->assertSame('GR-A', TransJurnal::find($jurnal())->id_guru);
        $this->assertSame('GR-A', TransJurnal::find($jurnal(['id_materi' => null]))->id_guru);
        $this->assertSame('GR-B', TransJurnal::find($jurnal(['id_guru' => 'GR-B']))->id_guru);
    }
}

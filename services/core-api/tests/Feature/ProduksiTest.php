<?php

namespace Tests\Feature;

use App\Models\LogAktivitas;
use App\Models\SchoolSetting;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Http;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Kesiapan produksi: endpoint health, batas laju API umum, arsip Log Aktivitas terjadwal,
 * dan peringatan WA ke admin untuk login gagal berulang.
 */
class ProduksiTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        DB::table('log_aktivitas')->delete();
    }

    public function test_health_menjawab_ok_tanpa_login(): void
    {
        $this->getJson('/api/health')->assertOk()->assertJson(['status' => 'ok']);
    }

    public function test_api_umum_memakai_batas_laju(): void
    {
        $guru = User::create(['name' => 'Guru', 'username' => 'guru.uji', 'password' => 'rahasia123', 'role' => 'guru', 'aktif' => true]);
        Sanctum::actingAs($guru);
        $this->getJson('/api/me')->assertOk()->assertHeader('X-RateLimit-Limit', 300);
    }

    public function test_log_lama_diarsipkan_ke_file_dan_log_baru_tetap(): void
    {
        $buat = fn(string $waktu, string $deskripsi) => DB::table('log_aktivitas')->insertGetId([
            'waktu' => $waktu, 'kategori' => 'DATA', 'aksi' => 'UBAH', 'modul' => 'Nilai', 'deskripsi' => $deskripsi, 'meta' => json_encode(['a' => 1]),
        ]);
        $lama = $buat(now()->subMonths(14)->toDateTimeString(), 'Ubah nilai lama');
        DB::table('log_perubahan')->insert(['id_log' => $lama, 'tabel' => 'trans_nilai', 'id_subjek' => 'N1', 'aksi' => 'UBAH', 'data_lama' => json_encode(['nilai' => 60]), 'data_baru' => json_encode(['nilai' => 80])]);
        $baru = $buat(now()->subMonth()->toDateTimeString(), 'Ubah nilai baru');

        $dir = storage_path('app/arsip-log');
        $sebelum = File::isDirectory($dir) ? File::files($dir) : [];
        $this->artisan('log:arsipkan')->assertSuccessful();

        $this->assertDatabaseMissing('log_aktivitas', ['id' => $lama]);
        $this->assertDatabaseMissing('log_perubahan', ['id_log' => $lama]);
        $this->assertDatabaseHas('log_aktivitas', ['id' => $baru]);
        $this->assertTrue(LogAktivitas::where('aksi', 'ARSIP')->where('kategori', 'SISTEM')->exists());

        $file = collect(File::files($dir))->first(fn($f) => !in_array($f, $sebelum));
        $this->assertNotNull($file);
        $baris = array_values(array_filter(explode("\n", gzdecode(File::get($file->getPathname())))));
        File::delete($file->getPathname());
        $this->assertCount(1, $baris);
        $isi = json_decode($baris[0], true);
        $this->assertSame('Ubah nilai lama', $isi['deskripsi']);
        $this->assertSame(['a' => 1], $isi['meta']);
        $this->assertSame('N1', $isi['perubahan'][0]['id_subjek']);
    }

    public function test_tidak_ada_log_lama_tidak_membuat_arsip(): void
    {
        $this->artisan('log:arsipkan')->assertSuccessful();
        $this->assertFalse(LogAktivitas::where('aksi', 'ARSIP')->exists());
    }

    private function gagalLogin(int $kali): void
    {
        // IP berbeda tiap percobaan: batas per akun+IP (5/menit) tidak menahan sebelum ambang peringatan
        for ($i = 1; $i <= $kali; $i++) {
            $this->withServerVariables(['REMOTE_ADDR' => "203.0.113.{$i}"])
                ->postJson('/api/login', ['login' => 'target', 'password' => 'tebakan'])->assertUnprocessable();
        }
    }

    public function test_sepuluh_login_gagal_mengirim_satu_peringatan_wa_ke_admin(): void
    {
        Http::fake(['api.fonnte.com/*' => Http::response(['status' => true])]);
        SchoolSetting::create(['nama_sekolah' => 'SD Uji', 'status_wa_api' => true, 'wa_api_token' => 'tok', 'no_wa_admin' => '081234567890']);

        $this->gagalLogin(9);
        Http::assertNothingSent();

        $this->gagalLogin(3);
        // Hanya satu pesan per jam per akun meski percobaan berlanjut
        Http::assertSentCount(1);
        Http::assertSent(fn($req) => str_contains($req['data'], '6281234567890') && str_contains($req['data'], 'target'));
        $this->assertTrue(LogAktivitas::where('aksi', 'PERINGATAN')->where('berhasil', true)->exists());
    }

    public function test_tanpa_nomor_admin_tidak_ada_pesan(): void
    {
        Http::fake();
        SchoolSetting::create(['nama_sekolah' => 'SD Uji', 'status_wa_api' => true, 'wa_api_token' => 'tok']);
        $this->gagalLogin(10);
        Http::assertNothingSent();
    }

    public function test_nomor_wa_admin_hanya_terlihat_admin(): void
    {
        SchoolSetting::create(['nama_sekolah' => 'SD Uji', 'no_wa_admin' => '081234567890']);
        $admin = User::create(['name' => 'Admin', 'username' => 'admin.uji', 'password' => 'rahasia123', 'role' => 'admin', 'aktif' => true]);
        $guru = User::create(['name' => 'Guru', 'username' => 'guru.uji', 'password' => 'rahasia123', 'role' => 'guru', 'aktif' => true]);

        Sanctum::actingAs($admin);
        $this->getJson('/api/settings')->assertJsonPath('no_wa_admin', '081234567890');
        Sanctum::actingAs($guru);
        $this->getJson('/api/settings')->assertJsonMissingPath('no_wa_admin');
    }
}

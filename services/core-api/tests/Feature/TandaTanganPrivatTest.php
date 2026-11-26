<?php

namespace Tests\Feature;

use App\Models\SchoolSetting;
use App\Models\User;
use App\Services\BerkasTtd;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\Concerns\MembuatDataSekolah;
use Tests\TestCase;

/**
 * Gambar tanda tangan kepala sekolah & guru tidak publik: disimpan di disk privat, hanya staf yang masuk bisa memuatnya,
 * alamatnya tidak dikirim ke akun siswa/orang tua (rapor di profil siswa memakai tanda pengesahan elektronik).
 */
class TandaTanganPrivatTest extends TestCase
{
    use RefreshDatabase, MembuatDataSekolah;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('public');
        Storage::fake('local');
        $this->buatSekolah();
        SchoolSetting::create(['nama_sekolah' => 'SD Uji', 'nama_kepsek' => 'Ibu Kepala']);
    }

    private function png(): string
    {
        $potongan = fn(string $jenis, string $isi) => pack('N', strlen($isi)) . $jenis . $isi . pack('N', crc32($jenis . $isi));
        $baris = "\0" . str_repeat("\x10\x20\x30", 40);
        return 'data:image/png;base64,' . base64_encode("\x89PNG\r\n\x1a\n" . $potongan('IHDR', pack('NNCCCCC', 40, 40, 8, 2, 0, 0, 0))
            . $potongan('IDAT', gzcompress(str_repeat($baris, 40))) . $potongan('IEND', ''));
    }

    public function test_tanda_tangan_kepsek_privat_dan_hanya_untuk_staf(): void
    {
        $s = $this->sekolah;
        Sanctum::actingAs($s->admin);
        $url = $this->postJson('/api/settings', ['ttd_kepsek_base64' => $this->png()])->assertOk()->json('data.ttd_kepsek_url');
        $nama = basename($url);
        $this->assertMatchesRegularExpression('/^ttd_kepsek_\d+_[a-z0-9]{16}\.png$/', $nama); // nama acak, tidak bisa ditebak dari waktu
        Storage::disk('local')->assertExists("signatures/{$nama}");
        Storage::disk('public')->assertMissing("signatures/{$nama}");

        // Bukan gambar → ditolak
        $this->postJson('/api/settings', ['ttd_kepsek_base64' => 'data:image/png;base64,' . base64_encode('<svg/>')])->assertUnprocessable();

        // Staf (admin, kepala sekolah, guru) bisa memuat; siswa dan pengunjung tanpa login tidak
        $this->get("/api/signature/{$nama}")->assertOk();
        foreach (['kepsek', 'guruA'] as $peran) {
            Sanctum::actingAs($s->{$peran});
            $this->get("/api/signature/{$nama}")->assertOk();
        }
        Sanctum::actingAs($s->siswa);
        $this->getJson("/api/signature/{$nama}")->assertForbidden();
        $this->app['auth']->forgetGuards();
        $this->getJson("/api/signature/{$nama}")->assertUnauthorized();
        $this->getJson('/api/signature/..%2F..%2F.env')->assertNotFound();

        // Akun portal tidak menerima alamat tanda tangan, baik dari pengaturan maupun data rapor portal
        Sanctum::actingAs($s->siswa);
        $this->assertArrayNotHasKey('ttd_kepsek_url', $this->getJson('/api/settings')->assertOk()->json());
        Sanctum::actingAs($s->kepsek);
        $this->assertSame($url, $this->getJson('/api/settings')->json('ttd_kepsek_url'));

        // Ganti tanda tangan: berkas lama dihapus
        Sanctum::actingAs($s->admin);
        $baru = basename($this->postJson('/api/settings', ['ttd_kepsek_base64' => $this->png()])->assertOk()->json('data.ttd_kepsek_url'));
        Storage::disk('local')->assertMissing("signatures/{$nama}");
        Storage::disk('local')->assertExists("signatures/{$baru}");

        // Menghapus tanda tangan di Pengaturan ikut menghapus berkasnya
        $this->postJson('/api/settings', ['ttd_kepsek_url' => ''])->assertOk();
        $this->assertNull(SchoolSetting::first()->ttd_kepsek_url);
        Storage::disk('local')->assertMissing("signatures/{$baru}");
    }

    public function test_data_rapor_portal_tanpa_alamat_tanda_tangan(): void
    {
        SchoolSetting::first()->update(['ttd_kepsek_url' => '/storage/signatures/ttd_kepsek_1_abc.png']);
        Sanctum::actingAs($this->sekolah->siswa);
        $periode = \App\Models\MasterPeriode::query()->value('id_periode');
        $data = \App\Http\Controllers\Api\RaporController::kumpulkanData('KLS-A', $periode, ['SIS-1']);
        $this->assertArrayNotHasKey('ttd_kepsek_url', $data['settings']->toArray());
        $staf = \App\Http\Controllers\Api\RaporController::kumpulkanData('KLS-A', $periode);
        $this->assertSame('/storage/signatures/ttd_kepsek_1_abc.png', $staf['settings']->ttd_kepsek_url);
    }

    public function test_berkas_lama_dipindahkan_ke_disk_privat(): void
    {
        Storage::disk('public')->put('signatures/ttd_guru_123.png', 'gambar');
        // Masa peralihan: berkas lama di disk publik masih dilayani agar cetak tidak putus sebelum dipindahkan
        $this->get('/api/signature/ttd_guru_123.png')->assertOk();

        // Berkas privat bernama sama tidak pernah ditimpa salinan publik
        Storage::disk('local')->put('signatures/ttd_kepsek_9.png', 'asli');
        Storage::disk('public')->put('signatures/ttd_kepsek_9.png', '');
        $this->artisan('ttd:amankan')->expectsOutputToContain('2 berkas')->assertSuccessful();
        $this->assertSame('asli', Storage::disk('local')->get('signatures/ttd_kepsek_9.png'));
        Storage::disk('public')->assertMissing('signatures/ttd_guru_123.png');
        Storage::disk('local')->assertExists('signatures/ttd_guru_123.png');
        $this->getJson('/api/signature/ttd_guru_123.png')->assertUnauthorized();
        Sanctum::actingAs($this->sekolah->guruA);
        $this->get('/api/signature/ttd_guru_123.png')->assertOk();
        $this->assertNotNull(BerkasTtd::path('ttd_guru_123.png'));
    }
}

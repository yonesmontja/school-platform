<?php

namespace Tests\Feature;

use App\Models\SchoolSetting;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\Concerns\MembuatDataSekolah;
use Tests\TestCase;

/** Logo resmi sekolah: diunggah admin di Pengaturan Sekolah, dipakai di kop dokumen, tersedia publik di /api/logo-sekolah. */
class LogoSekolahTest extends TestCase
{
    use RefreshDatabase, MembuatDataSekolah;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('public');
        $this->buatSekolah();
        SchoolSetting::create(['nama_sekolah' => 'SD Uji']);
    }

    private function pngDataUrl(int $sisi = 64): string
    {
        // PNG RGB polos disusun manual (container tidak memasang ekstensi GD)
        $potongan = fn(string $jenis, string $isi) => pack('N', strlen($isi)) . $jenis . $isi . pack('N', crc32($jenis . $isi));
        $baris = "\0" . str_repeat("\x1e\x3a\x8a", $sisi);
        $png = "\x89PNG\r\n\x1a\n"
            . $potongan('IHDR', pack('NNCCCCC', $sisi, $sisi, 8, 2, 0, 0, 0))
            . $potongan('IDAT', gzcompress(str_repeat($baris, $sisi)))
            . $potongan('IEND', '');
        return 'data:image/png;base64,' . base64_encode($png);
    }

    public function test_admin_mengunggah_mengganti_dan_menghapus_logo(): void
    {
        $this->getJson('/api/logo-sekolah')->assertNotFound();

        Sanctum::actingAs($this->sekolah->admin);
        $url = $this->postJson('/api/settings', ['logo_sekolah_base64' => $this->pngDataUrl()])
            ->assertOk()->json('data.logo_sekolah_url');
        $this->assertStringStartsWith('/storage/logo/logo_sekolah_', $url);
        Storage::disk('public')->assertExists('logo/' . basename($url));

        // Logo publik untuk kop dokumen & halaman masuk; menyimpan pengaturan lain tidak mengubah logo
        $this->getJson('/api/logo-sekolah')->assertOk();
        $this->postJson('/api/settings', ['nama_sekolah' => 'SD Uji Baru', 'logo_sekolah_url' => $url])->assertOk();
        $this->assertSame($url, SchoolSetting::first()->logo_sekolah_url);

        // Ganti logo: berkas lama dihapus
        $baru = $this->postJson('/api/settings', ['logo_sekolah_base64' => $this->pngDataUrl(80)])->json('data.logo_sekolah_url');
        $this->assertNotSame($url, $baru);
        Storage::disk('public')->assertMissing('logo/' . basename($url));

        // Hapus logo: kirim logo_sekolah_url kosong
        $this->postJson('/api/settings', ['logo_sekolah_url' => ''])->assertOk();
        $this->assertNull(SchoolSetting::first()->logo_sekolah_url);
        Storage::disk('public')->assertMissing('logo/' . basename($baru));
        $this->getJson('/api/logo-sekolah')->assertNotFound();
    }

    public function test_logo_palsu_dan_jalur_buatan_ditolak(): void
    {
        Sanctum::actingAs($this->sekolah->admin);
        $this->postJson('/api/settings', ['logo_sekolah_base64' => 'data:image/png;base64,' . base64_encode('<?php echo 1;')])
            ->assertUnprocessable()->assertJsonValidationErrors('logo_sekolah_base64');
        $this->postJson('/api/settings', ['logo_sekolah_base64' => 'data:image/svg+xml;base64,' . base64_encode('<svg/>')])
            ->assertUnprocessable();
        $this->postJson('/api/settings', ['logo_sekolah_base64' => $this->pngDataUrl(16)])->assertUnprocessable();

        // Jalur logo tidak bisa diisi langsung dari luar
        $this->postJson('/api/settings', ['logo_sekolah_url' => '/storage/signatures/lain.png'])->assertOk();
        $this->assertNull(SchoolSetting::first()->logo_sekolah_url);

        // Hanya admin yang boleh mengunggah
        Sanctum::actingAs($this->sekolah->guruA);
        $this->postJson('/api/settings', ['logo_sekolah_base64' => $this->pngDataUrl()])->assertForbidden();
    }

    private function ikonLengkap(): array
    {
        return collect(\App\Http\Controllers\Api\SchoolSettingController::IKON)->map(fn($sisi) => $this->pngDataUrl($sisi))->all();
    }

    public function test_ikon_aplikasi_dari_logo_dengan_cadangan_ikon_bawaan(): void
    {
        // Bawaan: dialihkan ke ikon aplikasi web
        $this->get('/api/ikon-aplikasi/icon-192.png')->assertStatus(302)->assertHeader('Location', '/icons/icon-192.png');
        $this->get('/api/ikon-aplikasi/lain.png')->assertNotFound();

        Sanctum::actingAs($this->sekolah->admin);
        // Tanpa logo, sakelar tidak bisa menyala
        $this->postJson('/api/settings', ['ikon_dari_logo' => true])->assertOk();
        $this->assertFalse(SchoolSetting::first()->ikon_dari_logo);

        $this->postJson('/api/settings', ['logo_sekolah_base64' => $this->pngDataUrl()])->assertOk();
        // Ikon dengan ukuran salah ditolak; sakelar tanpa berkas ikon ditolak
        $salah = $this->ikonLengkap();
        $salah['icon-192'] = $this->pngDataUrl(64);
        $this->postJson('/api/settings', ['ikon_dari_logo' => true, 'ikon_aplikasi' => $salah])->assertUnprocessable()->assertJsonValidationErrors('ikon_aplikasi');
        $this->postJson('/api/settings', ['ikon_dari_logo' => true])->assertUnprocessable();

        $this->postJson('/api/settings', ['ikon_dari_logo' => true, 'ikon_aplikasi' => $this->ikonLengkap()])->assertOk()->assertJsonPath('data.ikon_dari_logo', true);
        Storage::disk('public')->assertExists('ikon/icon-maskable-512.png');
        $this->get('/api/ikon-aplikasi/icon-512.png')->assertOk()->assertHeader('Content-Type', 'image/png');
        $this->get('/api/ikon-aplikasi/favicon-32')->assertOk();

        // Sakelar dimatikan → kembali ke ikon bawaan; dinyalakan lagi tanpa membuat ulang ikon
        $this->postJson('/api/settings', ['ikon_dari_logo' => false])->assertOk();
        $this->get('/api/ikon-aplikasi/icon-512.png')->assertStatus(302);
        $this->postJson('/api/settings', ['ikon_dari_logo' => true])->assertOk();
        $this->get('/api/ikon-aplikasi/icon-512.png')->assertOk();

        // Logo dihapus → ikon ikut dihapus dan sakelar mati
        $this->postJson('/api/settings', ['logo_sekolah_url' => ''])->assertOk();
        $this->assertFalse(SchoolSetting::first()->ikon_dari_logo);
        Storage::disk('public')->assertMissing('ikon/icon-512.png');
        $this->get('/api/ikon-aplikasi/icon-512.png')->assertStatus(302);
    }
}

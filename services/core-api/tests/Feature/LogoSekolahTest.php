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
}

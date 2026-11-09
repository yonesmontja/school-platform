<?php

namespace Tests\Feature;

use App\Models\DokumenRujukan;
use App\Models\User;
use App\Services\PustakaDokumenService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request as HttpRequest;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\Concerns\MembuatDataSekolah;
use Tests\TestCase;

/**
 * Pustaka dokumen resmi untuk AI: admin/kepsek langsung aktif, guru (bila diizinkan admin) disetujui kepala sekolah,
 * hanya dokumen AKTIF yang disisipkan ke permintaan AI.
 */
class PustakaDokumenTest extends TestCase
{
    use RefreshDatabase, MembuatDataSekolah;

    private const TEKS_CP = "Capaian Pembelajaran Bahasa Inggris\n\nFase A. Elemen Menyimak: peserta didik merespons instruksi sederhana dan kosakata warna, angka, anggota keluarga.\n\nElemen Berbicara: peserta didik menyapa dan memperkenalkan diri dengan kalimat pendek.";

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('local');
        $this->buatSekolah();
        config(['services.ai_services.gemini_key' => 'uji']);
    }

    private function sebagai(User $u): static
    {
        Sanctum::actingAs($u);
        return $this;
    }

    private function unggah(array $data = []): \Illuminate\Testing\TestResponse
    {
        return $this->post('/api/dokumen-rujukan', $data + [
            'judul' => 'CP Bahasa Inggris', 'jenis' => 'CP', 'id_mapel' => 'MPL-A',
            'berkas' => UploadedFile::fake()->createWithContent('cp-inggris.txt', self::TEKS_CP),
        ], ['Accept' => 'application/json']);
    }

    public function test_admin_langsung_aktif_dan_teks_dipotong_untuk_ai(): void
    {
        $id = $this->sebagai($this->sekolah->admin)->unggah()->assertCreated()->json('data.id_dokumen');
        $d = DokumenRujukan::find($id);
        $this->assertSame('AKTIF', $d->status);
        $this->assertSame('TERBACA', $d->status_teks);
        $this->assertGreaterThan(0, $d->potongan()->count());

        $k = app(PustakaDokumenService::class)->konteks('capaian bahasa inggris menyimak kosakata', 'MPL-A', 'A');
        $this->assertStringContainsString('Elemen Menyimak', $k['teks']);
        $this->assertSame('CP Bahasa Inggris', $k['sumber'][0]['judul']);
        // Dokumen mapel lain tidak ikut
        $this->assertSame([], app(PustakaDokumenService::class)->konteks('bahasa inggris menyimak', 'MPL-LAIN')['sumber']);

        // PDF yang tidak terbaca server memakai teks hasil baca browser
        $pdf = $this->unggah(['judul' => 'Panduan', 'jenis' => 'PANDUAN', 'id_mapel' => null, 'teks' => 'Panduan pembelajaran mendalam berkesadaran bermakna menggembirakan.',
            'berkas' => UploadedFile::fake()->createWithContent('panduan.pdf', "%PDF-1.4 rusak")])->assertCreated();
        $this->assertSame('TERBACA', DokumenRujukan::find($pdf->json('data.id_dokumen'))->status_teks);
        $this->getJson("/api/dokumen-rujukan/{$id}/unduh")->assertOk();
    }

    public function test_guru_perlu_izin_admin_lalu_persetujuan_kepala_sekolah(): void
    {
        $this->sebagai($this->sekolah->guruA)->unggah()->assertForbidden();

        $this->sebagai($this->sekolah->guruA)->putJson('/api/dokumen-rujukan/pengaturan', ['guru_boleh_unggah' => true])->assertForbidden();
        $this->sebagai($this->sekolah->admin)->putJson('/api/dokumen-rujukan/pengaturan', ['guru_boleh_unggah' => true])->assertOk();

        $id = $this->sebagai($this->sekolah->guruA)->unggah()->assertCreated()->json('data.id_dokumen');
        $this->assertSame('DIAJUKAN', DokumenRujukan::find($id)->status);
        $this->assertSame([], app(PustakaDokumenService::class)->konteks('bahasa inggris menyimak', 'MPL-A')['sumber']); // belum dipakai AI
        $this->postJson("/api/dokumen-rujukan/{$id}/setujui")->assertForbidden();
        // Guru lain tidak melihat ajuan yang belum disetujui
        $this->sebagai($this->sekolah->guruB)->getJson("/api/dokumen-rujukan/{$id}")->assertNotFound();

        $this->sebagai($this->sekolah->kepsek);
        $jenis = collect($this->getJson('/api/notifikasi')->json('data'))->pluck('jenis');
        $this->assertContains('dokumen-persetujuan', $jenis);
        $this->postJson("/api/dokumen-rujukan/{$id}/tolak", ['catatan' => 'Pakai versi BSKAP terbaru'])->assertOk();
        $this->sebagai($this->sekolah->guruA);
        $this->assertContains('dokumen-dikembalikan', collect($this->getJson('/api/notifikasi')->json('data'))->pluck('jenis'));

        // Guru mengunggah versi baru → diajukan lagi → disetujui → dipakai AI
        $this->post("/api/dokumen-rujukan/{$id}/perbarui", ['berkas' => UploadedFile::fake()->createWithContent('cp-v2.txt', self::TEKS_CP . "\n\nVersi 2025.")],
            ['Accept' => 'application/json'])->assertOk();
        $d = DokumenRujukan::find($id);
        $this->assertSame(['DIAJUKAN', 2], [$d->status, $d->versi]);
        $this->sebagai($this->sekolah->kepsek)->postJson("/api/dokumen-rujukan/{$id}/setujui")->assertOk();
        $this->assertNotEmpty(app(PustakaDokumenService::class)->konteks('bahasa inggris menyimak', 'MPL-A')['sumber']);
    }

    public function test_rujukan_aktif_ikut_dibaca_ai_saat_menyusun_cp(): void
    {
        $this->sebagai($this->sekolah->admin)->unggah()->assertCreated();
        Http::fake(['generativelanguage.googleapis.com/*' => Http::response(['candidates' => [['content' => ['parts' => [['text' => json_encode(
            ['cp' => [['fase' => 'A', 'elemen' => 'Menyimak', 'teks' => 'Pada akhir Fase A, peserta didik merespons instruksi sederhana.']]]
        )]]]]]])]);

        $r = $this->sebagai($this->sekolah->guruA)->postJson('/api/perangkat-ajar/cp/susun', ['id_mapel' => 'MPL-A', 'fase' => 'A', 'catatan' => 'bahasa inggris menyimak', 'ai_mode' => 'GEMINI'])->assertOk();
        $this->assertSame('CP Bahasa Inggris', $r->json('rujukan.0.judul'));
        Http::assertSent(fn(HttpRequest $req) => str_contains($req->body(), 'Elemen Menyimak') && str_contains($req->body(), 'Rujukan dokumen resmi sekolah'));
    }

    public function test_tautan_ke_jaringan_internal_ditolak(): void
    {
        $this->assertFalse(PustakaDokumenService::alamatPublik('http://127.0.0.1/rahasia'));
        $this->assertFalse(PustakaDokumenService::alamatPublik('file:///etc/passwd'));
        $this->assertFalse(PustakaDokumenService::alamatPublik('http://10.0.0.5/'));

        PustakaDokumenService::$resolver = fn() => ['93.184.216.34'];
        Http::fake(['https://contoh.go.id/*' => Http::response('<html><body><script>x()</script><h1>Kurikulum</h1><p>Pembelajaran mendalam.</p></body></html>', 200, ['Content-Type' => 'text/html'])]);
        $hasil = app(PustakaDokumenService::class)->teksTautan('https://contoh.go.id/kurikulum');
        $this->assertStringContainsString('Pembelajaran mendalam', (string) $hasil['teks']);
        $this->assertStringNotContainsString('x()', (string) $hasil['teks']);
        PustakaDokumenService::$resolver = null;
    }
}

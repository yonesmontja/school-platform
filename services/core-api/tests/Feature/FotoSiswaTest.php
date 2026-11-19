<?php

namespace Tests\Feature;

use App\Models\LogAktivitas;
use App\Models\Student;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\Concerns\MembuatDataSekolah;
use Tests\TestCase;

/**
 * Pas foto siswa (biodata rapor & portal) dan dashboard pribadi siswa untuk staf.
 */
class FotoSiswaTest extends TestCase
{
    use RefreshDatabase, MembuatDataSekolah;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('local');
        $this->buatSekolah();
    }

    // Container tanpa ekstensi GD: pakai bita gambar kecil yang asli (bukan UploadedFile::fake()->image)
    private const JPG = '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';
    private const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

    private function foto(string $nama = 'pas.jpg'): UploadedFile
    {
        $png = str_ends_with($nama, '.png');
        return UploadedFile::fake()->createWithContent($nama, base64_decode($png ? self::PNG : self::JPG));
    }

    public function test_wali_kelas_dan_admin_mengatur_foto_guru_lain_ditolak(): void
    {
        // Guru B bukan wali KLS-A; siswa tidak boleh mengunggah
        Sanctum::actingAs($this->sekolah->guruB);
        $this->post('/api/siswa/SIS-1/foto', ['foto' => $this->foto()], ['Accept' => 'application/json'])->assertForbidden();
        Sanctum::actingAs($this->sekolah->siswa);
        $this->post('/api/siswa/SIS-1/foto', ['foto' => $this->foto()], ['Accept' => 'application/json'])->assertForbidden();

        // Wali kelas mengunggah: asli ikut tersimpan sebagai acuan edit
        Sanctum::actingAs($this->sekolah->guruA);
        $res = $this->post('/api/siswa/SIS-1/foto', ['foto' => $this->foto()], ['Accept' => 'application/json'])->assertOk();
        $s = Student::find('SIS-1');
        $this->assertNotNull($s->foto_path);
        $this->assertNotNull($s->foto_asli_path);
        Storage::disk('local')->assertExists([$s->foto_path, $s->foto_asli_path]);
        $this->assertStringStartsWith('/api/siswa/SIS-1/foto?', $res->json('foto_url'));
        $this->assertSame('UNGGAH_FOTO', LogAktivitas::latest('id')->value('aksi'));

        // Lokasi berkas tidak pernah ikut di JSON siswa; yang dikirim tautan bertanda tangan
        $data = collect($this->getJson('/api/students')->json('data'))->firstWhere('id_siswa', 'SIS-1');
        $this->assertArrayNotHasKey('foto_path', $data);
        $this->assertNotNull($data['foto_url']);

        // Tautan bertanda tangan bisa dibuka tanpa login; tanpa tanda tangan ditolak
        $this->app['auth']->forgetGuards();
        $this->get($data['foto_url'])->assertOk()->assertHeader('Content-Type', 'image/jpeg');
        $this->get('/api/siswa/SIS-1/foto')->assertForbidden();

        // Admin mengganti foto dengan asli baru: berkas lama dibersihkan
        $lama = [$s->foto_path, $s->foto_asli_path];
        Sanctum::actingAs($this->sekolah->admin);
        $this->post('/api/siswa/SIS-1/foto', ['foto' => $this->foto('baru.png'), 'asli' => $this->foto('asli.jpg')], ['Accept' => 'application/json'])->assertOk();
        Storage::disk('local')->assertMissing($lama);
        $this->get('/api/siswa/SIS-1/foto/asli')->assertOk();

        $this->deleteJson('/api/siswa/SIS-1/foto')->assertOk();
        $this->assertNull(Student::find('SIS-1')->foto_url);
        $this->assertCount(0, Storage::disk('local')->allFiles('foto-siswa'));
    }

    public function test_edit_foto_dengan_ai_perlu_persetujuan_dan_tidak_langsung_disimpan(): void
    {
        config(['services.ai_services.gemini_key' => 'kunci-uji']);
        $png = self::PNG;
        Http::fake(['generativelanguage.googleapis.com/*' => Http::response(['candidates' => [['content' => ['parts' => [
            ['inlineData' => ['mimeType' => 'image/png', 'data' => $png]],
        ]]]]])]);

        Sanctum::actingAs($this->sekolah->guruA);
        $isi = ['foto' => $this->foto(), 'perintah' => 'Ganti latar menjadi merah polos', 'ai_mode' => 'GEMINI'];
        $this->post('/api/siswa/SIS-1/foto/ai', $isi, ['Accept' => 'application/json'])->assertUnprocessable()->assertJsonValidationErrors('setuju');

        $isi['foto'] = $this->foto();
        $res = $this->post('/api/siswa/SIS-1/foto/ai', $isi + ['setuju' => '1'], ['Accept' => 'application/json']);
        $res->assertOk();
        $this->assertStringStartsWith('data:image/png;base64,', $res->json('gambar'));
        $this->assertNull(Student::find('SIS-1')->foto_path);
        Http::assertSent(fn($r) => str_contains($r->url(), 'gemini-2.5-flash-image') && isset($r['contents'][0]['parts'][0]['inlineData']));
        $this->assertSame('AI_FOTO', LogAktivitas::latest('id')->value('aksi'));
    }

    public function test_dashboard_pribadi_siswa_untuk_admin_kepsek_dan_wali_kelas(): void
    {
        // Wali kelas: siswa binaannya saja; data rapor portal terbuka
        Sanctum::actingAs($this->sekolah->guruA);
        $this->getJson('/api/portal/anak?id_siswa=SIS-1')->assertOk()->assertJsonPath('siswa.0.id_siswa', 'SIS-1');
        $this->getJson('/api/portal/anak')->assertForbidden();
        $this->getJson('/api/portal/rapor?id_siswa=SIS-1&id_periode=PER-T')->assertOk();
        $this->getJson('/api/portal/anak?id_siswa=SIS-4')->assertForbidden();
        $this->getJson('/api/portal/rapor?id_siswa=SIS-4&id_periode=PER-T')->assertForbidden();
        // Video & tagihan tetap khusus siswa/orang tua
        $this->getJson('/api/portal/video')->assertForbidden();
        $this->getJson('/api/portal/tagihan?id_siswa=SIS-1')->assertForbidden();

        Sanctum::actingAs($this->sekolah->kepsek);
        $this->getJson('/api/portal/anak?id_siswa=SIS-4')->assertOk();

        // Peninjau tidak membuka dashboard pribadi siswa
        Sanctum::actingAs(User::create(['name' => 'Wakakur', 'username' => 'wakakur_uji', 'password' => 'rahasia123', 'role' => 'wakakur', 'aktif' => true]));
        $this->getJson('/api/portal/anak?id_siswa=SIS-1')->assertForbidden();

        // Akun siswa tetap hanya dirinya sendiri
        Sanctum::actingAs($this->sekolah->siswa);
        $this->assertSame(['SIS-1'], array_column($this->getJson('/api/portal/anak')->json('siswa'), 'id_siswa'));
        $this->getJson('/api/portal/rapor?id_siswa=SIS-2&id_periode=PER-T')->assertForbidden();
    }
}

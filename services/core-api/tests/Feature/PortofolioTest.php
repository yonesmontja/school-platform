<?php

namespace Tests\Feature;

use App\Models\TransPortofolio;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\Concerns\MembuatDataSekolah;
use Tests\TestCase;

/**
 * E-portofolio siswa: unggah staf (langsung disetujui, bisa untuk karya kelompok), unggah portal (menunggu tinjauan),
 * tinjau/kembalikan, tautan berkas bertanda tangan, hak akses, notifikasi, dan ringkasan di rekam jejak.
 */
class PortofolioTest extends TestCase
{
    use RefreshDatabase, MembuatDataSekolah;

    protected function setUp(): void
    {
        parent::setUp();
        $this->buatSekolah();
        Storage::fake('local');
    }

    private function sebagai(User $u): static
    {
        Sanctum::actingAs($u);
        return $this;
    }

    /** PNG 1×1 asli, sehingga finfo mengenalinya sebagai image/png. */
    private function foto(string $nama = 'karya.png'): UploadedFile
    {
        return UploadedFile::fake()->createWithContent($nama, base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='));
    }

    private function unggah(array $siswa, array $extra = [])
    {
        return $this->post('/api/portofolio', $extra + ['id_siswa' => $siswa, 'berkas' => $this->foto(), 'judul' => 'Kincir angin', 'kategori' => 'KARYA'], ['Accept' => 'application/json']);
    }

    public function test_unggah_staf_kelompok_portal_menunggu_dan_tinjau(): void
    {
        $s = $this->sekolah;

        // Wali kelas 4A mengunggah karya kelompok untuk dua siswa: satu berkas, langsung disetujui
        $r = $this->sebagai($s->guruA)->unggah(['SIS-1', 'SIS-2'])->assertCreated()->assertJsonCount(2, 'data');
        $baris = TransPortofolio::orderBy('id')->get();
        $this->assertSame(['DISETUJUI', 'DISETUJUI'], $baris->pluck('status')->all());
        $this->assertNotNull($baris[0]->kelompok);
        $this->assertSame($baris[0]->kelompok, $baris[1]->kelompok);
        $this->assertSame($baris[0]->path, $baris[1]->path);
        Storage::disk('local')->assertExists($baris[0]->path);
        $this->assertArrayNotHasKey('path', $r->json('data.0'));

        // Guru B bukan wali 4A; berkas bukan foto/video ditolak
        $this->sebagai($s->guruB)->unggah(['SIS-1'])->assertForbidden();
        $this->sebagai($s->guruA)->post('/api/portofolio', ['id_siswa' => ['SIS-1'], 'berkas' => UploadedFile::fake()->createWithContent('a.png', 'bukan gambar'),
            'judul' => 'x', 'kategori' => 'KARYA'], ['Accept' => 'application/json'])->assertStatus(422);

        // Tautan berkas bertanda tangan bisa dibuka; tanpa tanda tangan ditolak
        $url = $this->getJson('/api/siswa/SIS-1/portofolio')->assertOk()->json('data.0.url');
        $this->get($url)->assertOk()->assertHeader('Content-Type', 'image/png');
        $this->get('/api/portofolio/' . $baris[0]->id . '/berkas')->assertForbidden();

        // Siswa mengunggah dari portal: menunggu tinjauan; tidak bisa untuk siswa lain
        $this->sebagai($s->siswa)->unggah(['SIS-2'])->assertForbidden();
        $id = $this->unggah(['SIS-1'], ['judul' => 'Gambar keluargaku'])->assertCreated()->json('data.0.id');
        $this->assertSame('MENUNGGU', TransPortofolio::find($id)->status);
        $this->assertTrue($this->getJson('/api/siswa/SIS-1/portofolio')->json('boleh_unggah'));
        $this->assertFalse($this->getJson('/api/siswa/SIS-1/portofolio')->json('boleh_tinjau'));
        $this->postJson("/api/portofolio/{$id}/tinjau", ['status' => 'DISETUJUI'])->assertForbidden();

        // Wali kelas diingatkan; mengembalikan wajib dengan alasan
        $notif = fn() => collect($this->getJson('/api/notifikasi')->assertOk()->json('data'))->pluck('jenis')->all();
        $this->sebagai($s->guruA);
        $this->assertContains('portofolio-menunggu', $notif());
        $this->postJson("/api/portofolio/{$id}/tinjau", ['status' => 'DITOLAK'])->assertStatus(422);
        $this->postJson("/api/portofolio/{$id}/tinjau", ['status' => 'DITOLAK', 'tanggapan' => 'Tambahkan keterangan cara membuatnya.'])->assertOk();
        $this->assertNotContains('portofolio-menunggu', $notif());

        // Siswa melihat tanggapan, memperbaiki → kembali menunggu; wali menyetujui
        $this->sebagai($s->siswa);
        $this->assertContains('portofolio-tinjau', $notif());
        $this->putJson("/api/portofolio/{$id}", ['deskripsi' => 'Dibuat dengan krayon.', 'unggulan' => true])->assertOk();
        $this->assertSame(['MENUNGGU', false], [TransPortofolio::find($id)->status, TransPortofolio::find($id)->unggulan]);
        $this->sebagai($s->guruA)->postJson("/api/portofolio/{$id}/tinjau", ['status' => 'DISETUJUI', 'tanggapan' => 'Bagus sekali!'])->assertOk();
        $this->putJson("/api/portofolio/{$id}", ['unggulan' => true])->assertOk()->assertJsonPath('data.unggulan', true);

        // Karya yang sudah disetujui tidak bisa dihapus/diubah siswa
        $this->sebagai($s->siswa)->deleteJson("/api/portofolio/{$id}")->assertForbidden();
        $this->putJson("/api/portofolio/{$id}", ['judul' => 'x'])->assertForbidden();
    }

    public function test_kelas_kelompok_hapus_dan_rekam_jejak(): void
    {
        $s = $this->sebagai($this->sekolah->guruA)->sekolah;
        $this->unggah(['SIS-1', 'SIS-2'], ['judul' => 'Projek kompos', 'kategori' => 'PRESTASI'])->assertCreated();
        $baris = TransPortofolio::orderBy('id')->get();

        // Galeri kelas: wali 4A; guru B tidak boleh membuka 4A
        $k = $this->getJson('/api/portofolio/kelas')->assertOk();
        $this->assertSame('KLS-A', $k->json('kelas.id_kelas'));
        $this->assertSame([1, 1, 0], collect($k->json('siswa'))->pluck('karya')->all());
        $this->sebagai($s->guruB)->getJson('/api/portofolio/kelas?id_kelas=KLS-A')->assertForbidden();
        $this->getJson('/api/siswa/SIS-1/portofolio')->assertForbidden();

        // Ubah judul berlaku untuk seluruh kelompok
        $this->sebagai($s->guruA)->putJson("/api/portofolio/{$baris[0]->id}", ['judul' => 'Projek kompos sekolah'])->assertOk();
        $this->assertSame(['Projek kompos sekolah', 'Projek kompos sekolah'], TransPortofolio::orderBy('id')->pluck('judul')->all());

        // Rekam jejak memuat jumlah karya per semester
        $sem = collect($this->getJson('/api/siswa/SIS-1/rekam-jejak')->assertOk()->json('semester'))->firstWhere('id_periode', 'PER-T');
        $this->assertSame(1, $sem['portofolio']);

        // Hapus dari satu siswa: berkas tetap untuk anggota lain; hapus terakhir menghapus berkas
        $this->deleteJson("/api/portofolio/{$baris[0]->id}")->assertOk();
        Storage::disk('local')->assertExists($baris[1]->path);
        $this->deleteJson("/api/portofolio/{$baris[1]->id}")->assertOk();
        Storage::disk('local')->assertMissing($baris[1]->path);
    }
}

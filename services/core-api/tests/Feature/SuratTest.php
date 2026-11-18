<?php

namespace Tests\Feature;

use App\Models\ArsipDokumen;
use App\Models\LogPerubahan;
use App\Models\OperatorSekolah;
use App\Models\SchoolSetting;
use App\Models\SuratKeluar;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\Concerns\MembuatDataSekolah;
use Tests\TestCase;

/** Fase 26 Tahap D: Surat & Arsip. */
class SuratTest extends TestCase
{
    use RefreshDatabase, MembuatDataSekolah;

    private const API = '/api/administrasi/surat';
    private User $operator;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('local');
        $this->buatSekolah();
        SchoolSetting::create(['nama_sekolah' => 'SD Uji Papua', 'kota' => 'Nabire', 'nama_kepsek' => 'Yosepha Uji']);
        $this->operator = User::create(['name' => 'Staf TU', 'username' => 'staf.tu', 'password' => 'rahasia123', 'role' => 'operator', 'aktif' => true]);
        OperatorSekolah::create(['id_user' => $this->operator->id, 'submodul' => ['SURAT'], 'ditunjuk_oleh' => $this->sekolah->kepsek->id]);
        Sanctum::actingAs($this->operator);
    }

    private function pdf(string $nama = 'surat.pdf'): UploadedFile
    {
        return UploadedFile::fake()->createWithContent($nama, "%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF");
    }

    private function draf(array $lain = []): int
    {
        return $this->postJson(self::API . '/keluar', $lain + [
            'tanggal' => '2029-08-05', 'kode_klasifikasi' => '421.2', 'perihal' => 'Surat Keterangan Aktif', 'tujuan' => 'Yth. Dinas Pendidikan',
            'sifat' => 'Biasa', 'isi' => '<p>Isi surat <script>alert(1)</script>uji</p>',
        ])->assertCreated()->json('data.id');
    }

    public function test_templat_nomor_otomatis_tanda_tangan_dan_verifikasi(): void
    {
        $this->putJson(self::API . '/pengaturan', ['format' => '{kode}/{singkatan}', 'singkatan' => 'SDU', 'digit' => 3])->assertJsonValidationErrors('format');
        $this->putJson(self::API . '/pengaturan', ['format' => '{urut}/{kode}/{singkatan}/{bulan_romawi}/{tahun}', 'singkatan' => 'SDU', 'digit' => 3])->assertOk();

        // Templat contoh + isi otomatis dari data siswa
        $this->postJson(self::API . '/templat/contoh')->assertCreated();
        $this->postJson(self::API . '/templat/contoh')->assertOk();
        $templat = collect($this->getJson(self::API . '/pilihan')->assertOk()->json('data.templat'))->firstWhere('nama', 'Surat Keterangan Aktif Sekolah');
        $isi = $this->getJson(self::API . "/templat/{$templat['id']}/isi?id_siswa=SIS-1")->assertOk()->json('data.isi');
        $this->assertStringContainsString('Ani', $isi);
        $this->assertStringContainsString('SD Uji Papua', $isi);
        $this->assertStringContainsString('2029/2030', $isi);

        // Draf: skrip dibuang; operator menerbitkan (tanda tangan basah) → nomor 001
        $id = $this->draf();
        $this->assertStringNotContainsString('script', SuratKeluar::find($id)->isi);
        $s1 = $this->postJson(self::API . "/keluar/{$id}/terbitkan")->assertOk()->json('data');
        $this->assertSame('001/421.2/SDU/VIII/2029', $s1['nomor']);
        $this->assertNull($s1['ditandatangani_at']);
        $this->putJson(self::API . "/keluar/{$id}", ['tanggal' => '2029-08-05', 'perihal' => 'X', 'tujuan' => 'Y', 'sifat' => 'Biasa', 'isi' => '<p>x</p>'])->assertJsonValidationErrors('status');
        $this->deleteJson(self::API . "/keluar/{$id}")->assertJsonValidationErrors('status');

        // Draf kedua tanpa kode klasifikasi diajukan → kepala sekolah menandatangani & menerbitkan → nomor 002, segmen kosong dirapatkan
        $id2 = $this->draf(['kode_klasifikasi' => null, 'perihal' => 'Undangan rapat']);
        $this->postJson(self::API . "/keluar/{$id2}/ajukan")->assertOk();
        $this->postJson(self::API . "/keluar/{$id2}/tandatangani")->assertForbidden();
        Sanctum::actingAs($this->sekolah->kepsek);
        $notif = collect($this->getJson('/api/notifikasi')->json('data'))->firstWhere('jenis', 'surat-ttd');
        $this->assertSame(1, $notif['jumlah']);
        $s2 = $this->postJson(self::API . "/keluar/{$id2}/tandatangani")->assertOk()->json('data');
        $this->assertSame('002/SDU/VIII/2029', $s2['nomor']);
        $this->assertNotNull($s2['ditandatangani_at']);
        // Surat operator yang sudah terbit ditandatangani menyusul
        $this->postJson(self::API . "/keluar/{$id}/tandatangani")->assertOk();
        $this->assertNotNull(SuratKeluar::find($id)->ditandatangani_at);

        // Verifikasi publik (tanpa login), lalu batal tetap terlihat sebagai dibatalkan
        $this->app['auth']->forgetGuards();
        $v = $this->getJson('/api/verifikasi-surat/' . strtolower($s2['kode_verifikasi']))->assertOk()->json('data');
        $this->assertSame(['002/SDU/VIII/2029', 'TERBIT', true, 'Yosepha Uji', 'SD Uji Papua'], [$v['nomor'], $v['status'], $v['ditandatangani'], $v['penandatangan'], $v['sekolah']]);
        $this->getJson('/api/verifikasi-surat/TIDAKADA00')->assertNotFound();
        Sanctum::actingAs($this->operator);
        $this->postJson(self::API . "/keluar/{$id2}/batal", ['alasan' => 'Salah tujuan'])->assertOk();
        $this->assertSame('BATAL', $this->getJson('/api/verifikasi-surat/' . $s2['kode_verifikasi'])->json('data.status'));

        // Nomor berikutnya tidak memakai ulang nomor yang dibatalkan
        $id3 = $this->draf();
        $this->assertSame('003/421.2/SDU/VIII/2029', $this->postJson(self::API . "/keluar/{$id3}/terbitkan")->json('data.nomor'));
        $this->assertTrue(LogPerubahan::where('modul', 'Surat & Arsip')->where('label', 'like', '003/421.2/SDU/VIII/2029%')->exists());
    }

    public function test_surat_masuk_disposisi_dan_tindak_lanjut(): void
    {
        $s = $this->post(self::API . '/masuk', [
            'nomor_surat' => '005/DISDIK/2029', 'tanggal_surat' => '2029-08-01', 'tanggal_terima' => '2029-08-03', 'pengirim' => 'Dinas Pendidikan',
            'perihal' => 'Undangan pelatihan', 'sifat' => 'Penting', 'berkas' => $this->pdf(),
        ], ['Accept' => 'application/json'])->assertCreated()->json('data');
        $this->assertSame(1, $s['nomor_agenda']);
        $this->assertArrayNotHasKey('berkas_path', $s);
        $this->get(self::API . "/masuk/{$s['id']}/berkas")->assertOk();
        $this->post(self::API . '/masuk', ['tanggal_terima' => '2029-08-04', 'pengirim' => 'X', 'perihal' => 'Y', 'sifat' => 'Biasa',
            'berkas' => UploadedFile::fake()->createWithContent('a.exe', "MZ\x90\x00binary")], ['Accept' => 'application/json'])->assertJsonValidationErrors('berkas');

        $this->assertSame(1, collect($this->getJson('/api/notifikasi')->json('data'))->firstWhere('jenis', 'surat-masuk')['jumlah']);
        $this->postJson(self::API . "/masuk/{$s['id']}/disposisi", ['kepada_user' => $this->sekolah->guruA->id, 'instruksi' => 'Hadiri dan laporkan', 'batas_waktu' => '2029-08-10'])->assertCreated();
        $this->assertSame('DIDISPOSISI', $this->getJson(self::API . '/masuk')->json('data.0.status'));

        // Penerima (guru tanpa submodul Surat) melihat, membuka berkas, dan mencatat tindak lanjut
        Sanctum::actingAs($this->sekolah->guruA);
        $this->getJson(self::API . '/masuk')->assertForbidden();
        $this->assertSame(1, collect($this->getJson('/api/notifikasi')->json('data'))->firstWhere('jenis', 'disposisi')['jumlah']);
        $d = $this->getJson('/api/disposisi')->assertOk()->json('data.0');
        $this->assertSame('Undangan pelatihan', $d['surat']['perihal']);
        $this->get("/api/disposisi/{$d['id']}/berkas")->assertOk();
        $this->postJson("/api/disposisi/{$d['id']}/baca")->assertOk();
        $this->postJson("/api/disposisi/{$d['id']}/selesai", [])->assertJsonValidationErrors('tindak_lanjut');
        $this->postJson("/api/disposisi/{$d['id']}/selesai", ['tindak_lanjut' => 'Sudah hadir, materi dibagikan ke guru'])->assertOk();
        Sanctum::actingAs($this->sekolah->guruB);
        $this->postJson("/api/disposisi/{$d['id']}/baca")->assertForbidden();

        Sanctum::actingAs($this->operator);
        $this->assertSame('SELESAI', $this->getJson(self::API . '/masuk')->json('data.0.status'));
    }

    public function test_arsip_berlabel_dan_pengingat_dokumen_legal(): void
    {
        $this->post(self::API . '/arsip', ['jenis' => 'ARSIP', 'judul' => 'Notulen rapat guru Agustus', 'kategori' => 'Kurikulum', 'label' => ['Rapat', ' rapat ', 'Guru'], 'berkas' => $this->pdf('notulen.pdf')],
            ['Accept' => 'application/json'])->assertCreated();
        $izin = $this->post(self::API . '/arsip', ['jenis' => 'LEGAL', 'judul' => 'Izin operasional', 'kategori' => 'Izin operasional', 'nomor_dokumen' => '421/123/2024',
            'berlaku_sampai' => now(config('app.zona_sekolah'))->addDays(30)->toDateString()], ['Accept' => 'application/json'])->assertCreated()->json('data.id');
        $this->post(self::API . '/arsip', ['jenis' => 'LEGAL', 'judul' => 'Akreditasi', 'kategori' => 'Akreditasi',
            'berlaku_sampai' => now(config('app.zona_sekolah'))->addYears(3)->toDateString()], ['Accept' => 'application/json'])->assertCreated();

        $semua = $this->getJson(self::API . '/arsip')->assertOk();
        $this->assertSame(['guru', 'rapat'], $semua->json('label'));
        $this->assertCount(1, $this->getJson(self::API . '/arsip?label=rapat')->json('data'));
        $this->assertSame(['Izin operasional'], collect($this->getJson(self::API . '/arsip?jenis=LEGAL&masa=SEGERA')->json('data'))->pluck('judul')->all());

        $notif = collect($this->getJson('/api/notifikasi')->json('data'))->firstWhere('jenis', 'dokumen-legal');
        $this->assertSame(['warning', 1], [$notif['tingkat'], $notif['jumlah']]);
        ArsipDokumen::whereKey($izin)->update(['berlaku_sampai' => now()->subDays(2)->toDateString()]);
        $notif = collect($this->getJson('/api/notifikasi')->json('data'))->firstWhere('jenis', 'dokumen-legal');
        $this->assertSame('danger', $notif['tingkat']);

        // Peninjau hanya membaca; guru tanpa submodul tidak bisa membuka
        Sanctum::actingAs(User::create(['name' => 'Yayasan', 'username' => 'yys', 'password' => 'rahasia123', 'role' => 'yayasan', 'aktif' => true]));
        $this->getJson(self::API . '/arsip')->assertOk();
        $this->postJson(self::API . '/arsip', ['jenis' => 'ARSIP', 'judul' => 'x', 'kategori' => 'Lainnya'])->assertForbidden();
        Sanctum::actingAs($this->sekolah->guruA);
        $this->getJson(self::API . '/arsip')->assertForbidden();
    }
}

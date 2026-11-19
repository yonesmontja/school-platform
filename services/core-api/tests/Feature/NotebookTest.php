<?php

namespace Tests\Feature;

use App\Models\DokumenRujukan;
use App\Models\NotebookCatatan;
use App\Models\User;
use App\Services\PustakaDokumenService;
use Illuminate\Http\Client\Request as HttpRequest;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;
use Laravel\Sanctum\Sanctum;
use Tests\Concerns\MembuatDataSekolah;
use Tests\TestCase;

/**
 * Notebook AI Tahap B: notebook beberapa dokumen (pribadi), tanya-jawab lintas dokumen dengan rujukan per dokumen,
 * catatan riset manual, dan catatan menjadi bahan AI (soal, ATP) tanpa salin-tempel.
 */
class NotebookTest extends TestCase
{
    use RefreshDatabase, MembuatDataSekolah;

    protected function setUp(): void
    {
        parent::setUp();
        $this->buatSekolah();
        config(['services.ai_services.gemini_key' => 'uji']);
    }

    private function sebagai(User $u): static
    {
        Sanctum::actingAs($u);
        return $this;
    }

    private function dokumen(string $judul, string $teks, string $status = 'AKTIF'): DokumenRujukan
    {
        $d = DokumenRujukan::create(['id_dokumen' => 'DOK-' . Str::upper(Str::random(8)), 'judul' => $judul, 'jenis' => 'PANDUAN',
            'sumber_tipe' => 'BERKAS', 'status' => $status, 'diunggah_oleh' => $this->sekolah->admin->id]);
        app(PustakaDokumenService::class)->simpanTeks($d, $teks);
        return $d->fresh();
    }

    private function gemini(array ...$jawaban): void
    {
        $seq = Http::sequence();
        foreach ($jawaban as $j) $seq->push(['candidates' => [['content' => ['parts' => [['text' => json_encode($j)]]]]]]);
        Http::fake(['generativelanguage.googleapis.com/*' => $seq]);
    }

    public function test_notebook_pribadi_tanya_lintas_dokumen_dan_catatan(): void
    {
        $cp = $this->dokumen('CP Matematika', 'Peserta didik mengukur panjang benda dengan satuan baku.');
        $panduan = $this->dokumen('Panduan Asesmen', 'Asesmen formatif mengukur panjang dengan pengamatan langsung saat praktik.');
        $draf = $this->dokumen('Draf orang lain', 'Teks rahasia', 'DIAJUKAN');

        $this->sebagai($this->sekolah->guruA);
        // Dokumen yang belum disetujui dan bukan milik sendiri tidak bisa dipakai
        $this->postJson('/api/notebook', ['judul' => 'Pengukuran', 'dokumen' => [$cp->id_dokumen, $draf->id_dokumen]])->assertStatus(422);
        $n = $this->postJson('/api/notebook', ['judul' => 'Pengukuran kelas 2', 'dokumen' => [$cp->id_dokumen, $panduan->id_dokumen]])
            ->assertCreated()->json('data');
        $this->assertCount(2, $n['dokumen']);

        $this->gemini(['jawaban' => 'CP meminta mengukur dengan satuan baku [B1]; asesmennya lewat pengamatan praktik [B2].', 'rujukan' => [1, 2, 99], 'cukup' => true]);
        $c = $this->postJson("/api/notebook/{$n['id_notebook']}/tanya", ['pertanyaan' => 'Bagaimana mengukur panjang dan menilainya?', 'ai_mode' => 'GEMINI'])
            ->assertOk()->json('data');
        $this->assertSame('TANYA', $c['jenis']);
        $this->assertEqualsCanonicalizing(['CP Matematika', 'Panduan Asesmen'], array_column($c['rujukan'], 'judul'));
        // Bagian dari kedua dokumen dikirim ke AI dengan nama dokumennya
        Http::assertSent(fn(HttpRequest $r) => str_contains($r->body(), 'Dokumen: CP Matematika') && str_contains($r->body(), 'Dokumen: Panduan Asesmen'));

        $m = $this->postJson("/api/notebook/{$n['id_notebook']}/catatan", ['judul' => 'Rencana', 'isi' => 'Mulai dari mengukur meja kelas.'])->assertOk()->json('data');
        $this->putJson("/api/notebook/{$n['id_notebook']}/catatan/{$m['id']}", ['judul' => 'Rencana ukur', 'isi' => 'Ukur meja dan papan tulis.'])->assertOk();
        $this->assertSame('MANUAL', NotebookCatatan::find($m['id'])->jenis);
        $this->assertCount(2, $this->getJson('/api/notebook/catatan')->assertOk()->json('data'));

        // Notebook pribadi: guru lain dan kepala sekolah tidak bisa membuka atau memakai catatannya
        $this->sebagai($this->sekolah->guruB);
        $this->getJson("/api/notebook/{$n['id_notebook']}")->assertNotFound();
        $this->assertCount(0, $this->getJson('/api/notebook/catatan')->json('data'));
        $this->postJson("/api/notebook/{$n['id_notebook']}/tanya", ['pertanyaan' => 'Boleh saya lihat?', 'ai_mode' => 'GEMINI'])->assertNotFound();
        $this->sebagai($this->sekolah->kepsek);
        $this->getJson("/api/notebook/{$n['id_notebook']}")->assertNotFound();
    }

    public function test_catatan_notebook_menjadi_bahan_draf_soal(): void
    {
        $cp = $this->dokumen('CP Matematika', 'Peserta didik mengukur panjang benda dengan satuan baku.');
        $panduan = $this->dokumen('Panduan Asesmen', 'Asesmen formatif lewat pengamatan.');
        $this->sebagai($this->sekolah->guruA);
        $n = $this->postJson('/api/notebook', ['judul' => 'Pengukuran', 'dokumen' => [$cp->id_dokumen, $panduan->id_dokumen]])->json('data');
        $c = $this->postJson("/api/notebook/{$n['id_notebook']}/catatan", ['judul' => 'Inti', 'isi' => 'Satuan baku: sentimeter dan meter.'])->json('data');

        $this->gemini(['soal' => [['pertanyaan' => 'Satuan baku untuk mengukur panjang meja adalah …', 'bentuk' => 'PG', 'level_kognitif' => 'C1',
            'isi' => ['pilihan' => ['sentimeter', 'jengkal', 'langkah', 'depa']], 'kunci' => ['jawaban' => 0]]]]);
        $r = $this->postJson('/api/bank-soal/ai/dari-riset', ['id_catatan' => $c['id'], 'id_mapel' => 'MPL-A', 'bentuk' => 'PG',
            'jumlah' => 1, 'ai_mode' => 'GEMINI'])->assertOk();
        $this->assertStringContainsString('Notebook "Pengukuran"', $r->json('message'));
        Http::assertSent(fn(HttpRequest $q) => str_contains($q->body(), 'Satuan baku: sentimeter dan meter.') && str_contains($q->body(), 'CP Matematika'));

        // Catatan milik guru lain tidak bisa dipakai
        $this->sebagai($this->sekolah->guruB);
        $this->postJson('/api/bank-soal/ai/dari-riset', ['id_catatan' => $c['id'], 'id_mapel' => 'MPL-A', 'bentuk' => 'PG',
            'jumlah' => 1, 'ai_mode' => 'GEMINI'])->assertNotFound();
        $this->assertSame(1, \App\Models\BankSoal::count());
    }

    public function test_catatan_notebook_menjadi_bahan_ai_atp_hanya_milik_sendiri(): void
    {
        $cp = $this->dokumen('CP Matematika', 'Peserta didik mengukur panjang benda dengan satuan baku.');
        $this->sebagai($this->sekolah->guruA);
        $n = $this->postJson('/api/notebook', ['judul' => 'Pengukuran', 'dokumen' => [$cp->id_dokumen]])->json('data');
        $c = $this->postJson("/api/notebook/{$n['id_notebook']}/catatan", ['judul' => 'Urutan', 'isi' => 'Awali dengan satuan tidak baku: jengkal dan depa.'])->json('data');
        $this->postJson('/api/perangkat-ajar/cp', ['id_mapel' => 'MPL-A', 'fase' => 'B', 'elemen' => 'Pengukuran', 'teks' => 'Mengukur panjang'])->assertCreated();
        $atp = $this->postJson('/api/perangkat-ajar/atp', ['judul' => 'ATP 4A', 'id_mapel' => 'MPL-A', 'id_kelas' => 'KLS-A', 'jp_per_minggu' => 5, 'minggu_efektif' => 18])->json('data');

        $this->gemini(['baris' => [['id_materi' => 'MTR-T', 'tp_usulan' => 'Mengukur dengan jengkal', 'alokasi_jp' => 4]]]);
        $r = $this->postJson("/api/perangkat-ajar/atp/{$atp['id_atp']}/ai", ['ai_mode' => 'GEMINI', 'id_catatan_notebook' => $c['id']])->assertOk();
        $this->assertStringContainsString('catatan Notebook "Urutan"', $r->json('message'));
        Http::assertSent(fn(HttpRequest $q) => str_contains($q->body(), 'jengkal dan depa') && str_contains($q->body(), 'Notebook \"Pengukuran\"'));

        // Catatan milik orang lain ditolak, walau ATP-nya boleh diubah (admin)
        $this->sebagai($this->sekolah->admin);
        $this->postJson("/api/perangkat-ajar/atp/{$atp['id_atp']}/ai", ['ai_mode' => 'GEMINI', 'id_catatan_notebook' => $c['id']])->assertNotFound();
    }
}

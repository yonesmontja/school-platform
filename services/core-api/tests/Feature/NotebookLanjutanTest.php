<?php

namespace Tests\Feature;

use App\Models\BankSoal;
use App\Models\DokumenRiset;
use App\Models\DokumenRujukan;
use App\Services\PustakaDokumenService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request as HttpRequest;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;
use Laravel\Sanctum\Sanctum;
use Tests\Concerns\MembuatDataSekolah;
use Tests\TestCase;

/**
 * Fase 23 Tahap B (awal): CP diisi AI dari dokumen Pustaka (bagian mapel dicari menurut judul "CAPAIAN PEMBELAJARAN <MAPEL>"),
 * dan hasil Notebook AI dijadikan draf soal di Bank Soal.
 */
class NotebookLanjutanTest extends TestCase
{
    use RefreshDatabase, MembuatDataSekolah;

    protected function setUp(): void
    {
        parent::setUp();
        $this->buatSekolah();
        config(['services.ai_services.gemini_key' => 'uji']);
    }

    private function dokumen(string $teks): DokumenRujukan
    {
        $d = DokumenRujukan::create(['id_dokumen' => 'DOK-' . Str::upper(Str::random(8)), 'judul' => 'Kepka CP Uji', 'jenis' => 'CP',
            'sumber_tipe' => 'BERKAS', 'status' => 'AKTIF', 'diunggah_oleh' => $this->sekolah->admin->id]);
        app(PustakaDokumenService::class)->simpanTeks($d, $teks);
        return $d->fresh();
    }

    private function gemini(array $jawaban): void
    {
        Http::fake(['generativelanguage.googleapis.com/*' => Http::response(['candidates' => [['content' => ['parts' => [['text' => json_encode($jawaban)]]]]]])]);
    }

    private function kepka(): DokumenRujukan
    {
        $isi = fn($s) => $s . "\n\n" . str_repeat('Rasional dan karakteristik mata pelajaran dijelaskan secara umum. ', 30);
        return $this->dokumen(implode("\n\n", [
            "LAMPIRAN II\nCAPAIAN PEMBELAJARAN PADA PENDIDIKAN DASAR",
            $isi("CAPAIAN PEMBELAJARAN BAHASA INDONESIA\n\nFase A\nElemen Menyimak: murid menyimak dongeng dengan saksama."),
            $isi("CAPAIAN PEMBELAJARAN MATEMATIKA\n\nFase A\nElemen Bilangan: murid menunjukkan pemahaman bilangan cacah sampai 100.\n\nFase D\nElemen Aljabar: murid mengenali persamaan linear."),
            $isi("CAPAIAN PEMBELAJARAN MATEMATIKA TINGKAT LANJUT\n\nFase F\nElemen Kalkulus: murid memahami turunan fungsi."),
        ]));
    }

    public function test_cp_diisi_ai_dari_bagian_mapel_di_dokumen_pustaka(): void
    {
        $d = $this->kepka();
        Sanctum::actingAs($this->sekolah->guruA); // mengampu MPL-A = Matematika

        $bagian = $this->getJson("/api/perangkat-ajar/cp/dokumen/{$d->id_dokumen}/bagian?id_mapel=MPL-A")->assertOk()->json('data');
        $this->assertSame(['Bahasa Indonesia', 'Matematika', 'Matematika Tingkat Lanjut'], array_column($bagian['bagian'], 'judul'));
        $mtk = collect($bagian['bagian'])->firstWhere('judul', 'Matematika');
        $this->assertSame($mtk['dari'], $bagian['saran']);

        $this->gemini(['cp' => [
            ['fase' => 'A', 'elemen' => 'Bilangan', 'teks' => 'Murid menunjukkan pemahaman bilangan cacah sampai 100.'],
            ['fase' => 'D', 'elemen' => 'Aljabar', 'teks' => 'Murid mengenali persamaan linear.'],
        ], 'catatan' => '']);
        $r = $this->postJson('/api/perangkat-ajar/cp/dari-dokumen', ['id_mapel' => 'MPL-A', 'id_dokumen' => $d->id_dokumen, 'ai_mode' => 'GEMINI'])->assertOk();
        $this->assertSame(['Bilangan'], array_column($r->json('data'), 'elemen')); // Fase D (SMP) dibuang
        $this->assertSame('RESMI', $r->json('data.0.sumber'));
        $this->assertSame('Matematika', $r->json('sumber.bagian'));
        // Hanya bagian Matematika yang dikirim ke AI
        Http::assertSent(fn(HttpRequest $q) => str_contains($q->body(), 'bilangan cacah sampai 100') && !str_contains($q->body(), 'menyimak dongeng')
            && !str_contains($q->body(), 'turunan fungsi'));

        // Bagian dipilih manual
        $this->postJson('/api/perangkat-ajar/cp/dari-dokumen', ['id_mapel' => 'MPL-A', 'id_dokumen' => $d->id_dokumen, 'dari' => $bagian['bagian'][2]['dari'], 'ai_mode' => 'GEMINI'])->assertOk();
        Http::assertSent(fn(HttpRequest $q) => str_contains($q->body(), 'turunan fungsi'));

        // Mapel yang tidak diampu ditolak; mapel yang tidak ada di dokumen memberi pesan jelas
        $this->postJson('/api/perangkat-ajar/cp/dari-dokumen', ['id_mapel' => 'MPL-B', 'id_dokumen' => $d->id_dokumen, 'ai_mode' => 'GEMINI'])->assertForbidden();
        Sanctum::actingAs($this->sekolah->guruB); // mengampu MPL-B = IPA, tidak ada di dokumen ("partisipasi" bukan "IPA")
        $this->assertNull($this->getJson("/api/perangkat-ajar/cp/dokumen/{$d->id_dokumen}/bagian?id_mapel=MPL-B")->json('data.saran'));
        $this->postJson('/api/perangkat-ajar/cp/dari-dokumen', ['id_mapel' => 'MPL-B', 'id_dokumen' => $d->id_dokumen, 'ai_mode' => 'GEMINI'])
            ->assertUnprocessable()->assertJsonFragment(['message' => 'Bagian CP IPA tidak ditemukan di dokumen ini. Pilih bagiannya secara manual.']);
    }

    public function test_hasil_notebook_dijadikan_draf_soal_di_bank_soal(): void
    {
        $d = $this->dokumen("Pecahan senilai adalah pecahan yang nilainya sama.\n\nPenyebut adalah bilangan di bawah garis pecahan.");
        $istilah = DokumenRiset::create(['id_dokumen' => $d->id_dokumen, 'jenis' => 'ISTILAH', 'ai_mode' => 'GEMINI', 'dibuat_oleh' => $this->sekolah->admin->id,
            'hasil' => ['istilah' => [['istilah' => 'Penyebut', 'definisi' => 'Bilangan di bawah garis pecahan']]]]);
        $tanyaB = DokumenRiset::create(['id_dokumen' => $d->id_dokumen, 'jenis' => 'TANYA', 'pertanyaan' => 'Apa itu penyebut?', 'ai_mode' => 'GEMINI',
            'dibuat_oleh' => $this->sekolah->guruB->id, 'hasil' => ['jawaban' => 'Bilangan di bawah garis [B2].', 'cukup' => true], 'rujukan' => [['no' => 2, 'teks' => 'Penyebut adalah bilangan di bawah garis pecahan.']]]);

        $this->gemini(['soal' => [['pertanyaan' => 'Bilangan di bawah garis pecahan disebut …', 'bentuk' => 'PG', 'level_kognitif' => 'C1',
            'isi' => ['pilihan' => ['Penyebut', 'Pembilang', 'Hasil', 'Sisa']], 'kunci' => ['jawaban' => 0]]]]);
        Sanctum::actingAs($this->sekolah->guruA);
        $r = $this->postJson('/api/bank-soal/ai/dari-riset', ['id_riset' => $istilah->id, 'id_mapel' => 'MPL-A', 'id_materi' => 'MTR-T', 'bentuk' => 'PG', 'jumlah' => 1, 'ai_mode' => 'GEMINI'])
            ->assertOk();
        $this->assertStringContainsString('Kepka CP Uji', $r->json('message'));
        $soal = BankSoal::sole();
        $this->assertSame(['DRAF', 'AI', 'MPL-A', 'MTR-T', $this->sekolah->guruA->id], [$soal->status, $soal->sumber, $soal->id_mapel, $soal->id_materi, $soal->dibuat_oleh]);
        Http::assertSent(fn(HttpRequest $q) => str_contains($q->body(), 'Notebook AI Istilah') && str_contains($q->body(), 'Bilangan di bawah garis pecahan'));

        // Riwayat tanya guru lain tidak bisa dipakai; mapel yang tidak diampu ditolak
        $this->postJson('/api/bank-soal/ai/dari-riset', ['id_riset' => $tanyaB->id, 'id_mapel' => 'MPL-A', 'bentuk' => 'PG', 'ai_mode' => 'GEMINI'])->assertNotFound();
        $this->postJson('/api/bank-soal/ai/dari-riset', ['id_riset' => $istilah->id, 'id_mapel' => 'MPL-B', 'bentuk' => 'PG', 'ai_mode' => 'GEMINI'])->assertForbidden();
    }
}

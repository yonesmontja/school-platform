<?php

namespace Tests\Feature;

use App\Models\DokumenRiset;
use App\Models\DokumenRujukan;
use App\Models\User;
use App\Services\PustakaDokumenService;
use App\Services\RisetDokumenAIService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request as HttpRequest;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;
use Laravel\Sanctum\Sanctum;
use Tests\Concerns\MembuatDataSekolah;
use Tests\TestCase;

/**
 * Notebook AI Pustaka Dokumen (Fase 23 Tahap A): riset per dokumen (respons AI ditiru), dokumen panjang dibaca per segmen,
 * tanya-jawab hanya dari bagian dokumen dengan nomor bagian yang dirujuk, akses mengikuti akses dokumen.
 */
class RisetDokumenTest extends TestCase
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

    private function dokumen(string $teks, string $status = 'AKTIF', ?int $oleh = null): DokumenRujukan
    {
        $d = DokumenRujukan::create(['id_dokumen' => 'DOK-' . Str::upper(Str::random(8)), 'judul' => 'Panduan Asesmen', 'jenis' => 'PANDUAN',
            'sumber_tipe' => 'BERKAS', 'status' => $status, 'diunggah_oleh' => $oleh ?? $this->sekolah->admin->id]);
        app(PustakaDokumenService::class)->simpanTeks($d, $teks);
        return $d->fresh();
    }

    /** Jawaban Gemini berurutan untuk beberapa permintaan. */
    private function gemini(array ...$jawaban): void
    {
        $seq = Http::sequence();
        foreach ($jawaban as $j) $seq->push(['candidates' => [['content' => ['parts' => [['text' => json_encode($j)]]]]]]);
        Http::fake(['generativelanguage.googleapis.com/*' => $seq]);
    }

    public function test_riset_ringkasan_dan_daftar_disimpan_terbaru_per_jenis(): void
    {
        $d = $this->dokumen("Asesmen formatif dilakukan selama pembelajaran.\n\nAsesmen sumatif dilakukan di akhir lingkup materi. Rapor terbit 20 Desember 2026.");
        $this->gemini(
            ['ringkasan' => 'Panduan asesmen formatif dan sumatif.', 'poin' => ['Formatif selama belajar', 'Sumatif di akhir', 'Formatif selama belajar']],
            ['istilah' => [['istilah' => 'Sumatif', 'definisi' => 'Asesmen di akhir lingkup materi'], ['istilah' => 'sumatif', 'definisi' => 'kembar'], ['istilah' => 'Formatif', 'definisi' => 'Asesmen selama belajar'], ['istilah' => '', 'definisi' => 'kosong']]],
            ['data' => [['jenis' => 'tanggal', 'nilai' => '20 Desember 2026', 'keterangan' => 'Rapor terbit'], ['jenis' => 'SIHIR', 'nilai' => '3', 'keterangan' => 'x']],
                'tabel' => [['judul' => 'Jenis asesmen', 'kolom' => ['Jenis', 'Waktu'], 'baris' => [['Formatif', 'Selama'], ['Sumatif', 'Akhir']]], ['judul' => 'kosong', 'kolom' => [], 'baris' => []]]],
            ['ringkasan' => 'Ringkasan kedua.', 'poin' => ['Satu']],
        );

        $this->sebagai($this->sekolah->guruA);
        $r = $this->postJson("/api/dokumen-rujukan/{$d->id_dokumen}/riset", ['jenis' => 'RINGKAS', 'ai_mode' => 'GEMINI'])->assertOk();
        $this->assertSame(['Formatif selama belajar', 'Sumatif di akhir'], $r->json('data.hasil.poin'));

        $istilah = $this->postJson("/api/dokumen-rujukan/{$d->id_dokumen}/riset", ['jenis' => 'ISTILAH', 'ai_mode' => 'GEMINI'])->assertOk()->json('data.hasil.istilah');
        $this->assertSame(['Formatif', 'Sumatif'], array_column($istilah, 'istilah')); // kembar & kosong dibuang, urut abjad

        $ekstrak = $this->postJson("/api/dokumen-rujukan/{$d->id_dokumen}/riset", ['jenis' => 'EKSTRAK', 'ai_mode' => 'GEMINI'])->assertOk()->json('data.hasil');
        $this->assertSame(['TANGGAL', 'LAINNYA'], array_column($ekstrak['data'], 'jenis'));
        $this->assertCount(1, $ekstrak['tabel']);

        // Ringkasan ulang menggantikan yang lama
        $this->postJson("/api/dokumen-rujukan/{$d->id_dokumen}/riset", ['jenis' => 'RINGKAS', 'ai_mode' => 'GEMINI'])->assertOk();
        $this->assertSame(1, DokumenRiset::where('id_dokumen', $d->id_dokumen)->where('jenis', 'RINGKAS')->count());

        $panel = $this->getJson("/api/dokumen-rujukan/{$d->id_dokumen}/riset")->assertOk()->json('data');
        $this->assertSame('Ringkasan kedua.', $panel['riset']['RINGKAS']['hasil']['ringkasan']);
        $this->assertEqualsCanonicalizing(['RINGKAS', 'ISTILAH', 'EKSTRAK'], array_keys($panel['riset']));
        $this->assertTrue($panel['cakupan']['lengkap']);
    }

    public function test_dokumen_panjang_dibaca_per_segmen_lalu_ringkasan_digabung(): void
    {
        $paragraf = collect(range(1, 300))->map(fn($i) => "Paragraf {$i}: " . str_repeat('kurikulum merdeka pembelajaran mendalam ', 30))->implode("\n\n");
        $d = $this->dokumen($paragraf);
        $segmen = RisetDokumenAIService::segmen($d);
        $this->assertCount(4, $segmen['segmen']); // ± 360 ribu karakter → 4 segmen
        $this->assertTrue(collect($segmen['segmen'])->every(fn($s) => mb_strlen($s) <= RisetDokumenAIService::UKURAN_SEGMEN));

        $bagian = fn($n) => ['ringkasan' => "Bagian {$n}", 'poin' => ["Poin {$n}"]];
        $this->gemini($bagian(1), $bagian(2), $bagian(3), $bagian(4), ['ringkasan' => 'Ringkasan utuh', 'poin' => ['A', 'B']]);
        $this->sebagai($this->sekolah->admin)->postJson("/api/dokumen-rujukan/{$d->id_dokumen}/riset", ['jenis' => 'RINGKAS', 'ai_mode' => 'GEMINI'])
            ->assertOk()->assertJsonPath('data.hasil.ringkasan', 'Ringkasan utuh');
        Http::assertSentCount(5);
        Http::assertSent(fn(HttpRequest $r) => str_contains($r['contents'][0]['parts'][0]['text'], 'Ini bagian 4 dari 4'));
    }

    public function test_tanya_jawab_merujuk_bagian_dokumen_dan_akses_mengikuti_dokumen(): void
    {
        $isi = fn($s) => $s . ' ' . str_repeat('Keterangan umum dokumen. ', 50);
        $d = $this->dokumen(implode("\n\n", [$isi('Bab I Pendahuluan sekolah.'),
            $isi('Bab II Remedial diberikan kepada peserta didik yang belum mencapai tujuan pembelajaran, paling lambat dua minggu.'), $isi('Bab III Penutup.')]));
        $this->gemini(
            ['jawaban' => 'Remedial diberikan paling lambat dua minggu [B2].', 'rujukan' => ['B2', 99], 'cukup' => true],
            ['jawaban' => 'Dokumen tidak membahas biaya.', 'rujukan' => [], 'cukup' => false],
        );

        $this->sebagai($this->sekolah->guruA);
        $j = $this->postJson("/api/dokumen-rujukan/{$d->id_dokumen}/tanya", ['pertanyaan' => 'Kapan remedial diberikan?', 'ai_mode' => 'GEMINI'])->assertOk()->json('data');
        $this->assertSame([2], array_column($j['rujukan'], 'no')); // nomor bagian yang tidak dikirim dibuang
        $this->assertStringContainsString('Remedial diberikan', $j['rujukan'][0]['teks']);
        Http::assertSent(fn(HttpRequest $r) => str_contains($r['contents'][0]['parts'][0]['text'], '[B2]'));

        $this->postJson("/api/dokumen-rujukan/{$d->id_dokumen}/tanya", ['pertanyaan' => 'Berapa biaya sekolah?', 'ai_mode' => 'GEMINI'])
            ->assertOk()->assertJsonPath('data.hasil.cukup', false);

        // Riwayat tanya hanya milik sendiri; pengelola melihat semua; hapus hanya pembuat/pengelola
        $this->assertCount(2, $this->getJson("/api/dokumen-rujukan/{$d->id_dokumen}/riset")->json('data.tanya'));
        $this->sebagai($this->sekolah->guruB);
        $this->assertCount(0, $this->getJson("/api/dokumen-rujukan/{$d->id_dokumen}/riset")->json('data.tanya'));
        $this->deleteJson("/api/dokumen-rujukan/{$d->id_dokumen}/riset/{$j['id']}")->assertForbidden();
        $this->sebagai($this->sekolah->admin);
        $this->assertCount(2, $this->getJson("/api/dokumen-rujukan/{$d->id_dokumen}/riset")->json('data.tanya'));

        // Dokumen yang masih diajukan guru lain tidak terlihat; dokumen belum terbaca ditolak; siswa tidak punya akses
        $ajuan = $this->dokumen('Ajuan guru A tentang asesmen.', 'DIAJUKAN', $this->sekolah->guruA->id);
        $this->sebagai($this->sekolah->guruB)->getJson("/api/dokumen-rujukan/{$ajuan->id_dokumen}/riset")->assertNotFound();
        $kosong = $this->dokumen('');
        $this->sebagai($this->sekolah->admin)->postJson("/api/dokumen-rujukan/{$kosong->id_dokumen}/riset", ['jenis' => 'FAQ', 'ai_mode' => 'GEMINI'])->assertUnprocessable();
        $this->sebagai($this->sekolah->siswa)->getJson("/api/dokumen-rujukan/{$d->id_dokumen}/riset")->assertForbidden();
    }
}

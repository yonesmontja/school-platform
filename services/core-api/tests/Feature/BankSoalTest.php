<?php

namespace Tests\Feature;

use App\Models\BankSoal;
use App\Models\MasterIndikator;
use App\Models\User;
use App\Services\BankSoalService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Laravel\Sanctum\Sanctum;
use Tests\Concerns\MembuatDataSekolah;
use Tests\TestCase;

/**
 * Bank soal (Fase 16 Tahap A): soal per TP & STNKM, kisi-kisi, alur persetujuan kepala sekolah,
 * draf AI dan impor paket soal (respons AI ditiru), serta pembersihan gambar SVG dari AI.
 */
class BankSoalTest extends TestCase
{
    use RefreshDatabase, MembuatDataSekolah;

    private const PG = [
        'id_mapel' => 'MPL-A', 'id_indikator' => 'IND-T1', 'bentuk' => 'PG', 'level_kognitif' => 'C2', 'tingkat_kesulitan' => 'MUDAH',
        'dim_T' => 1, 'dim_N' => 0.4, 'pertanyaan' => 'Pecahan yang senilai dengan 1/2 adalah ...',
        'isi' => ['pilihan' => ['2/4', '1/3', '3/4', '2/3']], 'kunci' => ['jawaban' => 0],
    ];

    protected function setUp(): void
    {
        parent::setUp();
        $this->buatSekolah();
        MasterIndikator::create(['id_indikator' => 'IND-T1', 'id_materi' => 'MTR-T', 'deskripsi' => 'Menentukan pecahan senilai', 'urutan' => 1]);
    }

    private function sebagai(User $user): static
    {
        Sanctum::actingAs($user);
        return $this;
    }

    public function test_guru_menyusun_soal_hanya_untuk_mapel_diampu_dengan_kunci_valid(): void
    {
        $res = $this->sebagai($this->sekolah->guruA)->postJson('/api/bank-soal', self::PG)->assertCreated();
        $soal = BankSoal::find($res->json('data.id_soal'));
        $this->assertSame('DRAF', $soal->status);
        $this->assertSame('MTR-T', $soal->id_materi); // materi mengikuti TP
        $this->assertSame(['jawaban' => 0], $soal->kunci);

        $this->postJson('/api/bank-soal', array_merge(self::PG, ['kunci' => ['jawaban' => 7]]))->assertUnprocessable();
        $this->postJson('/api/bank-soal', array_merge(self::PG, ['id_mapel' => 'MPL-B']))->assertForbidden();
        $this->postJson('/api/bank-soal', array_merge(self::PG, [
            'bentuk' => 'MENJODOHKAN', 'isi' => ['pasangan' => [['kiri' => '1/2', 'kanan' => '2/4'], ['kiri' => '1/3', 'kanan' => '2/6']]], 'kunci' => [],
        ]))->assertCreated()->assertJsonPath('data.skor_maks', 2);
    }

    public function test_alur_persetujuan_kepala_sekolah(): void
    {
        $id = $this->sebagai($this->sekolah->guruA)->postJson('/api/bank-soal', self::PG)->json('data.id_soal');
        $this->postJson('/api/bank-soal/ajukan', ['id_soal' => [$id]])->assertOk()->assertJsonPath('jumlah', 1);
        $this->putJson("/api/bank-soal/{$id}", self::PG)->assertUnprocessable(); // terkunci selama diajukan

        // Hanya kepala sekolah yang menyetujui; ia melihat pengajuan di Perlu Tindakan
        $this->sebagai($this->sekolah->admin)->postJson('/api/bank-soal/setujui', ['id_soal' => [$id]])->assertForbidden();
        $notif = collect($this->sebagai($this->sekolah->kepsek)->getJson('/api/notifikasi')->json('data'))->firstWhere('jenis', 'soal-persetujuan');
        $this->assertSame(1, $notif['jumlah']);
        $this->postJson('/api/bank-soal/revisi', ['id_soal' => [$id], 'catatan' => 'Pengecoh 3/4 terlalu mudah ditebak.'])->assertOk();

        $notif = collect($this->sebagai($this->sekolah->guruA)->getJson('/api/notifikasi')->json('data'))->firstWhere('jenis', 'soal-revisi');
        $this->assertStringContainsString('Pengecoh 3/4', $notif['pesan']);
        $this->putJson("/api/bank-soal/{$id}", array_merge(self::PG, ['isi' => ['pilihan' => ['2/4', '1/3', '2/5', '2/3']]]))->assertOk();
        $this->postJson('/api/bank-soal/ajukan', ['id_soal' => [$id]])->assertOk();
        $this->sebagai($this->sekolah->kepsek)->postJson('/api/bank-soal/setujui', ['id_soal' => [$id]])->assertOk()->assertJsonPath('jumlah', 1);
        $soal = BankSoal::find($id);
        $this->assertSame(['DISETUJUI', $this->sekolah->kepsek->id, null], [$soal->status, $soal->disetujui_oleh, $soal->catatan_revisi]);

        // Guru mengubah soal yang sudah disetujui → kembali draf dengan versi baru
        $this->sebagai($this->sekolah->guruA)->putJson("/api/bank-soal/{$id}", self::PG)->assertOk();
        $this->assertSame(['DRAF', 2, null], [$soal->fresh()->status, $soal->fresh()->versi, $soal->fresh()->disetujui_oleh]);
    }

    public function test_guru_hanya_melihat_soalnya_dan_soal_disetujui_mapel_diampu(): void
    {
        $draf = $this->sebagai($this->sekolah->admin)->postJson('/api/bank-soal', self::PG)->json('data.id_soal');
        $setuju = $this->postJson('/api/bank-soal', self::PG)->json('data.id_soal');
        BankSoal::whereKey($setuju)->update(['status' => 'DISETUJUI']);

        $ids = collect($this->sebagai($this->sekolah->guruA)->getJson('/api/bank-soal')->json('data'))->pluck('id_soal')->all();
        $this->assertSame([$setuju], $ids);
        $this->assertSame([], $this->sebagai($this->sekolah->guruB)->getJson('/api/bank-soal')->json('data'));
        $this->getJson("/api/bank-soal/{$draf}")->assertNotFound();
        $this->sebagai($this->sekolah->guruA)->deleteJson("/api/bank-soal/{$setuju}")->assertForbidden(); // milik admin
    }

    public function test_svg_dari_ai_dibersihkan(): void
    {
        $svg = '<p>Berikut gambarnya:</p><svg viewBox="0 0 100 100" onload="alert(1)"><script>alert(2)</script>'
            . '<rect x="10" y="10" width="80" height="40" fill="#fde68a" onclick="x()"/><image href="http://jahat.example/a.png"/>'
            . '<use href="http://jahat.example/#a"/><text x="50" y="80">1/2</text></svg> selesai';
        $bersih = BankSoalService::sanitasiSvg($svg);
        $this->assertStringStartsWith('<svg', $bersih);
        foreach (['script', 'onload', 'onclick', 'alert', '<image', 'jahat.example'] as $terlarang) $this->assertStringNotContainsString($terlarang, $bersih);
        $this->assertStringContainsString('<rect', $bersih);
        $this->assertStringContainsString('1/2', $bersih);
        $this->assertNull(BankSoalService::sanitasiSvg('<div>bukan svg</div>'));
    }

    public function test_draf_ai_tersimpan_sebagai_draf_dan_soal_tidak_lengkap_dilewati(): void
    {
        config(['services.ai_services.gemini_key' => 'kunci-uji']);
        $soalAi = ['soal' => [
            ['pertanyaan' => 'Manakah pecahan senilai 1/2?', 'bentuk' => 'PG', 'level_kognitif' => 'C2', 'isi' => ['pilihan' => ['3/6', '1/4', '2/3', '3/4']],
                'kunci' => ['jawaban' => 0], 'dimensi' => ['T' => 1, 'N' => 0.5], 'gambar_svg' => '<svg viewBox="0 0 10 10"><script>x</script><circle cx="5" cy="5" r="4"/></svg>'],
            ['pertanyaan' => 'Soal tanpa kunci', 'bentuk' => 'PG', 'isi' => ['pilihan' => ['a', 'b', 'c']]],
        ]];
        Http::fake(['generativelanguage.googleapis.com/*' => Http::response(['candidates' => [['content' => ['parts' => [['text' => json_encode($soalAi)]]]]]])]);

        $res = $this->sebagai($this->sekolah->guruA)->postJson('/api/bank-soal/ai/draf', [
            'id_mapel' => 'MPL-A', 'id_indikator' => 'IND-T1', 'bentuk' => 'PG', 'level_kognitif' => 'C2', 'jumlah' => 2, 'gambar' => true, 'ai_mode' => 'GEMINI',
        ])->assertOk();
        $this->assertCount(1, $res->json('data'));
        $this->assertStringContainsString('1 dilewati', $res->json('message'));
        $soal = BankSoal::first();
        $this->assertSame(['DRAF', 'AI', 'GEMINI', 'MTR-T', 1.0, 0.5], [$soal->status, $soal->sumber, $soal->ai_mode, $soal->id_materi, $soal->dim_T, $soal->dim_N]);
        $this->assertStringNotContainsString('script', $soal->gambar_svg);
        Http::assertSent(fn($r) => str_contains($r->body(), 'Menentukan pecahan senilai'));

        // Penyedia tanpa API key memberi pesan yang jelas
        $this->postJson('/api/bank-soal/ai/draf', ['id_mapel' => 'MPL-A', 'bentuk' => 'PG', 'ai_mode' => 'DEEPSEEK'])
            ->assertUnprocessable()->assertJsonFragment(['message' => 'Penyedia AI DEEPSEEK belum diatur atau sedang gagal. Periksa API key di Pengaturan Sekolah, atau pilih penyedia lain.']);
    }

    public function test_impor_paket_soal_memasangkan_tp_yang_ada(): void
    {
        config(['services.ai_services.gemini_key' => 'kunci-uji']);
        $hasil = ['soal' => [
            ['pertanyaan' => '1/2 + 1/2 = ...', 'bentuk' => 'ISIAN', 'kunci' => ['jawaban' => ['1', 'satu']], 'id_indikator' => 'IND-T1'],
            ['pertanyaan' => 'Sebutkan dua contoh pecahan!', 'bentuk' => 'URAIAN', 'kunci' => ['jawaban' => '1/2 dan 3/4'], 'id_indikator' => 'TP-KARANGAN'],
        ]];
        Http::fake(['generativelanguage.googleapis.com/*' => Http::response(['candidates' => [['content' => ['parts' => [['text' => json_encode($hasil)]]]]]])]);

        $this->sebagai($this->sekolah->guruA)->postJson('/api/bank-soal/impor', [
            'id_mapel' => 'MPL-A', 'teks' => "1. 1/2 + 1/2 = ...\n2. Sebutkan dua contoh pecahan!", 'ai_mode' => 'GEMINI',
        ])->assertOk();
        $soal = BankSoal::orderBy('bentuk')->get();
        $this->assertSame(['IMPOR', 'IND-T1', 'MTR-T'], [$soal[0]->sumber, $soal[0]->id_indikator, $soal[0]->id_materi]);
        $this->assertNull($soal[1]->id_indikator); // TP karangan AI tidak dipakai

        // PDF/foto hanya untuk penyedia yang bisa membaca berkas
        $pdf = 'data:application/pdf;base64,' . base64_encode("%PDF-1.4\n%uji\n");
        $this->postJson('/api/bank-soal/impor', ['id_mapel' => 'MPL-A', 'berkas_base64' => $pdf, 'ai_mode' => 'DEEPSEEK'])
            ->assertUnprocessable()->assertJsonFragment(['message' => 'PDF dan foto hanya bisa dibaca dengan Gemini atau Claude. Pilih salah satunya, atau tempel teks soalnya.']);
    }

    public function test_kisi_kisi_per_tp_dan_soal_per_baris(): void
    {
        $res = $this->sebagai($this->sekolah->guruA)->postJson('/api/kisi-kisi', [
            'judul' => 'Ulangan Pecahan', 'id_mapel' => 'MPL-A', 'id_kelas' => 'KLS-A',
            'baris' => [
                ['id_indikator' => 'IND-T1', 'bentuk' => 'PG', 'level_kognitif' => 'C2', 'tingkat_kesulitan' => 'MUDAH', 'dimensi' => 'T', 'jumlah' => 3],
                ['id_indikator' => 'IND-T1', 'bentuk' => 'URAIAN', 'level_kognitif' => 'C4', 'tingkat_kesulitan' => 'SULIT', 'dimensi' => 'N', 'jumlah' => 1],
            ],
        ])->assertCreated();
        $id = $res->json('data.id_kisi');
        $baris = $res->json('data.baris.0.id');
        $this->postJson('/api/bank-soal', self::PG + ['id_kisi_baris' => $baris])->assertCreated();

        $kisi = $this->getJson("/api/kisi-kisi/{$id}")->assertOk();
        $this->assertSame('MTR-T', $kisi->json('data.baris.0.id_materi'));
        $this->assertCount(1, $kisi->json('data.baris.0.soal'));
        $this->assertSame(4, (int) $this->getJson('/api/kisi-kisi')->json('data.0.jumlah_soal_rencana'));

        $this->sebagai($this->sekolah->guruB)->getJson("/api/kisi-kisi/{$id}")->assertForbidden();
        $this->sebagai($this->sekolah->guruA)->deleteJson("/api/kisi-kisi/{$id}")->assertOk();
        $this->assertNull(BankSoal::first()->id_kisi_baris); // soal tetap ada
    }
}

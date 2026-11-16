<?php

namespace Tests\Feature;

use App\Models\BankSoal;
use App\Models\MasterIndikator;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request as HttpRequest;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;
use Laravel\Sanctum\Sanctum;
use Tests\Concerns\MembuatDataSekolah;
use Tests\TestCase;

/**
 * Variasi bank soal (Fase 24): varian AI dari soal disetujui, soal kembar dilewati/ditandai, dan cakupan per TP & level.
 */
class VarianSoalTest extends TestCase
{
    use RefreshDatabase, MembuatDataSekolah;

    protected function setUp(): void
    {
        parent::setUp();
        $this->buatSekolah();
        MasterIndikator::create(['id_indikator' => 'IND-T1', 'id_materi' => 'MTR-T', 'deskripsi' => 'Menjumlahkan pecahan berpenyebut sama', 'urutan' => 1, 'aktif' => true]);
        MasterIndikator::create(['id_indikator' => 'IND-T2', 'id_materi' => 'MTR-T', 'deskripsi' => 'Membandingkan pecahan', 'urutan' => 2, 'aktif' => true]);
        config(['services.ai_services.gemini_key' => 'uji']);
    }

    private function sebagai(User $u): static
    {
        Sanctum::actingAs($u);
        return $this;
    }

    private function soal(string $pertanyaan, array $pilihan, string $status = 'DISETUJUI', string $level = 'C2', string $tp = 'IND-T1', ?string $induk = null): BankSoal
    {
        return BankSoal::create(['id_soal' => 'SOAL-' . Str::uuid(), 'id_mapel' => 'MPL-A', 'id_kelas' => 'KLS-A', 'id_materi' => 'MTR-T', 'id_indikator' => $tp,
            'id_induk' => $induk, 'bentuk' => 'PG', 'level_kognitif' => $level, 'tingkat_kesulitan' => 'SEDANG', 'pertanyaan' => $pertanyaan,
            'isi' => ['pilihan' => $pilihan], 'kunci' => ['jawaban' => 0], 'skor_maks' => 1, 'status' => $status, 'sumber' => 'MANUAL',
            'dibuat_oleh' => $this->sekolah->guruA->id]);
    }

    private function pg(string $tanya, array $pilihan): array
    {
        return ['pertanyaan' => $tanya, 'bentuk' => 'URAIAN', 'level_kognitif' => 'C1', 'isi' => ['pilihan' => $pilihan], 'kunci' => ['jawaban' => 0], 'pembahasan' => 'ok'];
    }

    public function test_varian_ai_dari_soal_disetujui_tersimpan_sebagai_draf_dan_kembar_dilewati(): void
    {
        $induk = $this->soal('Ibu membeli 1/4 kg gula lalu 2/4 kg lagi. Berapa kg gula ibu sekarang?', ['3/4', '3/8', '2/4', '1/4']);
        Http::fake(['generativelanguage.googleapis.com/*' => Http::response(['candidates' => [['content' => ['parts' => [['text' => json_encode(['soal' => [
            $this->pg('Ayah memotong 2/6 bagian kue lalu 3/6 bagian lagi. Berapa bagian kue yang dipotong ayah?', ['5/6', '5/12', '1/6', '6/6']),
            // kembar dengan induk (hanya satu kata berbeda)
            $this->pg('Ibu membeli 1/4 kg gula lalu 2/4 kg lagi. Berapa kg gula ibu saat ini?', ['3/4', '3/8', '2/4', '1/4']),
            $this->pg('Siti menuang 1/5 liter susu lalu 3/5 liter lagi. Berapa liter susu yang dituang Siti?', ['4/5', '4/10', '2/5', '1/5']),
        ]])]]]]]])]);

        $r = $this->sebagai($this->sekolah->guruA)->postJson("/api/bank-soal/{$induk->id_soal}/varian", ['jenis' => 'LEVEL', 'target_level' => 'C3', 'jumlah' => 3, 'ai_mode' => 'GEMINI'])
            ->assertOk();
        $this->assertCount(2, $r->json('data'));
        $this->assertStringContainsString('1 dilewati karena terlalu mirip', $r->json('message'));
        $varian = BankSoal::where('id_induk', $induk->id_soal)->get();
        $this->assertCount(2, $varian);
        foreach ($varian as $v) {
            $this->assertSame(['DRAF', 'PG', 'C3', 'LEVEL', 'IND-T1', 'AI'], [$v->status, $v->bentuk, $v->level_kognitif, $v->jenis_varian, $v->id_indikator, $v->sumber]);
        }
        Http::assertSent(fn(HttpRequest $q) => str_contains($q->body(), 'Ubah level kognitif menjadi C3') && str_contains($q->body(), 'kg gula lalu'));

        // Soal yang belum disetujui tidak bisa divariasikan; guru lain (bukan pengampu) ditolak
        $draf = $this->soal('Draf soal pecahan', ['a', 'b', 'c', 'd'], 'DRAF');
        $this->postJson("/api/bank-soal/{$draf->id_soal}/varian", ['jenis' => 'ANGKA', 'ai_mode' => 'GEMINI'])->assertUnprocessable();
        $this->postJson("/api/bank-soal/{$induk->id_soal}/varian", ['jenis' => 'KESULITAN', 'ai_mode' => 'GEMINI'])->assertJsonValidationErrors('target_kesulitan');
        $this->sebagai($this->sekolah->guruB)->postJson("/api/bank-soal/{$induk->id_soal}/varian", ['jenis' => 'ANGKA', 'ai_mode' => 'GEMINI'])->assertNotFound();
    }

    public function test_soal_kembar_ditandai_dan_cakupan_per_tp_dan_level(): void
    {
        $a = $this->soal('Manakah pecahan yang senilai dengan setengah?', ['2/4', '1/3', '2/3', '3/5']);
        $this->soal('Manakah pecahan yang senilai dengan setengah ?', ['2/4', '1/3', '2/3', '3/5'], 'DRAF');
        $this->soal('Urutkan pecahan 1/2, 1/4, 3/4 dari yang terkecil.', ['1/4, 1/2, 3/4', '3/4, 1/2, 1/4', '1/2, 1/4, 3/4', '1/4, 3/4, 1/2'], 'DISETUJUI', 'C3', 'IND-T2', $a->id_soal);
        $this->soal('Hasil 1/3 + 1/3 adalah …', ['2/3', '2/6', '1/3', '1/9'], 'DISETUJUI', 'C3');

        $this->sebagai($this->sekolah->guruA);
        $kembar = $this->getJson('/api/bank-soal/kembar?id_mapel=MPL-A')->assertOk();
        $this->assertCount(1, $kembar->json('data'));
        $this->assertSame(1.0, (float) $kembar->json('data.0.skor'));

        $c = $this->getJson('/api/bank-soal/cakupan?id_mapel=MPL-A&target=2')->assertOk();
        $baris = collect($c->json('data'))->keyBy('id_indikator');
        $this->assertSame(['C1' => 0, 'C2' => 1, 'C3' => 1, 'C4' => 0, 'C5' => 0, 'C6' => 0], $baris['IND-T1']['per_level']);
        $this->assertSame([2, 1, 0], [$baris['IND-T1']['disetujui'], $baris['IND-T1']['diproses'], $baris['IND-T1']['kurang']]);
        $this->assertSame([1, 1, 1], [$baris['IND-T2']['disetujui'], $baris['IND-T2']['varian'], $baris['IND-T2']['kurang']]);
        $this->assertSame(['tp' => 2, 'cukup' => 1, 'target' => 2], $c->json('ringkasan'));

        $this->sebagai($this->sekolah->guruB)->getJson('/api/bank-soal/cakupan?id_mapel=MPL-A')->assertForbidden();
    }
}

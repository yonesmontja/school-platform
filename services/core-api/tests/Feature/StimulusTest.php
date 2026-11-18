<?php

namespace Tests\Feature;

use App\Models\BankSoal;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\Concerns\MembuatDataSekolah;
use Tests\TestCase;

/**
 * CBT Tahap B: stimulus AKM bersama (satu bacaan untuk beberapa soal) yang ikut tersalin ke paket, tetap berdampingan
 * saat soal diacak, tampil ke siswa, dan laporan level kompetensi (per domain, kelas, level kognitif) di analisis paket.
 */
class StimulusTest extends TestCase
{
    use RefreshDatabase, MembuatDataSekolah;

    protected function setUp(): void
    {
        parent::setUp();
        $this->buatSekolah();
    }

    private function sebagai(User $user): static
    {
        Sanctum::actingAs($user);
        return $this;
    }

    private function soal(string $pertanyaan, ?string $stimulus, string $level = 'C2'): string
    {
        $id = $this->postJson('/api/bank-soal', [
            'id_mapel' => 'MPL-A', 'bentuk' => 'PG', 'level_kognitif' => $level, 'tingkat_kesulitan' => 'SEDANG',
            'pertanyaan' => $pertanyaan, 'isi' => ['pilihan' => ['Benar', 'Salah', 'Ragu']], 'kunci' => ['jawaban' => 0], 'id_stimulus' => $stimulus,
        ])->assertCreated()->json('data.id_soal');
        BankSoal::whereKey($id)->update(['status' => 'DISETUJUI']);
        return $id;
    }

    private function stimulus(array $extra = []): string
    {
        return $this->postJson('/api/stimulus', $extra + [
            'id_mapel' => 'MPL-A', 'judul' => 'Kebun Pak Yosias', 'jenis' => 'LITERASI_INFORMASI', 'konteks' => 'SOSIAL_BUDAYA',
            'konten' => '<p>Pak Yosias menanam ubi di Wamena.</p><table><tr><th>Bulan</th><th>Panen</th></tr><tr><td>Mei</td><td>40 kg</td></tr></table><script>alert(1)</script>',
            'sumber_teks' => 'Karangan guru',
        ])->assertCreated()->json('data.id_stimulus');
    }

    public function test_stimulus_dibersihkan_dibatasi_per_mapel_dan_tidak_bisa_dihapus_saat_dipakai(): void
    {
        $s = $this->sekolah;
        $this->sebagai($s->guruA);
        $id = $this->stimulus();
        $data = $this->getJson("/api/stimulus/{$id}")->assertOk()->json('data');
        $this->assertStringContainsString('<table>', $data['konten']);
        $this->assertStringNotContainsString('script', $data['konten']);

        // Guru B (mengampu IPA) tidak melihat dan tidak bisa membuat stimulus Matematika
        $this->sebagai($s->guruB)->getJson('/api/stimulus')->assertOk()->assertJsonCount(0, 'data');
        $this->getJson("/api/stimulus/{$id}")->assertForbidden();
        $this->postJson('/api/stimulus', ['id_mapel' => 'MPL-A', 'judul' => 'X', 'jenis' => 'NUMERASI', 'konteks' => 'PERSONAL', 'konten' => 'x'])->assertForbidden();
        $ipa = $this->postJson('/api/stimulus', ['id_mapel' => 'MPL-B', 'judul' => 'Daur air', 'jenis' => 'LITERASI_INFORMASI', 'konteks' => 'SAINTIFIK', 'konten' => 'Air menguap.'])
            ->assertCreated()->json('data.id_stimulus');
        $this->putJson("/api/stimulus/{$id}", ['id_mapel' => 'MPL-A', 'judul' => 'Ubah', 'jenis' => 'NUMERASI', 'konteks' => 'PERSONAL', 'konten' => 'x'])->assertForbidden();

        // Soal Matematika tidak boleh memakai stimulus IPA
        $this->sebagai($s->guruA)->postJson('/api/bank-soal', ['id_mapel' => 'MPL-A', 'bentuk' => 'PG', 'level_kognitif' => 'C2', 'tingkat_kesulitan' => 'SEDANG',
            'pertanyaan' => 'Q', 'isi' => ['pilihan' => ['a', 'b', 'c']], 'kunci' => ['jawaban' => 0], 'id_stimulus' => $ipa])->assertUnprocessable()->assertJsonValidationErrors('id_stimulus');

        $this->soal('Apa yang ditanam?', $id);
        $this->getJson("/api/bank-soal?id_stimulus={$id}")->assertOk()->assertJsonPath('meta.total', 1)->assertJsonPath('data.0.stimulus.judul', 'Kebun Pak Yosias');
        $this->getJson('/api/stimulus')->assertJsonPath('data.0.soal_count', 1);
        $this->deleteJson("/api/stimulus/{$id}")->assertUnprocessable();
    }

    public function test_paket_mengelompokkan_soal_stimulus_dan_analisis_memuat_level_kompetensi(): void
    {
        $s = $this->sekolah;
        $this->sebagai($s->guruA);
        $lit = $this->stimulus();
        $num = $this->stimulus(['judul' => 'Harga noken', 'jenis' => 'NUMERASI', 'konteks' => 'PERSONAL', 'konten' => '<p>Satu noken Rp50.000.</p>']);
        $a1 = $this->soal('Lit 1', $lit, 'C1');
        $tanpa = $this->soal('Tanpa stimulus', null, 'C3');
        $n1 = $this->soal('Num 1', $num, 'C3');
        $a2 = $this->soal('Lit 2', $lit, 'C4');
        $n2 = $this->soal('Num 2', $num, 'C4');

        $paket = $this->postJson('/api/paket-soal', ['judul' => 'AKM Kelas 4', 'id_mapel' => 'MPL-A', 'id_kelas' => 'KLS-A', 'id_jenis' => 'JNS-T', 'tanggal' => '2030-03-02'])->json('data.id_paket');
        $butir = collect($this->postJson("/api/paket-soal/{$paket}/butir", ['id_soal' => [$a1, $tanpa, $n1, $a2, $n2]])->assertOk()->json('data.butir'));
        // Soal satu stimulus dikumpulkan di tempat soal pertamanya
        $this->assertSame([$a1, $a2, $tanpa, $n1, $n2], $butir->sortBy('urutan')->pluck('id_soal')->all());
        $this->assertSame('Kebun Pak Yosias', $butir->firstWhere('id_soal', $a1)['soal']['stimulus']['judul']);

        // Susunan manual yang memisahkan soal stimulus dirapikan lagi
        $idB = $butir->pluck('id', 'id_soal');
        $this->putJson("/api/paket-soal/{$paket}/butir", ['butir' => collect([$n1, $a1, $tanpa, $a2, $n2])->map(fn($x) => ['id' => $idB[$x], 'skor_maks' => 1])->all()])->assertOk();
        $this->assertSame([$n1, $n2, $a1, $a2, $tanpa], collect($this->getJson("/api/paket-soal/{$paket}")->json('data.butir'))->sortBy('urutan')->pluck('id_soal')->all());

        $this->putJson("/api/paket-soal/{$paket}/online", ['online' => true, 'durasi_menit' => 30, 'acak_soal' => true])->assertOk();
        $soal = collect($this->sebagai($s->siswa)->postJson("/api/ujian/{$paket}/mulai")->assertOk()->json('data.soal'));
        // Diacak per kelompok: soal satu stimulus tetap berdampingan, konten stimulus ikut, kunci tidak
        $urut = $soal->pluck('stimulus.id_stimulus')->all();
        foreach ([$lit, $num] as $st) {
            $pos = array_keys(array_filter($urut, fn($x) => $x === $st));
            $this->assertCount(2, $pos);
            $this->assertSame(1, $pos[1] - $pos[0]);
        }
        $pertama = $soal->firstWhere('stimulus.id_stimulus', $lit);
        $this->assertStringContainsString('Wamena', $pertama['stimulus']['konten']);
        $this->assertArrayNotHasKey('kunci', $pertama);

        // Siswa benar semua literasi, salah semua numerasi, benar soal tanpa stimulus → 3/5 = 60% (Cakap)
        // Jawaban PG dikirim sebagai indeks pilihan asli (kunci = 0)
        $jawab = $soal->mapWithKeys(fn($q) => [$q['id'] => ($q['stimulus']['jenis'] ?? null) === 'NUMERASI' ? 1 : 0]);
        $this->postJson("/api/ujian/{$paket}/selesai", ['jawaban' => $jawab->all()])->assertOk();

        $k = $this->sebagai($s->guruA)->getJson("/api/paket-soal/{$paket}/analisis")->assertOk()->json('data.kompetensi');
        $this->assertSame(1, $k['sebaran']['CAKAP']);
        $this->assertSame('CAKAP', $k['siswa'][0]['level']);
        $this->assertSame('4A', $k['siswa'][0]['kelas']);
        $domain = collect($k['domain'])->keyBy('domain');
        $this->assertEquals(100, $domain['LITERASI']['rata']);
        $this->assertSame(1, $domain['LITERASI']['sebaran']['MAHIR']);
        $this->assertEquals(0, $domain['NUMERASI']['rata']);
        $this->assertSame(1, $domain['NUMERASI']['sebaran']['PERLU_INTERVENSI']);
        $this->assertSame(['C1', 'C3', 'C4'], collect($k['level_kognitif'])->pluck('level')->all());
        $this->assertSame('4A', $k['per_kelas'][0]['kelas']);
        $this->assertCount(2, $k['stimulus']);
    }
}

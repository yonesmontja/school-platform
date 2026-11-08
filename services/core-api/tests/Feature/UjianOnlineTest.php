<?php

namespace Tests\Feature;

use App\Models\BankSoal;
use App\Models\MasterIndikator;
use App\Models\PaketSoal;
use App\Models\PaketSoalJawaban;
use App\Models\TransNilai;
use App\Models\User;
use App\Services\PaketSoalService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Laravel\Sanctum\Sanctum;
use Tests\Concerns\MembuatDataSekolah;
use Tests\TestCase;

/**
 * Tes online (Fase 16 Tahap C): siswa mengerjakan paket di HP dengan token, urutan acak, batas waktu server,
 * simpan otomatis; soal interaktif (menjodohkan, mengurutkan, melengkapi gambar) dinilai otomatis;
 * guru memantau, mengakhiri sesi, lalu nilai mengalir ke koreksi, Input Nilai, dan analisis.
 */
class UjianOnlineTest extends TestCase
{
    use RefreshDatabase, MembuatDataSekolah;

    private string $paket;
    private array $b = [];

    protected function setUp(): void
    {
        parent::setUp();
        $this->buatSekolah();
        MasterIndikator::create(['id_indikator' => 'IND-1', 'id_materi' => 'MTR-T', 'deskripsi' => 'Pecahan senilai', 'urutan' => 1]);
        $buat = fn(array $d) => BankSoal::create($d + [
            'id_soal' => 'SOAL-' . Str::uuid(), 'id_mapel' => 'MPL-A', 'id_materi' => 'MTR-T', 'id_indikator' => 'IND-1',
            'level_kognitif' => 'C2', 'tingkat_kesulitan' => 'SEDANG', 'dim_T' => 1, 'status' => 'DISETUJUI', 'sumber' => 'MANUAL',
            'dibuat_oleh' => $this->sekolah->guruA->id, 'skor_maks' => 1,
        ])->id_soal;
        $soal = [
            'pg' => $buat(['bentuk' => 'PG', 'pertanyaan' => '1/2 = ?', 'isi' => ['pilihan' => ['2/4', '1/3', '3/4', '1/5']], 'kunci' => ['jawaban' => 0]]),
            'jodoh' => $buat(['bentuk' => 'MENJODOHKAN', 'pertanyaan' => 'Pasangkan', 'isi' => ['pasangan' => [['kiri' => '1/2', 'kanan' => '2/4'], ['kiri' => '1/3', 'kanan' => '2/6'], ['kiri' => '1/4', 'kanan' => '2/8']]], 'kunci' => [], 'skor_maks' => 3]),
            'urut' => $buat(['bentuk' => 'MENGURUTKAN', 'pertanyaan' => 'Urutkan dari terkecil', 'isi' => ['urutan' => ['1/8', '1/4', '1/2', '1']], 'kunci' => [], 'skor_maks' => 4]),
            'gambar' => $buat(['bentuk' => 'LENGKAPI_GAMBAR', 'pertanyaan' => 'Lengkapi', 'gambar_svg' => '<svg xmlns="http://www.w3.org/2000/svg"/>', 'isi' => ['bank_kata' => ['pembilang', 'penyebut', 'pecahan']], 'kunci' => ['jawaban' => [['pembilang'], ['penyebut']]], 'skor_maks' => 2]),
            'uraian' => $buat(['bentuk' => 'URAIAN', 'pertanyaan' => 'Jelaskan', 'isi' => [], 'kunci' => ['jawaban' => 'x'], 'skor_maks' => 4]),
        ];
        Sanctum::actingAs($this->sekolah->guruA);
        $this->paket = $this->postJson('/api/paket-soal', ['judul' => 'Tes Pecahan', 'id_mapel' => 'MPL-A', 'id_kelas' => 'KLS-A', 'id_jenis' => 'JNS-T', 'tanggal' => '2030-03-02', 'durasi_menit' => 30])->json('data.id_paket');
        $butir = $this->postJson("/api/paket-soal/{$this->paket}/butir", ['id_soal' => array_values($soal)])->json('data.butir');
        foreach ($butir as $x) $this->b[array_search($x['id_soal'], $soal, true)] = (string) $x['id'];
    }

    private function sebagai(User $user): static
    {
        Sanctum::actingAs($user);
        return $this;
    }

    private function buka(array $extra = []): void
    {
        $this->sebagai($this->sekolah->guruA)->putJson("/api/paket-soal/{$this->paket}/online", $extra + [
            'online' => true, 'durasi_menit' => 30, 'acak_soal' => true, 'acak_pilihan' => true, 'token' => 'abc12', 'tampilkan_nilai' => true,
        ])->assertOk();
    }

    public function test_siswa_mengerjakan_dengan_token_tanpa_melihat_kunci(): void
    {
        $this->sebagai($this->sekolah->siswa)->getJson('/api/ujian')->assertOk()->assertJsonCount(0, 'data'); // belum dibuka
        $this->buka();
        $this->sebagai($this->sekolah->siswa)->getJson('/api/ujian')->assertJsonPath('data.0.status', 'TERSEDIA')->assertJsonPath('data.0.butuh_token', true);
        $this->sebagai($this->sekolah->guruA)->getJson('/api/ujian')->assertForbidden();

        $this->sebagai($this->sekolah->siswa)->postJson("/api/ujian/{$this->paket}/mulai", ['token' => 'salah'])->assertUnprocessable();
        $res = $this->postJson("/api/ujian/{$this->paket}/mulai", ['token' => 'ABC12'])->assertOk()->assertJsonPath('data.status', 'MENGERJAKAN');
        $this->assertStringNotContainsString('kunci', $res->getContent());
        $this->assertStringNotContainsString('"pembilang"]]', $res->getContent());
        $soal = collect($res->json('data.soal'))->keyBy('bentuk');
        $this->assertCount(5, $soal);
        $this->assertEqualsCanonicalizing([0, 1, 2, 3], array_column($soal['PG']['pilihan'], 'i'));
        $this->assertNotSame([0, 1, 2, 3], array_column($soal['MENGURUTKAN']['langkah'], 'i')); // tidak pernah tampil sudah urut
        $this->assertSame(2, $soal['LENGKAPI_GAMBAR']['jumlah_bagian']);
        $this->assertGreaterThan(1700, $res->json('data.sisa_detik'));

        // Membuka ulang melanjutkan sesi yang sama dengan urutan yang sama
        $lagi = $this->postJson("/api/ujian/{$this->paket}/mulai", ['token' => 'abc12'])->assertOk();
        $this->assertSame(array_column($res->json('data.soal'), 'id'), array_column($lagi->json('data.soal'), 'id'));

        // Simpan otomatis (berangsur) lalu kumpulkan
        $this->putJson("/api/ujian/{$this->paket}/jawaban", ['jawaban' => [$this->b['pg'] => 0, $this->b['jodoh'] => [0, 2, 1]], 'pelanggaran' => 1])->assertOk();
        $this->putJson("/api/ujian/{$this->paket}/jawaban", ['jawaban' => [$this->b['urut'] => [0, 1, 3, 2], $this->b['gambar'] => ['Pembilang', 'pecahan'], $this->b['uraian'] => 'Karena dibagi dua']])->assertOk();
        $hasil = $this->postJson("/api/ujian/{$this->paket}/selesai")->assertOk();
        $hasil->assertJsonPath('data.status', 'SELESAI')->assertJsonPath('data.menunggu_guru', true)->assertJsonPath('data.nilai', null);
        $this->putJson("/api/ujian/{$this->paket}/jawaban", ['jawaban' => [$this->b['pg'] => 1]])->assertUnprocessable();

        $j = PaketSoalJawaban::where('id_paket', $this->paket)->first();
        // pg 1 + jodoh 1/3×3=1 + urut 2/4×4=2 + gambar 1/2×2=1 ; uraian menunggu guru
        $this->assertEquals([1, 1, 2, 1], [$j->skor[$this->b['pg']], $j->skor[$this->b['jodoh']], $j->skor[$this->b['urut']], $j->skor[$this->b['gambar']]]);
        $this->assertSame([false, 1, 'ONLINE'], [$j->lengkap, $j->pelanggaran, $j->sumber]);

        // Guru menilai uraian di koreksi, siswa lalu melihat nilainya
        $this->sebagai($this->sekolah->guruA)->putJson("/api/paket-soal/{$this->paket}/jawaban", ['records' => [
            ['id_siswa' => 'SIS-1', 'jawaban' => $j->jawaban, 'skor_manual' => [$this->b['uraian'] => 3]],
        ]])->assertOk()->assertJsonPath('data.SIS-1.lengkap', true);
        $this->sebagai($this->sekolah->siswa)->getJson('/api/ujian')->assertJsonPath('data.0.nilai', 57.14)->assertJsonPath('data.0.status', 'SELESAI');
    }

    public function test_batas_waktu_dari_server(): void
    {
        $this->buka(['token' => null, 'durasi_menit' => 10]);
        $this->sebagai($this->sekolah->siswa)->postJson("/api/ujian/{$this->paket}/mulai")->assertOk();
        $this->putJson("/api/ujian/{$this->paket}/jawaban", ['jawaban' => [$this->b['pg'] => 0]])->assertOk();

        $this->travel(11)->minutes();
        $this->putJson("/api/ujian/{$this->paket}/jawaban", ['jawaban' => [$this->b['pg'] => 1]])->assertUnprocessable();
        $this->getJson("/api/ujian/{$this->paket}")->assertJsonPath('data.status', 'SELESAI');
        $j = PaketSoalJawaban::where('id_paket', $this->paket)->first();
        $this->assertSame(0, $j->jawaban[$this->b['pg']]); // jawaban setelah waktu habis tidak tercatat
        $this->assertNotNull($j->selesai_pada);
        $this->postJson("/api/ujian/{$this->paket}/mulai")->assertUnprocessable(); // tidak bisa mengulang

        // Jadwal tutup paket juga membatasi
        $this->sebagai($this->sekolah->guruA)->putJson("/api/paket-soal/{$this->paket}/online", ['online' => true, 'online_mulai' => now()->addHour()->toIso8601String(), 'online_selesai' => now()->addHours(2)->toIso8601String()])->assertOk();
        $this->deleteJson("/api/paket-soal/{$this->paket}/jawaban/SIS-1")->assertOk(); // guru mengizinkan mengulang
        $this->sebagai($this->sekolah->siswa)->getJson('/api/ujian')->assertJsonPath('data.0.status', 'BELUM_DIBUKA');
        $this->postJson("/api/ujian/{$this->paket}/mulai")->assertUnprocessable();
    }

    public function test_guru_memantau_dan_sesi_berjalan_tidak_ikut_nilai(): void
    {
        $this->buka(['token' => null]);
        $this->sebagai($this->sekolah->siswa)->postJson("/api/ujian/{$this->paket}/mulai")->assertOk();
        $this->putJson("/api/ujian/{$this->paket}/jawaban", ['jawaban' => [$this->b['pg'] => 0, $this->b['uraian'] => 'a'], 'pelanggaran' => 2])->assertOk();

        $pantau = collect($this->sebagai($this->sekolah->guruA)->getJson("/api/paket-soal/{$this->paket}/pantau")->assertOk()->json('data'))->keyBy('id_siswa');
        $this->assertSame(['MENGERJAKAN', 2, 2], [$pantau['SIS-1']['status'], $pantau['SIS-1']['terjawab'], $pantau['SIS-1']['pelanggaran']]);
        $this->assertSame('BELUM', $pantau['SIS-2']['status']);
        $this->sebagai($this->sekolah->guruB)->getJson("/api/paket-soal/{$this->paket}/pantau")->assertForbidden();

        // Selama dikerjakan: guru tidak bisa menimpa jawaban, dan nilainya tidak dikirim
        $this->sebagai($this->sekolah->guruA)->putJson("/api/paket-soal/{$this->paket}/jawaban", ['records' => [['id_siswa' => 'SIS-1', 'skor_manual' => [$this->b['uraian'] => 4]]]])->assertUnprocessable();
        $this->postJson("/api/paket-soal/{$this->paket}/kirim-nilai")->assertUnprocessable();

        $this->postJson("/api/paket-soal/{$this->paket}/jawaban/SIS-1/akhiri")->assertOk();
        $this->putJson("/api/paket-soal/{$this->paket}/jawaban", ['records' => [['id_siswa' => 'SIS-1',
            'jawaban' => PaketSoalJawaban::first()->jawaban, 'skor_manual' => [$this->b['uraian'] => 4]]]])->assertOk();
        $kirim = $this->postJson("/api/paket-soal/{$this->paket}/kirim-nilai");
        $kirim->assertOk();
        $this->assertSame(1, TransNilai::count());
        $this->getJson("/api/paket-soal/{$this->paket}/analisis")->assertJsonPath('data.jumlah_siswa', 1);
    }

    public function test_bentuk_melengkapi_gambar_dan_jawaban_interaktif(): void
    {
        $dasar = ['id_mapel' => 'MPL-A', 'bentuk' => 'LENGKAPI_GAMBAR', 'level_kognitif' => 'C1', 'tingkat_kesulitan' => 'MUDAH', 'pertanyaan' => 'Lengkapi bagian bunga'];
        $this->postJson('/api/bank-soal', $dasar + ['kunci' => ['jawaban' => ['kelopak / mahkota', 'putik']]])->assertCreated()
            ->assertJsonPath('data.kunci.jawaban.0', ['kelopak', 'mahkota'])->assertJsonPath('data.skor_maks', 2);
        $this->postJson('/api/bank-soal', $dasar + ['isi' => ['bank_kata' => ['putik', 'akar']], 'kunci' => ['jawaban' => ['kelopak']]])->assertUnprocessable();

        $gambar = ['bentuk' => 'LENGKAPI_GAMBAR', 'isi' => [], 'kunci' => ['jawaban' => [['kelopak'], ['putik']]]];
        $this->assertSame(['kelopak', 'Putik'], PaketSoalService::dariTeks($gambar, 'kelopak; Putik'));
        $this->assertEquals(2.0, PaketSoalService::skorOtomatis($gambar, ['Kelopak.', 'putik'], 2));
        $jodoh = ['bentuk' => 'MENJODOHKAN', 'isi' => ['pasangan' => [[], [], []]]];
        $this->assertNull(PaketSoalService::skorOtomatis($jodoh, '1-A, 2-C', 3)); // kertas: dinilai guru
        $this->assertSame([2, null, 0], PaketSoalService::normalisasiJawaban($jodoh, [2, 9, 0]));
    }

    public function test_membaca_nyaring_merekam_suara_dan_dinilai_guru(): void
    {
        \Illuminate\Support\Facades\Storage::fake('public');
        $idSoal = BankSoal::create([
            'id_soal' => 'SOAL-' . Str::uuid(), 'id_mapel' => 'MPL-A', 'id_materi' => 'MTR-T', 'bentuk' => 'MEMBACA_NYARING', 'level_kognitif' => 'C3',
            'tingkat_kesulitan' => 'SEDANG', 'status' => 'DISETUJUI', 'sumber' => 'MANUAL', 'dibuat_oleh' => $this->sekolah->guruA->id, 'skor_maks' => 4,
            'pertanyaan' => 'Bacalah dengan nyaring', 'isi' => ['teks' => 'Ani pergi ke pasar membeli sayur.'], 'kunci' => [], 'rubrik' => '4: lancar',
        ])->id_soal;
        // Bentuk baru tervalidasi saat guru menyimpan soal
        $this->sebagai($this->sekolah->guruA)->postJson('/api/bank-soal', ['id_mapel' => 'MPL-A', 'bentuk' => 'MEMBACA_NYARING', 'level_kognitif' => 'C3',
            'tingkat_kesulitan' => 'SEDANG', 'pertanyaan' => 'Bacalah', 'isi' => ['teks' => 'pendek'], 'kunci' => []])->assertUnprocessable();

        $id = $this->postJson('/api/paket-soal', ['judul' => 'Membaca', 'id_mapel' => 'MPL-A', 'id_kelas' => 'KLS-A', 'id_jenis' => 'JNS-T', 'tanggal' => '2030-03-02'])->json('data.id_paket');
        $idB = (string) $this->postJson("/api/paket-soal/{$id}/butir", ['id_soal' => [$idSoal]])->json('data.butir.0.id');
        $this->putJson("/api/paket-soal/{$id}/online", ['online' => true, 'durasi_menit' => 10])->assertOk();

        $this->sebagai($this->sekolah->siswa)->postJson("/api/ujian/{$id}/mulai")->assertOk()->assertJsonPath('data.soal.0.teks', 'Ani pergi ke pasar membeli sayur.');
        $wav = 'RIFF' . pack('V', 36) . 'WAVEfmt ' . pack('VvvVVvv', 16, 1, 1, 8000, 8000, 1, 8) . 'data' . pack('V', 0);
        $url1 = $this->postJson("/api/ujian/{$id}/rekaman", ['id_butir' => (int) $idB, 'audio_base64' => 'data:audio/wav;base64,' . base64_encode($wav)])->assertOk()->json('url');
        $this->assertStringStartsWith("/storage/rekaman/{$id}_SIS-1_", $url1);
        // Rekam ulang mengganti berkas lama; bukan audio ditolak; url tidak bisa dipalsukan lewat simpan jawaban
        $url2 = $this->postJson("/api/ujian/{$id}/rekaman", ['id_butir' => (int) $idB, 'audio_base64' => base64_encode($wav)])->json('url');
        \Illuminate\Support\Facades\Storage::disk('public')->assertMissing(Str::after($url1, '/storage/'));
        $this->postJson("/api/ujian/{$id}/rekaman", ['id_butir' => (int) $idB, 'audio_base64' => base64_encode('bukan audio')])->assertUnprocessable();
        $this->putJson("/api/ujian/{$id}/jawaban", ['jawaban' => [$idB => '/storage/rekaman/orang_lain.webm']])->assertOk();
        $this->postJson("/api/ujian/{$id}/selesai")->assertOk();

        $j = PaketSoalJawaban::where('id_paket', $id)->where('id_siswa', 'SIS-1')->first();
        $this->assertSame($url2, $j->jawaban[$idB]);
        $this->assertFalse($j->lengkap); // menunggu skor guru

        $this->sebagai($this->sekolah->guruA)->putJson("/api/paket-soal/{$id}/jawaban", ['records' => [['id_siswa' => 'SIS-1', 'jawaban' => $j->jawaban, 'skor_manual' => [$idB => 3]]]])->assertOk();
        $this->assertEquals(75, $j->fresh()->nilai);
        // Menghapus jawaban (Ulang) ikut menghapus rekaman
        $this->deleteJson("/api/paket-soal/{$id}/jawaban/SIS-1")->assertOk();
        \Illuminate\Support\Facades\Storage::disk('public')->assertMissing(Str::after($url2, '/storage/'));
    }
}

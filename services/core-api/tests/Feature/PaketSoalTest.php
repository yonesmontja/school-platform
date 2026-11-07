<?php

namespace Tests\Feature;

use App\Models\BankSoal;
use App\Models\KisiKisi;
use App\Models\KisiKisiBaris;
use App\Models\MasterIndikator;
use App\Models\PaketSoal;
use App\Models\TransNilai;
use App\Models\User;
use App\Services\PaketSoalService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Laravel\Sanctum\Sanctum;
use Tests\Concerns\MembuatDataSekolah;
use Tests\TestCase;

/**
 * Paket soal (Fase 16 Tahap B): susun dari soal yang disetujui, koreksi (otomatis + skor guru),
 * kirim nilai per TP ke Input Nilai, analisis butir, dan baca foto lembar jawaban (respons AI ditiru).
 */
class PaketSoalTest extends TestCase
{
    use RefreshDatabase, MembuatDataSekolah;

    private array $soal = [];

    protected function setUp(): void
    {
        parent::setUp();
        $this->buatSekolah();
        MasterIndikator::create(['id_indikator' => 'IND-1', 'id_materi' => 'MTR-T', 'deskripsi' => 'Menentukan pecahan senilai', 'urutan' => 1]);
        MasterIndikator::create(['id_indikator' => 'IND-2', 'id_materi' => 'MTR-T', 'deskripsi' => 'Membandingkan pecahan', 'urutan' => 2]);

        $buat = fn(array $d, string $status = 'DISETUJUI') => BankSoal::create($d + [
            'id_soal' => 'SOAL-' . Str::uuid(), 'id_mapel' => 'MPL-A', 'id_materi' => 'MTR-T', 'level_kognitif' => 'C2',
            'tingkat_kesulitan' => 'SEDANG', 'dim_T' => 1, 'dim_N' => 0.5, 'status' => $status, 'sumber' => 'MANUAL',
            'dibuat_oleh' => $this->sekolah->guruA->id, 'skor_maks' => 1,
        ])->id_soal;
        $this->soal = [
            'pg' => $buat(['id_indikator' => 'IND-1', 'bentuk' => 'PG', 'pertanyaan' => '1/2 senilai dengan', 'isi' => ['pilihan' => ['2/4', '1/3', '3/4']], 'kunci' => ['jawaban' => 0]]),
            'kompleks' => $buat(['id_indikator' => 'IND-1', 'bentuk' => 'PG_KOMPLEKS', 'pertanyaan' => 'Pilih yang senilai 1/2', 'isi' => ['pilihan' => ['2/4', '3/6', '1/3', '2/5']], 'kunci' => ['jawaban' => [0, 1]], 'skor_maks' => 2]),
            'bs' => $buat(['id_indikator' => 'IND-2', 'bentuk' => 'BENAR_SALAH', 'pertanyaan' => 'Benar atau salah', 'isi' => ['pernyataan' => ['1/2 > 1/3', '1/4 > 1/2']], 'kunci' => ['jawaban' => [true, false]], 'skor_maks' => 2]),
            'isian' => $buat(['id_indikator' => 'IND-2', 'bentuk' => 'ISIAN', 'pertanyaan' => '0,5 dalam desimal', 'isi' => [], 'kunci' => ['jawaban' => ['0.5']]]),
            'uraian' => $buat(['id_indikator' => 'IND-2', 'bentuk' => 'URAIAN', 'pertanyaan' => 'Jelaskan', 'isi' => [], 'kunci' => ['jawaban' => 'contoh'], 'skor_maks' => 4]),
            'draf' => $buat(['id_indikator' => 'IND-1', 'bentuk' => 'PG', 'pertanyaan' => 'Belum disetujui', 'isi' => ['pilihan' => ['a', 'b', 'c']], 'kunci' => ['jawaban' => 1]], 'DRAF'),
        ];
    }

    private function sebagai(User $user): static
    {
        Sanctum::actingAs($user);
        return $this;
    }

    private function buatPaket(array $extra = []): array
    {
        $res = $this->sebagai($this->sekolah->guruA)->postJson('/api/paket-soal', $extra + [
            'judul' => 'PH Pecahan', 'id_mapel' => 'MPL-A', 'id_kelas' => 'KLS-A', 'id_jenis' => 'JNS-T', 'tanggal' => '2030-03-02',
        ])->assertCreated();
        $id = $res->json('data.id_paket');
        $paket = $this->postJson("/api/paket-soal/{$id}/butir", ['id_soal' => array_values($this->soal)])->assertOk()->json('data');
        return [$id, collect($paket['butir'])->keyBy(fn($b) => array_search($b['id_soal'], $this->soal, true))->map(fn($b) => (string) $b['id'])];
    }

    public function test_paket_hanya_berisi_soal_disetujui_dan_milik_guru_pengampu(): void
    {
        [$id, $butir] = $this->buatPaket();
        $this->assertSame(['pg', 'kompleks', 'bs', 'isian', 'uraian'], $butir->keys()->all()); // draf dilewati
        $paket = PaketSoal::with('butir')->find($id);
        $this->assertSame('PER-T', $paket->id_periode); // periode aktif bawaan
        $this->assertSame('Menentukan pecahan senilai', $paket->butir[0]->soal['indikator']['deskripsi']);

        // Salinan tidak berubah saat soal bank diubah
        BankSoal::find($this->soal['pg'])->update(['pertanyaan' => 'Diubah']);
        $this->assertSame('1/2 senilai dengan', $paket->butir()->first()->soal['pertanyaan']);

        $this->sebagai($this->sekolah->guruB)->getJson("/api/paket-soal/{$id}")->assertForbidden();
        $this->postJson('/api/paket-soal', ['judul' => 'X', 'id_mapel' => 'MPL-A', 'id_kelas' => 'KLS-A'])->assertForbidden();
        $this->sebagai($this->sekolah->kepsek)->getJson("/api/paket-soal/{$id}")->assertOk()->assertJsonCount(5, 'data.butir');

        // Urutan & skor
        $urutan = $butir->reverse()->values()->map(fn($b) => ['id' => (int) $b, 'skor_maks' => 3])->all();
        $this->sebagai($this->sekolah->guruA)->putJson("/api/paket-soal/{$id}/butir", ['butir' => $urutan])->assertOk()
            ->assertJsonPath('data.butir.0.id', (int) $butir['uraian'])->assertJsonPath('data.butir.0.skor_maks', 3);
    }

    public function test_paket_diisi_dari_kisi_kisi(): void
    {
        $kisi = KisiKisi::create(['id_kisi' => 'KISI-1', 'judul' => 'PH', 'id_mapel' => 'MPL-A', 'dibuat_oleh' => $this->sekolah->guruA->id]);
        KisiKisiBaris::create(['id_kisi' => 'KISI-1', 'urutan' => 1, 'id_materi' => 'MTR-T', 'id_indikator' => 'IND-1', 'bentuk' => 'PG', 'level_kognitif' => 'C2', 'jumlah' => 2]);
        $res = $this->sebagai($this->sekolah->guruA)->postJson('/api/paket-soal', [
            'judul' => 'PH', 'id_mapel' => 'MPL-A', 'id_kelas' => 'KLS-A', 'id_kisi' => $kisi->id_kisi,
        ])->assertCreated();
        // Hanya satu PG disetujui untuk IND-1 → satu butir, kurang satu
        $this->assertCount(1, $res->json('data.butir'));
        $this->postJson('/api/paket-soal/' . $res->json('data.id_paket') . '/isi-kisi')->assertOk()->assertJsonPath('kurang', 1);
    }

    public function test_koreksi_otomatis_dan_skor_guru(): void
    {
        [$id, $b] = $this->buatPaket();
        $res = $this->putJson("/api/paket-soal/{$id}/jawaban", ['records' => [
            // Benar semua kecuali kompleks (pilih 0 dan 2 → 1 benar − 1 salah = 0) dan uraian belum dinilai
            ['id_siswa' => 'SIS-1', 'jawaban' => [$b['pg'] => 0, $b['kompleks'] => [0, 2], $b['bs'] => [true, false], $b['isian'] => ' 0,5. ']],
            ['id_siswa' => 'SIS-2', 'jawaban' => [$b['pg'] => 1, $b['kompleks'] => [0], $b['bs'] => [true, true]], 'skor_manual' => [$b['uraian'] => 9]],
        ]])->assertOk();

        $s1 = $res->json('data.SIS-1');
        $this->assertFalse($s1['lengkap']); // uraian menunggu skor guru
        $this->assertEquals([1, 0, 2, 1], array_values(array_intersect_key($s1['skor'], array_flip([$b['pg'], $b['kompleks'], $b['bs'], $b['isian']]))));

        $s2 = $res->json('data.SIS-2');
        $this->assertTrue($s2['lengkap']);
        // pg 0 + kompleks 1/2×2=1 + bs 1 + isian 0 + uraian dibatasi 4 = 6 dari 10
        $this->assertEquals(6, $s2['total']);
        $this->assertEquals(60, $s2['nilai']);

        $this->putJson("/api/paket-soal/{$id}/jawaban", ['records' => [['id_siswa' => 'SIS-4', 'jawaban' => []]]])->assertUnprocessable();
    }

    public function test_kirim_nilai_per_tp_ke_input_nilai(): void
    {
        [$id, $b] = $this->buatPaket();
        $this->postJson("/api/paket-soal/{$id}/kirim-nilai")->assertUnprocessable(); // belum ada yang lengkap
        $this->putJson("/api/paket-soal/{$id}/jawaban", ['records' => [
            ['id_siswa' => 'SIS-1', 'jawaban' => [$b['pg'] => 0, $b['kompleks'] => [0, 1], $b['bs'] => [true, false], $b['isian'] => '0.5'], 'skor_manual' => [$b['uraian'] => 4]],
            ['id_siswa' => 'SIS-2', 'jawaban' => [$b['pg'] => 1], 'skor_manual' => [$b['uraian'] => 2]],
            ['id_siswa' => 'SIS-3', 'jawaban' => [$b['pg'] => 0]], // uraian belum dinilai → tidak dikirim
        ]])->assertOk();

        $this->postJson("/api/paket-soal/{$id}/kirim-nilai")->assertOk()->assertJsonPath('perlu_tindak_lanjut', 1);
        $nilai = TransNilai::with('nilaiIndikator')->where('id_materi', 'MTR-T')->get()->keyBy('id_siswa');
        $this->assertSame(['SIS-1', 'SIS-2'], $nilai->keys()->sort()->values()->all());
        $this->assertEquals(100, $nilai['SIS-1']->nilai);
        // SIS-2: IND-1 = 0/3 = 0; IND-2 = (0 + 0 + 2)/7 = 28.57 → nilai rata-rata TP
        $this->assertEquals(['IND-1' => 0.0, 'IND-2' => 28.57], $nilai['SIS-2']->nilaiIndikator->pluck('nilai', 'id_indikator')->all());
        $this->assertEquals(14.29, $nilai['SIS-2']->nilai);
        $this->assertSame(['JNS-T', '2030-03-02'], [$nilai['SIS-2']->id_jenis, substr($nilai['SIS-2']->tanggal, 0, 10)]);

        // Kirim ulang memperbarui, tidak menggandakan
        $this->postJson("/api/paket-soal/{$id}/kirim-nilai")->assertOk();
        $this->assertSame(2, TransNilai::count());
        $this->assertNotNull(PaketSoal::find($id)->terkirim_pada);
    }

    public function test_analisis_butir(): void
    {
        [$id, $b] = $this->buatPaket();
        $this->putJson("/api/paket-soal/{$id}/jawaban", ['records' => [
            ['id_siswa' => 'SIS-1', 'jawaban' => [$b['pg'] => 0, $b['kompleks'] => [0, 1], $b['bs'] => [true, false], $b['isian'] => '0.5'], 'skor_manual' => [$b['uraian'] => 4]],
            ['id_siswa' => 'SIS-2', 'jawaban' => [$b['pg'] => 0, $b['kompleks'] => [0]], 'skor_manual' => [$b['uraian'] => 2]],
            ['id_siswa' => 'SIS-3', 'jawaban' => [$b['pg'] => 1], 'skor_manual' => [$b['uraian'] => 1]],
        ]])->assertOk();

        $a = $this->getJson("/api/paket-soal/{$id}/analisis")->assertOk()->json('data');
        $this->assertSame(3, $a['jumlah_siswa']);
        $pg = collect($a['butir'])->firstWhere('bentuk', 'PG');
        $this->assertEquals(0.67, $pg['p']);
        $this->assertSame('SEDANG', $pg['kesukaran']);
        $this->assertSame([2, 1, 0], $pg['sebaran']['pilihan']);
        $this->assertSame([2], $pg['sebaran']['pengecoh_lemah']);
        $this->assertNull($pg['d']); // kurang dari 4 siswa
        $this->assertNotNull($a['reliabilitas']);
        $this->assertCount(2, $a['per_tp']);
        $this->assertSame('SIS-1', $a['siswa'][0]['id_siswa']);
        $this->assertEquals(100, $a['siswa'][0]['stnkm']['T']);
        $this->assertNull($a['stnkm']['S']); // tidak ada butir berbobot S
    }

    public function test_foto_lembar_jawaban_dibaca_ai_sebagai_usulan(): void
    {
        Storage::fake('public');
        config(['services.ai_services.gemini_key' => 'kunci-uji']);
        [$id, $b] = $this->buatPaket();
        $foto = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
        $url = $this->postJson("/api/paket-soal/{$id}/jawaban/SIS-1/foto", ['foto_base64' => $foto])->assertOk()->json('data.foto.0');
        Storage::disk('public')->assertExists(Str::after($url, '/storage/'));

        Http::fake(['generativelanguage.googleapis.com/*' => Http::response(['candidates' => [['content' => ['parts' => [['text' => json_encode([
            'nama_siswa' => 'Ani', 'jawaban' => [['nomor' => 1, 'jawaban' => 'a'], ['nomor' => 2, 'jawaban' => 'A, B'], ['nomor' => 3, 'jawaban' => 'B S'], ['nomor' => 4, 'jawaban' => '0,5'], ['nomor' => 5, 'jawaban' => null]],
        ])]]]]]])]);
        $res = $this->postJson("/api/paket-soal/{$id}/jawaban/SIS-1/baca", ['url' => $url, 'ai_mode' => 'GEMINI'])->assertOk();
        $this->assertSame([0, [0, 1], [true, false], '0,5', null], array_values($res->json('jawaban')));
        $this->assertSame([], PaketSoal::find($id)->jawaban()->first()->skor_manual ?? []); // belum disimpan

        $this->postJson("/api/paket-soal/{$id}/jawaban/SIS-1/baca", ['url' => $url, 'ai_mode' => 'DEEPSEEK'])->assertUnprocessable();
        $this->deleteJson("/api/paket-soal/{$id}")->assertOk();
        Storage::disk('public')->assertMissing(Str::after($url, '/storage/'));
    }

    public function test_jawaban_tertulis_diubah_ke_bentuk_simpanan(): void
    {
        $bs = ['bentuk' => 'BENAR_SALAH', 'isi' => ['pernyataan' => ['a', 'b', 'c']]];
        $this->assertSame([true, false, null], PaketSoalService::dariTeks($bs, 'Benar, Salah, ?'));
        $this->assertNull(PaketSoalService::dariTeks(['bentuk' => 'PG', 'isi' => ['pilihan' => ['x', 'y']]], 'D'));
    }
}

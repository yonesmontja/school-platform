<?php

namespace Tests\Feature;

use App\Models\BankSoal;
use App\Models\MasterIndikator;
use App\Models\PaketSoalJawaban;
use App\Models\Student;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request as HttpRequest;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Laravel\Sanctum\Sanctum;
use Tests\Concerns\MembuatDataSekolah;
use Tests\TestCase;

/**
 * Fase 16 Tahap D: penilaian uraian berbantuan AI, gambar soal dari AI, dan AI yang belajar dari analisis butir.
 * Semua respons AI ditiru.
 */
class AsesmenAITest extends TestCase
{
    use RefreshDatabase, MembuatDataSekolah;

    private const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    private array $soal = [];

    protected function setUp(): void
    {
        parent::setUp();
        $this->buatSekolah();
        MasterIndikator::create(['id_indikator' => 'IND-1', 'id_materi' => 'MTR-T', 'deskripsi' => 'Menentukan pecahan senilai', 'urutan' => 1]);
        $buat = fn(array $d) => BankSoal::create($d + [
            'id_soal' => 'SOAL-' . Str::uuid(), 'id_mapel' => 'MPL-A', 'id_materi' => 'MTR-T', 'id_indikator' => 'IND-1', 'level_kognitif' => 'C2',
            'tingkat_kesulitan' => 'SEDANG', 'dim_T' => 1, 'status' => 'DISETUJUI', 'sumber' => 'MANUAL',
            'dibuat_oleh' => $this->sekolah->guruA->id, 'skor_maks' => 1, 'disetujui_pada' => now(),
        ])->id_soal;
        $this->soal = [
            'pg' => $buat(['bentuk' => 'PG', 'pertanyaan' => '1/2 senilai dengan', 'isi' => ['pilihan' => ['2/4', '1/3', '3/4', '1/5']], 'kunci' => ['jawaban' => 0]]),
            'uraian' => $buat(['bentuk' => 'URAIAN', 'pertanyaan' => 'Jelaskan mengapa 1/2 = 2/4', 'isi' => [], 'kunci' => ['jawaban' => 'Pembilang dan penyebut dikali 2'],
                'rubrik' => '4: menyebut dikali bilangan sama; 2: hanya contoh', 'skor_maks' => 4]),
        ];
    }

    private function sebagai(User $user): static
    {
        Sanctum::actingAs($user);
        return $this;
    }

    private function buatPaket(): array
    {
        $id = $this->sebagai($this->sekolah->guruA)->postJson('/api/paket-soal', [
            'judul' => 'PH', 'id_mapel' => 'MPL-A', 'id_kelas' => 'KLS-A', 'id_jenis' => 'JNS-T', 'tanggal' => '2030-03-02',
        ])->assertCreated()->json('data.id_paket');
        $butir = collect($this->postJson("/api/paket-soal/{$id}/butir", ['id_soal' => array_values($this->soal)])->json('data.butir'))
            ->keyBy(fn($b) => array_search($b['id_soal'], $this->soal, true))->map(fn($b) => (string) $b['id']);
        return [$id, $butir];
    }

    public function test_ai_mengusulkan_skor_uraian_dari_jawaban_dan_foto(): void
    {
        [$id, $butir] = $this->buatPaket();
        // Jawaban tertulis (mis. catatan guru) dinilai dengan penyedia teks mana pun
        Http::fake(['api.deepseek.com/*' => Http::response(['choices' => [['message' => ['content' => json_encode(['nilai' => [
            ['nomor' => 2, 'skor' => 3.7, 'alasan' => 'Menyebut dikali 2, belum umum.', 'transkrip' => null],
        ]])]]]])]);
        config(['services.ai_services.deepseek_key' => 'uji']);
        $res = $this->postJson("/api/paket-soal/{$id}/jawaban/SIS-1/nilai-ai", ['ai_mode' => 'DEEPSEEK', 'jawaban' => [$butir['uraian'] => 'karena dikali 2']])->assertOk();
        $this->assertSame(3.5, $res->json('saran.' . $butir['uraian'] . '.skor')); // dibulatkan ke 0,5 terdekat
        $this->assertStringContainsString('dikali 2', $res->json('saran.' . $butir['uraian'] . '.alasan'));
        Http::assertSent(fn(HttpRequest $r) => str_contains($r['messages'][1]['content'], 'karena dikali 2') && str_contains($r['messages'][1]['content'], 'rubrik'));
        $this->assertDatabaseCount('paket_soal_jawaban', 0); // hanya usulan

        // Tanpa jawaban & foto: ditolak dengan pesan jelas
        $this->postJson("/api/paket-soal/{$id}/jawaban/SIS-2/nilai-ai", ['ai_mode' => 'DEEPSEEK'])->assertUnprocessable();

        // Foto lembar jawaban dikirim ke Gemini; skor melebihi maksimum dipangkas
        Storage::fake('public');
        Storage::disk('public')->put('lembar/a.png', base64_decode(self::PNG));
        PaketSoalJawaban::create(['id_paket' => $id, 'id_siswa' => 'SIS-2', 'jawaban' => [], 'foto' => ['/storage/lembar/a.png']]);
        $nilai = json_encode(['nilai' => [['nomor' => 2, 'skor' => 9, 'alasan' => 'Lengkap.', 'transkrip' => 'dikali bilangan yang sama']]]);
        Http::fake(['generativelanguage.googleapis.com/*' => Http::response(['candidates' => [['content' => ['parts' => [['text' => $nilai]]]]]])]);
        config(['services.ai_services.gemini_key' => 'uji']);
        $res = $this->postJson("/api/paket-soal/{$id}/jawaban/SIS-2/nilai-ai", ['ai_mode' => 'GEMINI'])->assertOk();
        $this->assertSame(4, $res->json('saran.' . $butir['uraian'] . '.skor'));
        $this->assertSame('dikali bilangan yang sama', $res->json('saran.' . $butir['uraian'] . '.transkrip'));
        Http::assertSent(fn(HttpRequest $r) => str_contains($r->url(), 'generativelanguage') && isset($r['contents'][0]['parts'][1]['inline_data']));

        // Foto tidak bisa dibaca penyedia teks saja
        $this->postJson("/api/paket-soal/{$id}/jawaban/SIS-2/nilai-ai", ['ai_mode' => 'DEEPSEEK'])->assertUnprocessable()->assertJsonFragment(['message' => 'Foto lembar jawaban hanya bisa dibaca dengan Gemini atau Claude.']);
    }

    public function test_gambar_ai_dari_gemini_openkey_dan_diagram_svg(): void
    {
        Storage::fake('public');
        $this->sebagai($this->sekolah->guruA);
        config(['services.ai_services.gemini_key' => 'uji', 'services.ai_services.openkey_key' => 'uji', 'services.ai_services.claude_key' => 'uji']);
        $setelan = \App\Models\SchoolSetting::first() ?? new \App\Models\SchoolSetting(['nama_sekolah' => 'SD Uji']);
        $setelan->forceFill(['openkey_base_url' => 'https://openkey.test/v1'])->save();

        Http::fake([
            // Panggilan pertama berhasil; panggilan berikutnya ditolak karena kuota
            'generativelanguage.googleapis.com/*' => Http::sequence()
                ->push(['candidates' => [['content' => ['parts' => [['text' => 'ini gambarnya'], ['inlineData' => ['mimeType' => 'image/png', 'data' => self::PNG]]]]]]])
                ->push(['error' => ['message' => 'Quota exceeded for image model']], 429),
            'openkey.test/v1/images/generations' => Http::response(['error' => ['message' => 'model not supported']], 400),
            'openkey.test/v1/chat/completions' => Http::response(['choices' => [['message' => ['content' => 'Berikut: ![g](data:image/png;base64,' . self::PNG . ')']]]]),
            'api.anthropic.com/*' => Http::response(['stop_reason' => 'end_turn', 'content' => [['type' => 'text', 'text' => json_encode(['gambar_svg' => '<svg viewBox="0 0 10 10"><script>x</script><circle cx="5" cy="5" r="4"/></svg>'])]]]),
        ]);

        $url = $this->postJson('/api/bank-soal/ai/gambar', ['ai_mode' => 'GEMINI', 'jenis' => 'ILUSTRASI', 'deskripsi' => 'Kue dipotong 4 bagian sama besar'])->assertOk()->json('url');
        Storage::disk('public')->assertExists(Str::after($url, '/storage/'));
        Http::assertSent(fn(HttpRequest $r) => str_contains($r->url(), 'gemini-2.5-flash-image:generateContent') && $r['generationConfig']['responseModalities'] === ['TEXT', 'IMAGE']);

        // OpenKey: endpoint gambar menolak, lalu chat completions mengembalikan gambar; model pilihan guru dipakai
        $res = $this->postJson('/api/bank-soal/ai/gambar', ['ai_mode' => 'OPENKEY', 'jenis' => 'ILUSTRASI', 'deskripsi' => 'Kue dipotong', 'model' => 'nano-banana'])->assertOk();
        $this->assertSame('nano-banana', $res->json('model'));

        // Claude tidak membuat ilustrasi, tetapi bisa membuat diagram SVG yang dibersihkan
        $this->postJson('/api/bank-soal/ai/gambar', ['ai_mode' => 'CLAUDE', 'jenis' => 'ILUSTRASI', 'deskripsi' => 'Kue dipotong'])
            ->assertUnprocessable()->assertJsonPath('message', fn($m) => str_contains($m, 'Diagram (SVG)'));
        $svg = $this->postJson('/api/bank-soal/ai/gambar', ['ai_mode' => 'CLAUDE', 'jenis' => 'DIAGRAM', 'deskripsi' => 'Lingkaran'])->assertOk()->json('gambar_svg');
        $this->assertStringContainsString('<circle', $svg);
        $this->assertStringNotContainsString('script', $svg);

        // Pesan penolakan penyedia diteruskan agar sekolah tahu sebabnya
        $this->postJson('/api/bank-soal/ai/gambar', ['ai_mode' => 'GEMINI', 'jenis' => 'ILUSTRASI', 'deskripsi' => 'Kue dipotong'])
            ->assertUnprocessable()->assertJsonPath('message', fn($m) => str_contains($m, 'HTTP 429') && str_contains($m, 'Quota exceeded'));
    }

    public function test_analisis_butir_tersimpan_dan_dipakai_draf_ai(): void
    {
        foreach (['SIS-5' => 'Eka', 'SIS-6' => 'Fani'] as $idS => $nama) Student::create(['id_siswa' => $idS, 'nama_siswa' => $nama, 'id_kelas' => 'KLS-A']);
        [$id, $butir] = $this->buatPaket();
        // Pilihan ganda: hanya siswa skor tinggi benar → daya beda baik; pengecoh "1/5" tidak dipilih siapa pun
        $jawab = ['SIS-1' => [0, 4], 'SIS-2' => [0, 3], 'SIS-3' => [1, 2], 'SIS-5' => [2, 1], 'SIS-6' => [1, 0]];
        $this->putJson("/api/paket-soal/{$id}/jawaban", ['records' => collect($jawab)->map(fn($j, $idS) => [
            'id_siswa' => $idS, 'jawaban' => [$butir['pg'] => $j[0]], 'skor_manual' => [$butir['uraian'] => $j[1]],
        ])->values()->all()])->assertOk();
        $this->getJson("/api/paket-soal/{$id}/analisis")->assertOk();

        $stat = collect($this->getJson('/api/bank-soal')->json('data'))->keyBy('id_soal')[$this->soal['pg']]['statistik'];
        $this->assertSame(0.4, $stat['p']);
        $this->assertSame(5, $stat['n']);
        $this->assertStringContainsString('1/5', $stat['saran']);

        // Draf AI menerima contoh, catatan soal bermasalah, dan capaian siswa pada TP
        config(['services.ai_services.gemini_key' => 'uji']);
        Http::fake(['generativelanguage.googleapis.com/*' => Http::response(['candidates' => [['content' => ['parts' => [['text' => json_encode(['soal' => []])]]]]]])]);
        $res = $this->postJson('/api/bank-soal/ai/draf', ['id_mapel' => 'MPL-A', 'id_indikator' => 'IND-1', 'bentuk' => 'PG', 'jumlah' => 1, 'ai_mode' => 'GEMINI'])->assertOk();
        $this->assertSame(1, $res->json('belajar.contoh'));
        $this->assertNotNull($res->json('belajar.capaian'));
        Http::assertSent(function (HttpRequest $r) {
            $teks = $r['contents'][0]['parts'][0]['text'];
            return str_contains($teks, 'capaian_siswa_sekolah') && str_contains($teks, 'hasil_analisis');
        });
    }
}

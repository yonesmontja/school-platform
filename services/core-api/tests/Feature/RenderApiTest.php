<?php

namespace Tests\Feature;

use App\Models\RenderApi;
use App\Models\User;
use App\Services\UnduhAset;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use RuntimeException;
use Tests\Concerns\MembuatDataSekolah;
use Tests\TestCase;

class RenderApiTest extends TestCase
{
    use RefreshDatabase, MembuatDataSekolah;

    private string $kunci;

    protected function setUp(): void
    {
        parent::setUp();
        $this->buatSekolah();
        config(['services.video_render.secret' => 'rahasia-uji']);
        Storage::fake('public');
        Storage::fake('local');
        Sanctum::actingAs($this->sekolah->admin);
        $this->kunci = $this->postJson('/api/render-api/klien', ['nama' => 'Muse'])->assertCreated()->json('kunci');
        $this->app['auth']->forgetGuards();
    }

    private function payload(array $ubah = []): array
    {
        return array_replace_recursive([
            'template' => 'maritime-50s', 'episode' => 'uji-roosevelt', 'language' => 'id-ID', 'voice' => 'id-ID-ArdiNeural',
            'format' => ['width' => 1080, 'height' => 1920, 'fps' => 30, 'durationSec' => 20],
            'audio' => ['narration' => 'asset://x/narration.mp3', 'music' => 'asset://music/default.mp3', 'musicVolume' => 0.15],
            'scenes' => [
                ['type' => 'hook', 'startSec' => 0, 'endSec' => 4, 'text' => 'Kapal induk lewat Selat Malaka.', 'motion' => 'fade-slide-up'],
                ['type' => 'map', 'startSec' => 4, 'endSec' => 12, 'bbox' => 'strait-of-malacca', 'places' => ['Singapura', 'Selat Malaka'],
                    'markers' => [['place' => 'Singapura', 'icon' => 'port']], 'route' => ['Changi', 'Selat Malaka', 'Samudra Hindia']],
                ['type' => 'closing', 'startSec' => 12, 'endSec' => 20, 'question' => 'Bagaimana sikap kita?', 'series' => 'Selat dalam 60 Detik'],
            ],
            'sources' => [['publisher' => 'The Maritime Executive', 'title' => 'Uji', 'url' => 'https://maritime-executive.com/article/x']],
        ], $ubah);
    }

    private function api(): static
    {
        return $this->withHeaders(['Authorization' => "Bearer {$this->kunci}"]);
    }

    public function test_kunci_api_wajib_dan_bisa_dicabut(): void
    {
        $this->getJson('/api/v1/templates')->assertUnauthorized()->assertJsonPath('error.code', 'unauthorized');
        $this->withHeaders(['Authorization' => 'Bearer srk_salah'])->getJson('/api/v1/templates')->assertUnauthorized();
        $this->api()->getJson('/api/v1/templates')->assertOk()->assertJsonPath('data.0.id', 'maritime-50s');
        $this->withHeaders(['X-API-Key' => $this->kunci])->getJson('/api/v1/places?q=malaka')->assertOk()->assertJsonPath('data.0.code', 'strait-of-malacca');
        // Kunci disimpan sebagai hash, bukan teks asli
        $this->assertDatabaseMissing('api_klien', ['kunci_hash' => $this->kunci]);
        // Hanya admin yang mengelola kunci
        Sanctum::actingAs($this->sekolah->kepsek);
        $this->getJson('/api/render-api')->assertForbidden();
        Sanctum::actingAs($this->sekolah->admin);
        $id = $this->getJson('/api/render-api')->assertOk()->json('klien.0.id');
        $this->patchJson("/api/render-api/klien/{$id}", ['aktif' => false])->assertOk();
        $this->app['auth']->forgetGuards();
        $this->api()->getJson('/api/v1/templates')->assertUnauthorized();
    }

    public function test_validasi_payload_dan_gerbang_peta(): void
    {
        $this->api()->postJson('/api/v1/renders', $this->payload(['format' => ['width' => 800]]))->assertUnprocessable()->assertJsonPath('error.code', 'validation_failed');
        $celah = $this->payload();
        $celah['scenes'][1]['startSec'] = 5;
        $this->api()->postJson('/api/v1/renders', $celah)->assertUnprocessable()->assertJsonFragment(['Adegan 2 harus mulai tepat saat adegan sebelumnya selesai (4 detik).']);
        $tak = $this->payload();
        $tak['scenes'][1]['places'] = ['Natuna Utara Palsu'];
        $r = $this->api()->postJson('/api/v1/renders', $tak)->assertUnprocessable();
        $this->assertStringContainsString('Natuna Utara Palsu', $r->json('error.message'));
        $this->assertSame(0, RenderApi::count());
    }

    public function test_alur_render_sampai_video_bertanda_tangan(): void
    {
        $r = $this->api()->postJson('/api/v1/renders', $this->payload())->assertStatus(202);
        $id = $r->json('job_id');
        $this->assertSame('queued', $r->json('status'));
        // asset:// tidak bisa diambil → peringatan jujur, narasi dari teks (Piper karena kunci Azure belum diisi)
        $this->assertTrue(collect($r->json('warnings'))->contains(fn($w) => str_contains($w, 'tanpa musik')));
        $job = RenderApi::find($id);
        $this->assertSame('LOKAL', $job->suara);
        $peta = collect($job->props['adegan'][1]['elemen'])->firstWhere('tipe', 'peta')['peta'];
        $this->assertNotEmpty($peta['daratan']);
        $this->assertSame('Singapura', $peta['titik'][0]['nama']);
        $this->assertGreaterThanOrEqual(3, count($peta['rute']));
        $this->assertSame(['1080p', '9:16'], [$job->props['resolusi'], $job->props['rasio']]);

        // Job milik kunci lain tidak terlihat
        Sanctum::actingAs($this->sekolah->admin);
        $lain = $this->postJson('/api/render-api/klien', ['nama' => 'Lain'])->json('kunci');
        $this->app['auth']->forgetGuards();
        $this->withHeaders(['Authorization' => "Bearer {$lain}"])->getJson("/api/v1/renders/{$id}")->assertNotFound();

        // Layanan render mengambil job (mesin Revideo), lalu melapor selesai
        $h = ['X-Render-Secret' => 'rahasia-uji'];
        $this->getJson('/api/internal/render/berikut?mesin=REMOTION', $h)->assertJsonPath('data', null);
        $ambil = $this->getJson('/api/internal/render/berikut?mesin=REVIDEO', $h)->assertOk();
        $this->assertSame([$id, 'Rakitan', 'REVIDEO'], [$ambil->json('data.id_video'), $ambil->json('data.templat'), $ambil->json('data.mesin')]);
        $this->api()->getJson("/api/v1/renders/{$id}")->assertJsonPath('status', 'rendering')->assertJsonPath('progress_is_estimate', true);
        Storage::disk('public')->put('video/vid_uji.mp4', 'mp4palsu');
        Storage::disk('public')->put('video/poster_vid_uji.jpg', 'jpg');
        $this->postJson("/api/internal/render/{$id}/selesai", ['file_url' => '/storage/video/vid_uji.mp4', 'poster_url' => '/storage/video/poster_vid_uji.jpg', 'durasi_detik' => 21], $h)->assertOk();
        Storage::disk('public')->assertMissing('video/vid_uji.mp4'); // dipindah ke disk privat
        Storage::disk('local')->assertExists("render-api/{$id}.mp4");

        $s = $this->api()->getJson("/api/v1/renders/{$id}")->assertOk()->assertJsonPath('status', 'done')->assertJsonPath('duration_sec', 21);
        $url = $s->json('video_url');
        $this->assertStringContainsString('signature=', $url);
        $this->get($url)->assertOk()->assertHeader('Content-Type', 'video/mp4');
        $this->get(preg_replace('/signature=\w+/', 'signature=palsu', $url))->assertForbidden();
    }

    public function test_narasi_url_diunduh_aman_dan_suara_azure(): void
    {
        // Pelindung SSRF: bukan https, IP privat, dan loopback ditolak
        $u = app(UnduhAset::class);
        foreach (['http://93.184.216.34/a.mp3', 'https://127.0.0.1/a.mp3', 'https://10.0.0.5/a.mp3', 'https://169.254.169.254/latest'] as $x) {
            try { $u->cekUrl($x); $this->fail("Seharusnya ditolak: {$x}"); } catch (RuntimeException) { $this->assertTrue(true); }
        }
        $mp3 = "ID3\x03\x00\x00\x00\x00\x00\x00" . str_repeat("\x00", 64);
        Http::fake(['93.184.216.34/narasi.mp3' => Http::response($mp3, 200), '93.184.216.34/bukan.mp3' => Http::response('<html>', 200)]);
        $this->api()->postJson('/api/v1/renders', $this->payload(['audio' => ['narration' => 'https://93.184.216.34/bukan.mp3']]))
            ->assertUnprocessable()->assertJsonPath('error.code', 'asset_unavailable');
        $id = $this->api()->postJson('/api/v1/renders', $this->payload(['audio' => ['narration' => 'https://93.184.216.34/narasi.mp3']]))->assertStatus(202)->json('job_id');
        $job = RenderApi::find($id);
        $this->assertSame('TANPA', $job->suara);
        Storage::disk('public')->assertExists(str_replace('/storage/', '', $job->props['narasi_utuh']['src']));

        // Suara Azure lewat endpoint internal: kunci di pengaturan, laju dibatasi, suara divalidasi
        Sanctum::actingAs($this->sekolah->admin);
        $this->getJson('/api/settings')->assertOk();
        $this->postJson('/api/settings', ['azure_speech_key' => 'kunci-azure', 'azure_speech_region' => 'southeastasia'])->assertOk();
        $this->postJson('/api/settings', ['azure_speech_region' => 'evil.com/x'])->assertUnprocessable();
        $this->app['auth']->forgetGuards();
        Http::fake(['southeastasia.tts.speech.microsoft.com/*' => Http::response("RIFF\x00\x00\x00\x00WAVEfmt ", 200)]);
        $this->postJson('/api/internal/render/suara', ['suara' => 'AZURE', 'teks' => 'Halo <dunia>', 'voice' => 'id-ID-ArdiNeural', 'laju' => 1.2], ['X-Render-Secret' => 'rahasia-uji'])->assertOk();
        Http::assertSent(fn($r) => str_contains($r->url(), 'southeastasia.tts.speech.microsoft.com') && $r->hasHeader('Ocp-Apim-Subscription-Key', 'kunci-azure')
            && str_contains($r->body(), 'rate="+20%"') && str_contains($r->body(), 'Halo &lt;dunia&gt;') && str_contains($r->body(), 'id-ID-ArdiNeural'));
        $this->postJson('/api/internal/render/suara', ['suara' => 'AZURE', 'teks' => 'x', 'voice' => 'id-ID-<x>'], ['X-Render-Secret' => 'rahasia-uji'])->assertUnprocessable();
    }

    public function test_suara_gemini_bila_azure_belum_ada(): void
    {
        Sanctum::actingAs($this->sekolah->admin);
        $this->getJson('/api/settings')->assertOk();
        $this->postJson('/api/settings', ['api_key_gemini' => 'kunci-gemini'])->assertOk();
        $this->app['auth']->forgetGuards();

        $r = $this->api()->postJson('/api/v1/renders', $this->payload())->assertStatus(202);
        $job = RenderApi::find($r->json('job_id'));
        $this->assertSame(['GEMINI', 'Charon'], [$job->suara, $job->props['voice_gemini']]);
        $this->assertTrue(collect($r->json('warnings'))->contains(fn($w) => str_contains($w, 'suara Gemini Charon')));
        // Payload boleh langsung menyebut suara Gemini
        $r2 = $this->api()->postJson('/api/v1/renders', $this->payload(['voice' => 'Orus']))->assertStatus(202);
        $this->assertSame('Orus', RenderApi::find($r2->json('job_id'))->props['voice_gemini']);

        // Endpoint suara internal: gaya narator berita + nama suara diteruskan ke Gemini
        Http::fake(['generativelanguage.googleapis.com/*' => Http::response(['candidates' => [['content' => ['parts' => [['inlineData' => ['data' => base64_encode(str_repeat("\x00", 480))]]]]]]])]);
        $this->postJson('/api/internal/render/suara', ['suara' => 'GEMINI', 'teks' => 'Kapal induk lewat.', 'voice' => 'Charon', 'gaya' => 'berita', 'laju' => 1.2], ['X-Render-Secret' => 'rahasia-uji'])
            ->assertOk()->assertHeader('Content-Type', 'audio/wav');
        Http::assertSent(fn($q) => str_contains($q['contents'][0]['parts'][0]['text'], 'narator berita') && str_contains($q['contents'][0]['parts'][0]['text'], 'tempo agak cepat')
            && $q['generationConfig']['speechConfig']['voiceConfig']['prebuiltVoiceConfig']['voiceName'] === 'Charon');
    }

    public function test_admin_mengelola_tempat_terverifikasi(): void
    {
        Sanctum::actingAs($this->sekolah->admin);
        $this->postJson('/api/render-api/tempat', ['nama' => 'Pulau Uji', 'jenis' => 'titik', 'lat' => 4.1, 'lon' => 108.2])->assertUnprocessable(); // sumber wajib
        $id = $this->postJson('/api/render-api/tempat', ['nama' => 'Pulau Uji', 'alias' => ['Uji Island'], 'jenis' => 'titik', 'lat' => 4.1, 'lon' => 108.2, 'sumber' => 'Peta BIG'])
            ->assertCreated()->json('data.id');
        $this->getJson('/api/render-api/tempat?q=uji island')->assertOk()->assertJsonPath('data.0.id', $id);
        $this->deleteJson("/api/render-api/tempat/{$id}")->assertOk();
    }
}

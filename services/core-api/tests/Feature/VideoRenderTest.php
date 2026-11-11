<?php

namespace Tests\Feature;

use App\Models\SchoolSetting;
use App\Models\User;
use App\Models\VideoBelajar;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request as HttpRequest;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\Concerns\MembuatDataSekolah;
use Tests\TestCase;

/**
 * Video dari templat (Fase 19 Tahap C, jalur B) & suara narasi (Tahap B): antrean render, endpoint internal untuk
 * layanan video-render (kunci bersama), dan suara ElevenLabs/Gemini (respons ditiru).
 */
class VideoRenderTest extends TestCase
{
    use RefreshDatabase, MembuatDataSekolah;

    private const KUNCI = 'rahasia-uji';

    protected function setUp(): void
    {
        parent::setUp();
        $this->buatSekolah();
        Storage::fake('public');
        config(['services.video_render.secret' => self::KUNCI]);
    }

    private function sebagai(User $u): static
    {
        Sanctum::actingAs($u);
        return $this;
    }

    private function contoh(array $extra = []): array
    {
        return $extra + [
            'templat' => 'KartuGambar', 'judul' => 'Kenali Kata', 'id_mapel' => 'MPL-A', 'id_kelas' => 'KLS-A', 'suara' => 'LOKAL',
            'props' => ['judul' => 'Kenali Kata', 'emoji' => '🐟', 'warna' => '#16a34a', 'penutup' => ['teks' => 'Hebat!'],
                'adegan' => [['gambar' => '🐟', 'kata' => 'i-kan', 'keterangan' => '', 'narasi' => 'Ini ikan.']]],
        ];
    }

    public function test_guru_membuat_video_dari_templat_dan_layanan_render_menyelesaikannya(): void
    {
        $this->sebagai($this->sekolah->guruA);
        $this->getJson('/api/video-belajar/suara')->assertOk()->assertJsonPath('data.0.kode', 'LOKAL')->assertJsonPath('data.1.aktif', false);
        // ElevenLabs belum diatur → ditolak dengan pesan jelas; templat asing ditolak
        $this->postJson('/api/video-belajar/templat', $this->contoh(['suara' => 'ELEVENLABS_NETRAL']))->assertUnprocessable()
            ->assertJsonPath('message', fn($m) => str_contains($m, 'API key ElevenLabs'));
        $this->postJson('/api/video-belajar/templat', $this->contoh(['templat' => 'Sihir']))->assertUnprocessable();

        $v = $this->postJson('/api/video-belajar/templat', $this->contoh())->assertCreated()->json('data');
        $this->assertSame(['RENDER', 'ANTRE', 'DRAF', 'KartuGambar'], [$v['sumber'], $v['render_status'], $v['status'], $v['komposisi']]);
        $this->assertSame(['gambar' => '🐟', 'kata' => 'i-kan', 'keterangan' => null, 'narasi' => 'Ini ikan.'], $v['props']['adegan'][0]); // isian utuh (teks kosong menjadi null)
        $this->assertSame('#16a34a', $v['props']['warna']);
        $this->assertSame(['16:9', '16:9'], [$v['rasio'], $v['props']['rasio']]); // rasio bawaan
        $tegak = $this->postJson('/api/video-belajar/templat', $this->contoh(['props' => $this->contoh()['props'] + ['rasio' => '9:16']]))->assertCreated()->json('data');
        $this->assertSame(['9:16', '9:16'], [$tegak['rasio'], $tegak['props']['rasio']]);
        $aneh = $this->postJson('/api/video-belajar/templat', $this->contoh(['props' => $this->contoh()['props'] + ['rasio' => '21:9']]))->assertCreated()->json('data');
        $this->assertSame('16:9', $aneh['rasio']); // rasio tak dikenal kembali ke 16:9
        VideoBelajar::whereIn('id_video', [$tegak['id_video'], $aneh['id_video']])->delete();
        // Belum selesai dirender: belum bisa diajukan
        $this->postJson("/api/video-belajar/{$v['id_video']}/ajukan")->assertUnprocessable();

        // Layanan render: kunci salah ditolak; mengambil antrean
        $this->getJson('/api/internal/render/berikut', ['X-Render-Secret' => 'salah'])->assertForbidden();
        $job = $this->getJson('/api/internal/render/berikut', ['X-Render-Secret' => self::KUNCI])->assertOk()->json('data');
        $this->assertSame([$v['id_video'], 'LOKAL', 'i-kan'], [$job['id_video'], $job['suara'], $job['props']['adegan'][0]['kata']]);
        $this->assertSame('PROSES', VideoBelajar::find($v['id_video'])->render_status);
        $this->assertNull($this->getJson('/api/internal/render/berikut', ['X-Render-Secret' => self::KUNCI])->json('data')); // tidak diambil dua kali

        // Selesai: berkas harus ada dan berada di storage/video
        $this->postJson("/api/internal/render/{$v['id_video']}/selesai", ['file_url' => '/storage/video/tidakada.mp4', 'durasi_detik' => 20], ['X-Render-Secret' => self::KUNCI])->assertUnprocessable();
        $this->postJson("/api/internal/render/{$v['id_video']}/selesai", ['file_url' => '/storage/../.env', 'durasi_detik' => 20], ['X-Render-Secret' => self::KUNCI])->assertUnprocessable();
        Storage::disk('public')->put('video/vid_uji.mp4', str_repeat('x', 4096));
        Storage::disk('public')->put('video/poster_vid_uji.jpg', 'jpg');
        $this->postJson("/api/internal/render/{$v['id_video']}/selesai", ['file_url' => '/storage/video/vid_uji.mp4', 'poster_url' => '/storage/video/poster_vid_uji.jpg', 'durasi_detik' => 24], ['X-Render-Secret' => self::KUNCI])->assertOk();
        $hasil = VideoBelajar::find($v['id_video']);
        $this->assertSame(['SELESAI', '/storage/video/vid_uji.mp4', 24, 4], [$hasil->render_status, $hasil->file_url, $hasil->durasi_detik, $hasil->ukuran_kb]);
        $this->postJson("/api/video-belajar/{$v['id_video']}/ajukan")->assertOk();

        // Render ulang dengan isian baru: kembali ke antrean dan draf
        $this->postJson("/api/video-belajar/{$v['id_video']}/render", $this->contoh(['judul' => 'Kenali Kata 2']))->assertOk()
            ->assertJsonPath('data.render_status', 'ANTRE')->assertJsonPath('data.status', 'DRAF');
        $this->getJson('/api/internal/render/berikut', ['X-Render-Secret' => self::KUNCI]);
        $this->postJson("/api/internal/render/{$v['id_video']}/gagal", ['pesan' => 'Piper gagal'], ['X-Render-Secret' => self::KUNCI])->assertOk();
        $this->assertContains('video-render-gagal', array_column($this->getJson('/api/notifikasi')->json('data'), 'jenis'));
    }

    public function test_render_macet_diantrekan_ulang_dan_suara_berbayar_lewat_core_api(): void
    {
        VideoBelajar::create(['id_video' => 'VID-M', 'judul' => 'Macet', 'file_url' => '', 'sumber' => 'RENDER', 'templat' => 'Berhitung', 'props' => ['adegan' => []],
            'suara' => 'LOKAL', 'render_status' => 'PROSES', 'render_mulai' => now()->subMinutes(90), 'status' => 'DRAF']);
        $this->assertSame('VID-M', $this->getJson('/api/internal/render/berikut', ['X-Render-Secret' => self::KUNCI])->json('data.id_video'));

        // ElevenLabs: PCM dibungkus WAV; API key tidak pernah keluar ke layanan render
        $s = SchoolSetting::first() ?? new SchoolSetting(['nama_sekolah' => 'SD Uji']);
        $s->forceFill(['api_key_elevenlabs' => 'kunci-el', 'elevenlabs_voice_klon' => 'SuaraGuru123'])->save();
        Http::fake(['api.elevenlabs.io/*' => Http::response(str_repeat("\x01\x00", 2205), 200, ['Content-Type' => 'audio/pcm'])]);
        $res = $this->post('/api/internal/render/suara', ['suara' => 'ELEVENLABS_KLON', 'teks' => 'Halo anak-anak'], ['X-Render-Secret' => self::KUNCI, 'Accept' => 'application/json'])->assertOk();
        $this->assertStringStartsWith('RIFF', $res->getContent());
        $this->assertSame(22050, unpack('V', substr($res->getContent(), 24, 4))[1]);
        Http::assertSent(fn(HttpRequest $r) => str_contains($r->url(), '/text-to-speech/SuaraGuru123') && $r->hasHeader('xi-api-key', 'kunci-el'));

        // Gemini: audio PCM 24 kHz dalam inlineData
        config(['services.ai_services.gemini_key' => 'kunci-g']);
        Http::fake(['generativelanguage.googleapis.com/*' => Http::response(['candidates' => [['content' => ['parts' => [['inlineData' => ['mimeType' => 'audio/L16', 'data' => base64_encode(str_repeat("\x00\x00", 2400))]]]]]]])]);
        $res = $this->post('/api/internal/render/suara', ['suara' => 'GEMINI', 'teks' => 'Halo'], ['X-Render-Secret' => self::KUNCI, 'Accept' => 'application/json'])->assertOk();
        $this->assertSame(24000, unpack('V', substr($res->getContent(), 24, 4))[1]);

        // Pilihan suara kini aktif untuk guru
        $pilihan = collect($this->sebagai($this->sekolah->guruA)->getJson('/api/video-belajar/suara')->json('data'))->keyBy('kode');
        $this->assertTrue($pilihan['ELEVENLABS_KLON']['aktif'] && $pilihan['GEMINI']['aktif']);
    }
}

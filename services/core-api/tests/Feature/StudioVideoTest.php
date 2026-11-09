<?php

namespace Tests\Feature;

use App\Models\User;
use App\Models\VideoBelajar;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\Concerns\MembuatDataSekolah;
use Tests\TestCase;

/**
 * Studio Rakit Video (D1): satu pembuat video yang ditunjuk admin, naskah JSON dibersihkan server, aset gambar,
 * merek sekolah, dan antrean render per mesin (Remotion/Revideo).
 */
class StudioVideoTest extends TestCase
{
    use RefreshDatabase, MembuatDataSekolah;

    protected function setUp(): void
    {
        parent::setUp();
        $this->buatSekolah();
        Storage::fake('public');
        config(['services.video_render.secret' => 'rahasia-uji']);
    }

    private function sebagai(User $u): static
    {
        Sanctum::actingAs($u);
        return $this;
    }

    private function naskah(array $adegan = []): array
    {
        return [
            'templat' => 'Rakitan', 'judul' => 'Promosi PPDB', 'suara' => 'LOKAL',
            'props' => ['rasio' => '9:16', 'judul' => 'Ayo Sekolah', 'subtitle' => true, 'kunci_asing' => 'buang',
                'merek' => ['logo' => '/storage/video-aset/logo.png', 'huruf' => 'Comic Sans', 'warna' => ['#2563EB', 'merah']],
                'adegan' => $adegan ?: [[
                    'narasi' => 'Pendaftaran dibuka.', 'durasi' => 99, 'transisi' => 'meledak',
                    'latar' => ['tipe' => 'gradien', 'warna' => '#16a34a', 'warna2' => '#4ade80', 'gambar' => 'https://jahat.example/x.png'],
                    'elemen' => [
                        ['id' => 'a1', 'tipe' => 'teks', 'isi' => 'PENDAFTARAN', 'x' => 50, 'y' => 400, 'w' => 80, 'h' => 10, 'gaya' => ['ukuran' => 70, 'warna' => '#ffffff'], 'masuk' => ['preset' => 'pop', 'mulai' => 0.2, 'durasi' => 0.6], 'gerak' => 'denyut', 'onclick' => 'x'],
                        ['id' => 'a2', 'tipe' => 'skrip', 'isi' => '<script>'],
                        ['id' => 'a3', 'tipe' => 'gambar', 'isi' => '../../.env'],
                    ],
                ]]],
        ];
    }

    public function test_hanya_pembuat_yang_ditunjuk_admin_bisa_merakit_dan_naskah_dibersihkan(): void
    {
        // Belum ditunjuk: siapa pun ditolak
        $this->sebagai($this->sekolah->guruA)->postJson('/api/video-belajar/templat', $this->naskah())->assertForbidden();
        $this->assertFalse($this->getJson('/api/me')->json('data.studio_video'));
        // Guru tidak boleh menunjuk dirinya sendiri
        $this->putJson('/api/video-belajar/studio', ['id_pembuat' => $this->sekolah->guruA->id])->assertForbidden();

        $this->sebagai($this->sekolah->admin)->putJson('/api/video-belajar/studio', ['id_pembuat' => $this->sekolah->guruA->id])->assertOk();
        $this->assertCount(3, collect($this->getJson('/api/video-belajar/studio')->json('data.kandidat'))->whereIn('role', ['admin', 'kepsek', 'guru'])->unique('id')->take(3));
        $this->sebagai($this->sekolah->guruB)->postJson('/api/video-belajar/templat', $this->naskah())->assertForbidden();

        $this->sebagai($this->sekolah->guruA);
        $this->assertTrue($this->getJson('/api/me')->json('data.studio_video'));
        $this->assertTrue($this->getJson('/api/video-belajar/studio')->json('data.boleh'));
        $v = $this->postJson('/api/video-belajar/templat', $this->naskah())->assertCreated()->json('data');
        $p = $v['props'];
        $this->assertSame(['Rakitan', 'REMOTION', '9:16', 'ANTRE'], [$v['komposisi'], $v['mesin'], $v['rasio'], $v['render_status']]);
        $this->assertArrayNotHasKey('kunci_asing', $p);
        $this->assertSame(['Nunito', ['#2563eb']], [$p['merek']['huruf'], $p['merek']['warna']]); // huruf asing & warna tidak sah dibuang
        $a = $p['adegan'][0];
        $this->assertEquals([30, 'pudar', null], [$a['durasi'], $a['transisi'], $a['latar']['gambar']]); // durasi dijepit, URL luar ditolak
        $this->assertCount(1, $a['elemen']); // tipe asing & gambar tanpa aset sah dibuang
        $this->assertEquals([120, 'pop', 'denyut'], [$a['elemen'][0]['y'], $a['elemen'][0]['masuk']['preset'], $a['elemen'][0]['gerak']]);
        $this->assertArrayNotHasKey('onclick', $a['elemen'][0]);

        // Render ulang dari Studio memakai jalur rakitan juga
        $this->postJson("/api/video-belajar/{$v['id_video']}/render", $this->naskah())->assertOk();
    }

    public function test_aset_merek_dan_antrean_per_mesin(): void
    {
        $this->sebagai($this->sekolah->admin)->putJson('/api/video-belajar/studio', ['id_pembuat' => $this->sekolah->guruA->id, 'mesin' => 'REVIDEO'])->assertOk();
        $this->sebagai($this->sekolah->guruA);
        $this->post('/api/video-belajar/aset', ['gambar' => UploadedFile::fake()->createWithContent('a.txt', 'bukan gambar')], ['Accept' => 'application/json'])->assertUnprocessable();
        $url = $this->post('/api/video-belajar/aset', ['gambar' => UploadedFile::fake()->createWithContent('logo.png', base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='))], ['Accept' => 'application/json'])->assertCreated()->json('url');
        $this->assertMatchesRegularExpression('#^/storage/video-aset/aset_\w+\.png$#', $url);
        Storage::disk('public')->assertExists(substr($url, strlen('/storage/')));

        // Merek sekolah disimpan oleh pembuat; mesin hanya oleh admin
        $this->putJson('/api/video-belajar/studio', ['merek' => ['logo' => $url, 'huruf' => 'Noto Serif', 'warna' => ['#f59e0b']]])->assertOk()
            ->assertJsonPath('data.merek.logo', $url);
        $this->putJson('/api/video-belajar/studio', ['mesin' => 'REMOTION'])->assertForbidden();

        $id = $this->postJson('/api/video-belajar/templat', $this->naskah())->assertCreated()->json('data.id_video');
        $this->assertSame('REVIDEO', VideoBelajar::find($id)->mesin);
        $kepala = ['X-Render-Secret' => 'rahasia-uji'];
        // Worker Remotion tidak mengambil video bermesin Revideo; worker Revideo mengambilnya
        $this->getJson('/api/internal/render/berikut', $kepala)->assertOk()->assertJsonPath('data', null);
        $this->getJson('/api/internal/render/berikut?mesin=REVIDEO', $kepala)->assertOk()->assertJsonPath('data.id_video', $id)->assertJsonPath('data.templat', 'Rakitan');
    }
}

<?php

namespace Tests\Feature;

use App\Models\User;
use App\Models\VideoBelajar;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Http;
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
        $this->getJson('/api/video-belajar/studio')->assertJsonPath('data.mesin_tersedia.1.aktif', false);
        // Worker Remotion tidak mengambil video bermesin Revideo; worker Revideo mengambilnya
        $this->getJson('/api/internal/render/berikut', $kepala)->assertOk()->assertJsonPath('data', null);
        $this->getJson('/api/internal/render/berikut?mesin=REVIDEO', $kepala)->assertOk()->assertJsonPath('data.id_video', $id)
            ->assertJsonPath('data.templat', 'Rakitan')->assertJsonPath('data.mesin', 'REVIDEO');
        // Layanan Revideo yang mengambil antrean menandai mesinnya aktif di pengaturan Studio
        $this->getJson('/api/video-belajar/studio')->assertJsonPath('data.mesin_tersedia.1.aktif', true);

        // Render ulang mengikuti mesin yang sedang dipilih admin
        $this->postJson("/api/internal/render/{$id}/gagal", ['pesan' => 'uji'], $kepala)->assertOk();
        $this->sebagai($this->sekolah->admin)->putJson('/api/video-belajar/studio', ['mesin' => 'REMOTION'])->assertOk();
        $this->sebagai($this->sekolah->guruA)->postJson("/api/video-belajar/{$id}/render", $this->naskah())->assertOk();
        $this->assertSame(['REMOTION', 'ANTRE'], [VideoBelajar::find($id)->mesin, VideoBelajar::find($id)->render_status]);
    }

    public function test_e1_gaya_visual_tata_letak_baru_dan_terapkan_gaya(): void
    {
        config(['services.ai_services.gemini_key' => 'uji']);
        $this->sebagai($this->sekolah->admin)->putJson('/api/video-belajar/studio', ['id_pembuat' => $this->sekolah->guruA->id])->assertOk();
        $papan = ['judul' => 'Profil Sekolah', 'adegan' => [
            ['tata' => 'fakta', 'narasi' => 'Kini kami mendidik seribu dua ratus siswa.', 'judul' => '1.250 siswa', 'subjudul' => 'tahun ajaran ini', 'emoji' => '🎓', 'latar' => '#ffcc00'],
            ['tata' => 'kutipan', 'narasi' => 'Semboyan kami.', 'judul' => 'Belajar dengan hati, tumbuh bersama', 'subjudul' => 'Semboyan sekolah', 'latar' => '#2563eb'],
            ['tata' => 'perbandingan', 'narasi' => 'Dulu dan sekarang.', 'judul' => 'Dulu vs Sekarang', 'poin' => [['emoji' => '📒', 'teks' => 'Papan tulis'], ['emoji' => '💻', 'teks' => 'Kelas digital']]],
            ['tata' => 'linimasa', 'narasi' => 'Tiga langkah mendaftar.', 'judul' => 'Cara Mendaftar', 'poin' => [['teks' => 'Isi formulir'], ['teks' => 'Verifikasi'], ['teks' => 'Mulai belajar']]],
        ]];
        Http::fake(['generativelanguage.googleapis.com/*' => Http::response(['candidates' => [['content' => ['parts' => [['text' => json_encode($papan)]]]]]])]);
        $this->sebagai($this->sekolah->guruA);
        $n = $this->postJson('/api/video-belajar/papan-cerita', ['permintaan' => 'Video profil sekolah yang elegan', 'tujuan' => 'PROMOSI', 'rasio' => '16:9', 'jumlah_adegan' => 4, 'ai_mode' => 'GEMINI', 'gaya' => 'elegan'])
            ->assertOk()->json('naskah');
        $this->assertSame('elegan', $n['gaya']);
        [$fakta, $kutipan, $banding, $lini] = $n['adegan'];
        // Gaya Elegan: palet gelap sendiri, latar gumpalan, kamera bergerak, judul Playfair, teks pendukung berkartu kaca
        $this->assertSame(['gradien', '#0f172a', 'gumpalan', 'zoom-masuk'], [$fakta['latar']['tipe'], $fakta['latar']['warna'], $fakta['latar']['hias'], $fakta['kamera']]);
        $judul = collect($fakta['elemen'])->firstWhere('isi', '1.250 siswa');
        $this->assertSame(['hitung', 'Playfair Display'], [$judul['masuk']['preset'], $judul['gaya']['huruf']]); // angka menghitung naik
        $this->assertTrue(collect($fakta['elemen'])->firstWhere('isi', 'tahun ajaran ini')['gaya']['kaca']);
        $this->assertSame('— Semboyan sekolah', collect($kutipan['elemen'])->last()['isi']);
        $this->assertSame(['📒', 'Papan tulis', '💻', 'Kelas digital', 'vs'], array_values(array_slice(array_column($banding['elemen'], 'isi'), 1)));
        $this->assertCount(11, $lini['elemen']); // judul + garis + 3 × (lingkaran + nomor + label)
        $bulat = collect($lini['elemen'])->firstWhere('isi', 'bulat');
        $this->assertEqualsWithDelta($bulat['w'] * 16 / 9, $bulat['h'], 0.05); // tetap bulat di bingkai 16:9

        // Terapkan gaya Modern ke naskah yang sedang dirakit; kolom tak dikenal dibersihkan
        $n['adegan'][0]['latar']['hias'] = 'sihir';
        $n['adegan'][0]['kamera'] = 'terbang';
        $n['rasio'] = '9:16';
        $m = $this->postJson('/api/video-belajar/terapkan-gaya', ['naskah' => $n, 'gaya' => 'modern'])->assertOk()->json('naskah');
        $this->assertSame(['9:16', true], [$m['rasio'], $m['subtitle']]); // kunci naskah di luar adegan tetap utuh
        $this->assertSame(['modern', 'Poppins', '#7c3aed', 'gelombang', 'geser-kiri'], [$m['gaya'], $m['merek']['huruf'], $m['adegan'][0]['latar']['warna'], $m['adegan'][0]['latar']['hias'], $m['adegan'][0]['kamera']]);
        $this->assertSame('hitung', collect($m['adegan'][0]['elemen'])->firstWhere('isi', '1.250 siswa')['masuk']['preset']); // hitung dipertahankan
        $this->assertSame('kata', collect($m['adegan'][1]['elemen'])->firstWhere('isi', 'Belajar dengan hati, tumbuh bersama')['masuk']['preset']);
        $this->postJson('/api/video-belajar/terapkan-gaya', ['naskah' => $n, 'gaya' => 'mewah'])->assertUnprocessable();
        $this->sebagai($this->sekolah->guruB)->postJson('/api/video-belajar/terapkan-gaya', ['naskah' => $n, 'gaya' => 'modern'])->assertForbidden();
        $this->assertSame(['ceria', 'elegan', 'formal', 'modern'], array_column($this->sebagai($this->sekolah->admin)->getJson('/api/video-belajar/studio')->json('data.gaya_tersedia'), 'kode'));
    }

    private const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

    public function test_d2_musik_keluar_izin_foto_siswa_tujuan_dan_templat(): void
    {
        $this->sebagai($this->sekolah->admin)->putJson('/api/video-belajar/studio', ['id_pembuat' => $this->sekolah->guruA->id])->assertOk();
        $this->sebagai($this->sekolah->guruA);
        $unggah = fn(array $data) => $this->post('/api/video-belajar/aset', $data, ['Accept' => 'application/json']);
        $foto = $unggah(['gambar' => UploadedFile::fake()->createWithContent('siswa.png', base64_decode(self::PNG)), 'foto_siswa' => '1', 'izin_ortu' => '0'])->assertCreated();
        $musik = $unggah(['audio' => UploadedFile::fake()->createWithContent('lagu.mp3', "ID3      " . str_repeat("ÿû ", 64))])->assertCreated()->json('url');
        $this->assertMatchesRegularExpression('#^/storage/video-aset/aset_\w+\.mp3$#', $musik);

        $adegan = [['narasi' => 'Halo', 'latar' => ['tipe' => 'warna', 'warna' => '#ffffff'], 'elemen' => [
            ['id' => 'f1', 'tipe' => 'gambar', 'isi' => $foto->json('url'), 'x' => 50, 'y' => 50, 'w' => 40, 'h' => 40, 'keluar' => ['preset' => 'pudar', 'pada' => 2.5]],
        ]]];
        $naskah = $this->naskah($adegan);
        $naskah['props']['musik'] = ['src' => $musik, 'volume' => 3, 'redam' => true];

        // Video pembelajaran boleh; promosi dengan foto siswa tanpa izin ditolak
        $v = $this->postJson('/api/video-belajar/templat', $naskah)->assertCreated()->json('data');
        $this->assertSame('PEMBELAJARAN', $v['tujuan']);
        $this->assertEquals(['src' => $musik, 'volume' => 1, 'redam' => true], $v['props']['musik']); // volume dijepit
        $this->assertEquals(['preset' => 'pudar', 'pada' => 2.5], $v['props']['adegan'][0]['elemen'][0]['keluar']);
        $this->postJson('/api/video-belajar/templat', $naskah + ['tujuan' => 'PROMOSI'])->assertUnprocessable()
            ->assertJsonPath('message', fn($m) => str_contains($m, 'belum berizin orang tua'));
        $this->patchJson('/api/video-belajar/aset/' . $foto->json('data.id'), ['izin_ortu' => true])->assertOk();
        $promosi = $this->postJson('/api/video-belajar/templat', $naskah + ['tujuan' => 'PROMOSI'])->assertCreated()->json('data');
        $this->assertCount(2, $this->getJson('/api/video-belajar/aset')->json('data'));

        // Video promosi yang disetujui tidak tampil di Portal Siswa
        VideoBelajar::whereIn('id_video', [$v['id_video'], $promosi['id_video']])->update(['status' => 'DISETUJUI', 'file_url' => '/storage/video/x.mp4', 'disetujui_pada' => now(), 'render_status' => 'SELESAI']);
        $this->sebagai($this->sekolah->siswa);
        $portal = collect($this->getJson('/api/portal/video')->json('data'))->pluck('id_video');
        $this->assertContains($v['id_video'], $portal);
        $this->assertNotContains($promosi['id_video'], $portal);

        // Templat sekolah: simpan, daftar, hapus — hanya pembuat video
        $this->sebagai($this->sekolah->guruB)->getJson('/api/video-belajar/templat-studio')->assertForbidden();
        $this->sebagai($this->sekolah->guruA);
        $this->postJson('/api/video-belajar/templat-studio', ['judul' => 'PPDB', 'kategori' => 'ASING', 'naskah' => $naskah['props']])->assertUnprocessable();
        $id = $this->postJson('/api/video-belajar/templat-studio', ['judul' => 'PPDB', 'kategori' => 'PROMOSI', 'naskah' => $naskah['props']])->assertCreated()->json('data.id_templat');
        $t = $this->getJson('/api/video-belajar/templat-studio')->assertOk()->json('data.0');
        $this->assertSame(['PPDB', '9:16'], [$t['judul'], $t['rasio']]);
        $this->assertArrayNotHasKey('kunci_asing', $t['naskah']);
        $this->deleteJson("/api/video-belajar/templat-studio/{$id}")->assertOk();
    }

    public function test_d3_papan_cerita_ai_dan_render_beberapa_rasio(): void
    {
        config(['services.ai_services.gemini_key' => 'uji']);
        $this->sebagai($this->sekolah->admin)->putJson('/api/video-belajar/studio', ['id_pembuat' => $this->sekolah->guruA->id])->assertOk();
        $papan = ['judul' => 'PPDB 2027', 'adegan' => [
            ['tata' => 'pembuka', 'narasi' => 'Halo, ayo bersekolah di sini.', 'judul' => 'Ayo Sekolah', 'subjudul' => 'Pendaftaran dibuka', 'emoji' => '🏫', 'latar' => '#2563eb', 'warna_teks' => '#ffffff'],
            ['tata' => 'daftar', 'narasi' => 'Kami punya banyak kegiatan.', 'judul' => 'Kegiatan', 'latar' => '#fde68a',
                'poin' => [['emoji' => '📚', 'teks' => 'Literasi'], ['emoji' => '⚽', 'teks' => 'Olahraga'], ['emoji' => '🎨', 'teks' => 'Seni'], ['emoji' => '🎵', 'teks' => 'Musik (dibuang)']]],
            ['tata' => 'sihir', 'narasi' => 'Daftar sekarang!', 'judul' => 'Daftar!', 'emoji' => '✅', 'latar' => 'bukan-warna'],
        ]];
        Http::fake(['generativelanguage.googleapis.com/*' => Http::response(['candidates' => [['content' => ['parts' => [['text' => json_encode($papan)]]]]]])]);

        $this->sebagai($this->sekolah->guruB)->postJson('/api/video-belajar/papan-cerita', ['permintaan' => 'Video promosi PPDB sekolah', 'tujuan' => 'PROMOSI', 'rasio' => '9:16', 'jumlah_adegan' => 3, 'ai_mode' => 'GEMINI'])->assertForbidden();
        $this->sebagai($this->sekolah->guruA);
        $n = $this->postJson('/api/video-belajar/papan-cerita', ['permintaan' => 'Video promosi PPDB sekolah', 'tujuan' => 'PROMOSI', 'rasio' => '9:16', 'jumlah_adegan' => 3, 'ai_mode' => 'GEMINI'])
            ->assertOk()->json('naskah');
        $this->assertSame(['9:16', 'PPDB 2027', 3], [$n['rasio'], $n['judul'], count($n['adegan'])]);
        $this->assertSame(['emoji', 'teks', 'teks'], array_column($n['adegan'][0]['elemen'], 'tipe'));
        $this->assertCount(7, $n['adegan'][1]['elemen']); // judul + 3 poin × (emoji + teks); poin keempat dibuang
        $this->assertSame('#1f2937', $n['adegan'][1]['elemen'][0]['gaya']['warna']); // teks gelap di atas latar terang
        $this->assertSame('#2563eb', $n['adegan'][2]['latar']['warna']); // latar tidak sah diganti warna bawaan
        $this->assertNotEmpty($n['adegan'][2]['elemen']); // tata letak asing → emoji-besar

        // Satu naskah dirender ke 9:16 dan 16:9 sekaligus
        $r = $this->postJson('/api/video-belajar/templat', ['templat' => 'Rakitan', 'judul' => 'PPDB', 'suara' => 'LOKAL', 'tujuan' => 'PROMOSI', 'props' => $n, 'rasio_tambahan' => ['16:9', '9:16']])
            ->assertCreated();
        $this->assertSame('PPDB (9:16)', $r->json('data.judul'));
        $this->assertSame([['judul' => 'PPDB (16:9)', 'rasio' => '16:9']], array_map(fn($t) => array_intersect_key($t, ['judul' => 1, 'rasio' => 1]), $r->json('tambahan')));
        $this->assertSame('16:9', VideoBelajar::where('judul', 'PPDB (16:9)')->first()->props['rasio']);
    }
}

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

    public function test_e2_elemen_ikon_pustaka_dan_emoji_3d(): void
    {
        $this->sebagai($this->sekolah->admin)->putJson('/api/video-belajar/studio', ['id_pembuat' => $this->sekolah->guruA->id])->assertOk();
        $el = fn(array $x) => array_merge(['x' => 50, 'y' => 50, 'w' => 20, 'h' => 20], $x);
        $naskah = ['rasio' => '16:9', 'adegan' => [['narasi' => 'Uji pustaka.', 'elemen' => [
            $el(['tipe' => 'ikon', 'isi' => 'outline/school', 'gaya' => ['warna' => '#fbbf24', 'tebal' => false]]),
            $el(['tipe' => 'ikon', 'isi' => 'filled/star']),
            $el(['tipe' => 'ikon', 'isi' => '../../etc/passwd']),      // jalur liar dibuang
            $el(['tipe' => 'ikon', 'isi' => 'duotone/school']),       // gaya tak dikenal dibuang
            $el(['tipe' => 'emoji', 'isi' => '🏫']),
            $el(['tipe' => 'emoji', 'isi' => '🎓', 'gaya' => ['emoji' => 'datar']]),
        ]]]];
        $n = $this->sebagai($this->sekolah->guruA)->postJson('/api/video-belajar/terapkan-gaya', ['naskah' => $naskah, 'gaya' => 'ceria', 'warna' => false])
            ->assertOk()->json('naskah.adegan.0.elemen');
        $this->assertSame(['outline/school', 'filled/star', '🏫', '🎓'], array_column($n, 'isi'));
        $this->assertSame(['ikon', 'ikon', 'emoji', 'emoji'], array_column($n, 'tipe'));
        $this->assertSame(['#fbbf24', false], [$n[0]['gaya']['warna'], $n[0]['gaya']['tebal']]);
        $this->assertSame(['3d', 'datar'], [$n[2]['gaya']['emoji'], $n[3]['gaya']['emoji']]); // emoji 3D jadi bawaan
    }

    public function test_e3_unggah_svg_dan_lottie_dibersihkan(): void
    {
        $this->sebagai($this->sekolah->admin)->putJson('/api/video-belajar/studio', ['id_pembuat' => $this->sekolah->guruA->id])->assertOk();
        $this->sebagai($this->sekolah->guruA);
        $kirim = fn(array $isi) => $this->post('/api/video-belajar/aset', $isi, ['Accept' => 'application/json']);

        // SVG: skrip, event handler, foreignObject, dan tautan luar dibuang; ukuran intrinsik dari viewBox (2048 px)
        $svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 50" onload="alert(1)"><script>alert(2)</script>'
            . '<foreignObject><div>x</div></foreignObject><rect width="100" height="50" fill="#f00" onclick="alert(3)"/>'
            . '<image href="https://jahat.example/a.png"/><use href="#r"/><circle style="fill:url(https://jahat.example/x)" r="5"/></svg>';
        $r = $kirim(['gambar' => UploadedFile::fake()->createWithContent('logo.svg', $svg)])->assertCreated();
        $this->assertSame('SVG', $r->json('data.jenis'));
        $bersih = Storage::disk('public')->get(str_replace('/storage/', '', $r->json('url')));
        foreach (['script', 'onload', 'onclick', 'foreignObject', 'jahat.example'] as $x) $this->assertStringNotContainsString($x, $bersih);
        $this->assertStringContainsString('width="2048" height="1024"', $bersih);
        $this->assertStringContainsString('href="#r"', $bersih);
        $kirim(['gambar' => UploadedFile::fake()->createWithContent('x.svg', '<!DOCTYPE svg [<!ENTITY a "b">]><svg viewBox="0 0 1 1"/>')])->assertUnprocessable();
        $kirim(['gambar' => UploadedFile::fake()->createWithContent('x.svg', '<html><body>bukan svg</body></html>')])->assertUnprocessable();

        // Lottie: expression (kode di kunci "x") dibuang; gambar luar ditolak
        $lottie = ['v' => '5.7.0', 'fr' => 30, 'ip' => 0, 'op' => 60, 'w' => 200, 'h' => 200, 'assets' => [], 'layers' => [[
            'ty' => 4, 'ks' => ['o' => ['a' => 0, 'k' => 100, 'x' => 'eval("alert(1)")'], 'p' => ['a' => 1, 'k' => [['t' => 0, 's' => [0, 0], 'i' => ['x' => [0.5], 'y' => [1]]]]]],
        ]]];
        $r = $kirim(['lottie' => UploadedFile::fake()->createWithContent('anim.json', json_encode($lottie))])->assertCreated();
        $this->assertSame(['LOTTIE', 30, 60], [$r->json('data.jenis'), $r->json('lottie.fr'), $r->json('lottie.op')]);
        $isi = json_decode(Storage::disk('public')->get(str_replace('/storage/', '', $r->json('url'))), true);
        $this->assertArrayNotHasKey('x', $isi['layers'][0]['ks']['o']);
        $this->assertSame([0.5], $isi['layers'][0]['ks']['p']['k'][0]['i']['x']); // angka easing tetap
        $lottie['assets'] = [['id' => 'img', 'w' => 10, 'h' => 10, 'u' => 'https://jahat.example/', 'p' => 'a.png']];
        $kirim(['lottie' => UploadedFile::fake()->createWithContent('anim.json', json_encode($lottie))])->assertUnprocessable();
        $kirim(['lottie' => UploadedFile::fake()->createWithContent('anim.json', '{"bukan":"lottie"}')])->assertUnprocessable();

        // Naskah: elemen lottie & gambar SVG diterima, jalur liar dibuang
        $n = $this->postJson('/api/video-belajar/terapkan-gaya', ['gaya' => 'ceria', 'warna' => false, 'naskah' => ['rasio' => '16:9', 'adegan' => [['elemen' => [
            ['tipe' => 'lottie', 'isi' => $r->json('url'), 'gaya' => ['ulang' => false, 'kecepatan' => 9]],
            ['tipe' => 'lottie', 'isi' => '/storage/lain/a.json'],
            ['tipe' => 'gambar', 'isi' => '/storage/video-aset/aset_abc.svg'],
        ]]]]])->assertOk()->json('naskah.adegan.0.elemen');
        $this->assertSame(['lottie', 'gambar'], array_column($n, 'tipe'));
        $this->assertSame([false, 3.0], [$n[0]['gaya']['ulang'], (float) $n[0]['gaya']['kecepatan']]);
    }

    public function test_e3_impor_desain_canva(): void
    {
        $this->sebagai($this->sekolah->admin)->putJson('/api/video-belajar/studio', ['id_pembuat' => $this->sekolah->guruA->id])->assertOk();
        $this->sebagai($this->sekolah->guruA)->getJson('/api/video-belajar/canva')->assertOk()->assertJsonPath('data.terkonfigurasi', false);
        $this->postJson('/api/video-belajar/canva/sambung', ['asal' => 'https://web.sekolah.test'])->assertUnprocessable();

        // Admin mengisi kredensial integrasi; secret terenkripsi dan tidak pernah dikirim balik
        $this->sebagai($this->sekolah->admin)->getJson('/api/settings')->assertOk();
        $this->postJson('/api/settings', ['canva_client_id' => 'OC-uji123', 'canva_client_secret' => 'cnvca-rahasia'])->assertOk();
        $this->assertNotSame('cnvca-rahasia', \DB::table('school_settings')->value('canva_client_secret'));
        $set = $this->getJson('/api/settings')->assertOk();
        $this->assertTrue($set->json('has_canva_client_secret'));
        $this->assertArrayNotHasKey('canva_client_secret', $set->json());

        $this->sebagai($this->sekolah->guruA);
        $this->postJson('/api/video-belajar/canva/sambung', ['asal' => 'javascript:alert(1)'])->assertUnprocessable();
        $url = $this->postJson('/api/video-belajar/canva/sambung', ['asal' => 'https://web.sekolah.test'])->assertOk()->json('url');
        parse_str(parse_url($url, PHP_URL_QUERY), $q);
        $this->assertSame(['OC-uji123', 'S256', 'https://web.sekolah.test/api/video-belajar/canva/kembali'], [$q['client_id'], $q['code_challenge_method'], $q['redirect_uri']]);

        $png = base64_decode(self::PNG);
        Http::fake([
            'api.canva.com/rest/v1/oauth/token' => Http::sequence()
                ->push(['access_token' => 'akses-1', 'refresh_token' => 'segar-1', 'expires_in' => 14400, 'token_type' => 'Bearer'])
                ->push(['access_token' => 'akses-2', 'refresh_token' => 'segar-2', 'expires_in' => 14400, 'token_type' => 'Bearer']),
            'api.canva.com/rest/v1/users/me/profile' => Http::response(['profile' => ['display_name' => 'Guru Uji']]),
            'api.canva.com/rest/v1/designs*' => Http::response(['items' => [['id' => 'DAF123', 'title' => 'Poster PPDB', 'thumbnail' => ['url' => 'https://document-export.canva.com/t.png'], 'page_count' => 2]]]),
            'api.canva.com/rest/v1/exports/JOB1' => Http::response(['job' => ['id' => 'JOB1', 'status' => 'success', 'urls' => ['https://export-download.canva.com/1.png', 'https://export-download.canva.com/2.png']]]),
            'api.canva.com/rest/v1/exports' => Http::response(['job' => ['id' => 'JOB1', 'status' => 'in_progress']]),
            'export-download.canva.com/*' => Http::response($png, 200, ['Content-Type' => 'image/png']),
        ]);

        // Callback tanpa login: state tak dikenal ditolak; state sah menyimpan token terenkripsi
        $this->get('/api/video-belajar/canva/kembali?state=' . str_repeat('a', 40) . '&code=x')->assertStatus(400);
        $this->get("/api/video-belajar/canva/kembali?state={$q['state']}&code=kode-uji")->assertRedirect('https://web.sekolah.test/canva-selesai.html?canva=tersambung');
        $this->get("/api/video-belajar/canva/kembali?state={$q['state']}&code=kode-uji")->assertStatus(400); // state sekali pakai
        $this->assertNotSame('akses-1', \DB::table('canva_token')->value('access_token'));
        $this->getJson('/api/video-belajar/canva')->assertJsonPath('data.tersambung', true)->assertJsonPath('data.nama', 'Guru Uji');
        Http::assertSent(fn($r) => $r->url() === 'https://api.canva.com/rest/v1/oauth/token' && $r['grant_type'] === 'authorization_code'
            && $r['code_verifier'] && $r->hasHeader('Authorization', 'Basic ' . base64_encode('OC-uji123:cnvca-rahasia')));

        $this->getJson('/api/video-belajar/canva/desain?cari=ppdb')->assertOk()->assertJsonPath('data.items.0.judul', 'Poster PPDB');

        // Token kedaluwarsa → diperbarui dengan refresh token (sekali pakai), lalu ekspor 2 halaman jadi aset gambar
        \DB::table('canva_token')->update(['kedaluwarsa' => now()->subMinute()]);
        $r = $this->postJson('/api/video-belajar/canva/impor', ['id_desain' => 'DAF123', 'judul' => 'Poster PPDB', 'format' => 'png', 'halaman' => [1, 2]])->assertCreated();
        $this->assertCount(2, $r->json('data'));
        $this->assertSame('Canva: Poster PPDB (hal. 2)', $r->json('data.1.nama_asli'));
        Storage::disk('public')->assertExists(str_replace('/storage/', '', $r->json('data.0.path')));
        Http::assertSent(fn($r) => str_ends_with($r->url(), '/oauth/token') && $r['grant_type'] === 'refresh_token' && $r['refresh_token'] === 'segar-1');
        Http::assertSent(fn($r) => str_ends_with($r->url(), '/exports') && $r['format'] === ['type' => 'png', 'pages' => [1, 2]] && $r->hasHeader('Authorization', 'Bearer akses-2'));

        // Guru lain bukan pembuat video tidak boleh; putuskan menghapus token
        $this->sebagai($this->sekolah->guruB)->getJson('/api/video-belajar/canva/desain')->assertForbidden();
        $this->sebagai($this->sekolah->guruA)->deleteJson('/api/video-belajar/canva/sambung')->assertOk();
        $this->assertSame(0, \DB::table('canva_token')->count());
    }

    public function test_e4_elemen_video_unggah_dan_mp4_canva(): void
    {
        $this->sebagai($this->sekolah->admin)->putJson('/api/video-belajar/studio', ['id_pembuat' => $this->sekolah->guruA->id])->assertOk();
        $this->sebagai($this->sekolah->guruA);
        $mp4 = "\x00\x00\x00\x18ftypisom\x00\x00\x02\x00isomiso2" . str_repeat("\x00", 64);
        $r = $this->post('/api/video-belajar/aset', ['video' => UploadedFile::fake()->createWithContent('klip.mp4', $mp4)->mimeType('video/mp4'), 'foto_siswa' => '1', 'izin_ortu' => '0'],
            ['Accept' => 'application/json'])->assertCreated();
        $this->assertSame(['VIDEO', true, false], [$r->json('data.jenis'), $r->json('data.foto_siswa'), $r->json('data.izin_ortu')]);
        $this->assertMatchesRegularExpression('#^/storage/video-aset/aset_\w+\.mp4$#', $r->json('url'));
        $this->post('/api/video-belajar/aset', ['video' => UploadedFile::fake()->createWithContent('x.mp4', '<html>')], ['Accept' => 'application/json'])->assertUnprocessable();

        // Naskah: elemen video diterima dengan gaya klip yang dibatasi; jalur liar dibuang
        $n = $this->postJson('/api/video-belajar/terapkan-gaya', ['gaya' => 'ceria', 'warna' => false, 'naskah' => ['rasio' => '16:9', 'adegan' => [['elemen' => [
            ['tipe' => 'video', 'isi' => $r->json('url'), 'gaya' => ['bisu' => false, 'ulang' => false, 'volume' => 5, 'potong' => 2, 'durasi_klip' => 8.5, 'isi_bingkai' => 'muat']],
            ['tipe' => 'video', 'isi' => '/storage/lain/x.mp4'],
        ]]]]])->assertOk()->json('naskah.adegan.0.elemen');
        $this->assertCount(1, $n);
        $g = $n[0]['gaya'];
        $this->assertSame([false, false, 1.0, 2.0, 8.5, 'muat'], [$g['bisu'], $g['ulang'], (float) $g['volume'], (float) $g['potong'], (float) $g['durasi_klip'], $g['isi_bingkai']]);
        // Video berisi siswa tanpa izin ikut diperiksa seperti foto sebelum dibagikan
        $this->assertSame([$r->json('url')], \App\Services\NaskahVideo::asetGambar(['adegan' => [['elemen' => $n]]]));

        // Canva: ekspor MP4 (satu berkas) menjadi aset VIDEO
        $this->sebagai($this->sekolah->admin)->postJson('/api/settings', ['canva_client_id' => 'OC-uji', 'canva_client_secret' => 'cnvca-x'])->assertOk();
        \DB::table('canva_token')->insert(['id_user' => $this->sekolah->guruA->id, 'access_token' => encrypt('akses'), 'refresh_token' => encrypt('segar'),
            'kedaluwarsa' => now()->addHour(), 'created_at' => now(), 'updated_at' => now()]);
        Http::fake([
            'api.canva.com/rest/v1/exports/JOBV' => Http::response(['job' => ['id' => 'JOBV', 'status' => 'success', 'urls' => ['https://export-download.canva.com/v.mp4']]]),
            'api.canva.com/rest/v1/exports' => Http::response(['job' => ['id' => 'JOBV', 'status' => 'in_progress']]),
            'export-download.canva.com/*' => Http::response($mp4, 200, ['Content-Type' => 'video/mp4']),
        ]);
        $c = $this->sebagai($this->sekolah->guruA)->postJson('/api/video-belajar/canva/impor', ['id_desain' => 'DAFV', 'judul' => 'Promo', 'format' => 'mp4', 'tegak' => true])->assertCreated();
        $this->assertSame(['VIDEO', 'Canva: Promo (video)'], [$c->json('data.0.jenis'), $c->json('data.0.nama_asli')]);
        Http::assertSent(fn($q) => str_ends_with($q->url(), '/exports') && $q['format'] === ['type' => 'mp4', 'quality' => 'vertical_1080p']);
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

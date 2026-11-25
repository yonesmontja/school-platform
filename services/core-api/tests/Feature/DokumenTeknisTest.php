<?php

namespace Tests\Feature;

use App\Models\User;
use App\Services\DiagramTeknis;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\Concerns\MembuatDataSekolah;
use Tests\TestCase;

/** Dokumen Teknis: khusus admin (peninjau pun ditolak), bab dari repo, diagram SVG, dan data hidup terisi. */
class DokumenTeknisTest extends TestCase
{
    use RefreshDatabase, MembuatDataSekolah;

    protected function setUp(): void
    {
        parent::setUp();
        $this->buatSekolah();
    }

    public function test_admin_membaca_bab_diagram_dan_data_hidup(): void
    {
        Sanctum::actingAs($this->sekolah->admin);
        $res = $this->getJson('/api/dokumen-teknis')->assertOk();

        $bab = collect($res->json('bab'));
        $this->assertGreaterThanOrEqual(8, $bab->count());
        $this->assertSame('Bab I Pendahuluan', $bab->firstWhere('slug', 'pendahuluan')['judul']);

        $semua = $bab->pluck('html')->implode('');
        // Diagram tergambar sebagai SVG, tanpa galat dan tanpa penanda yang tertinggal
        $this->assertGreaterThanOrEqual(20, substr_count($semua, '<figure class="dt-gambar"'));
        $this->assertStringNotContainsString('dt-galat', $semua);
        $this->assertStringContainsString('Diagram use case Guru', $semua);
        // Penanda hanya tersisa sekali, yaitu yang sengaja ditulis apa adanya di Lampiran E
        $this->assertSame(1, substr_count($semua, '{{statistik}}'));
        $this->assertSame(1, substr_count($semua, '{{daftar_endpoint}}'));
        // Data hidup: endpoint dokumen teknis sendiri ada di lampiran, tabel users terdaftar, tes ini terhitung
        $this->assertStringContainsString('/dokumen-teknis', $semua);
        $this->assertStringContainsString('<code>users</code>', $semua);
        $this->assertStringContainsString('DokumenTeknisTest', $semua);

        $statistik = collect($res->json('statistik'))->keyBy('label');
        $this->assertGreaterThan(100, $statistik['Endpoint API']['nilai']);
        $this->assertSame(4, $statistik['Siswa aktif']['nilai']);
        // Daftar isi: subbab punya id yang dipakai untuk melompat
        $this->assertContains('pendahuluan-11-latar-belakang', collect($bab->firstWhere('slug', 'pendahuluan')['bagian'])->pluck('id')->all());
        $this->assertNotEmpty($res->json('meta.judul'));
    }

    public function test_hanya_admin_termasuk_peninjau_ditolak(): void
    {
        foreach ([$this->sekolah->kepsek, $this->sekolah->guruA, $this->sekolah->siswa] as $akun) {
            Sanctum::actingAs($akun);
            $this->getJson('/api/dokumen-teknis')->assertForbidden();
        }
        Sanctum::actingAs(User::create(['name' => 'Yayasan', 'username' => 'yayasan_uji', 'password' => 'rahasia123', 'role' => 'yayasan', 'aktif' => true]));
        $this->getJson('/api/dokumen-teknis')->assertForbidden();
    }

    public function test_diagram_tidak_valid_ditampilkan_sebagai_galat_bukan_error(): void
    {
        $this->assertStringContainsString('dt-galat', DiagramTeknis::render('{bukan json'));
        $this->assertStringContainsString('dt-galat', DiagramTeknis::render('{"jenis":"lain"}'));
        $svg = DiagramTeknis::render('{"jenis":"alir","nomor":"9.1","judul":"Uji <b>",'
            . '"simpul":[{"id":"a","teks":"A & B","x":0,"y":0},{"id":"b","teks":"C","x":1,"y":0}],"panah":[{"dari":"a","ke":"b","teks":"lanjut"}]}');
        $this->assertStringContainsString('id="gambar-9-1"', $svg);
        $this->assertStringContainsString('A &amp; B', $svg);
        $this->assertStringNotContainsString('<b>', $svg);
    }
}

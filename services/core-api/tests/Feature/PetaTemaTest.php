<?php

namespace Tests\Feature;

use App\Models\MasterIndikator;
use App\Models\PetaTema;
use App\Models\TransJadwal;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Laravel\Sanctum\Sanctum;
use Tests\Concerns\MembuatDataSekolah;
use Tests\TestCase;

/**
 * Peta Tema / spider web PBPM: kepala sekolah menyusun & menetapkan tema lintas mapel (AI menyusun draf & kalibrasi,
 * respons ditiru), admin mengisi atas nama kepala sekolah, guru hanya melihat yang ditetapkan. TP harus milik mapel
 * cabangnya, pola mingguan diambil dari Jadwal, dan tautan di editor jadwal.
 */
class PetaTemaTest extends TestCase
{
    use RefreshDatabase, MembuatDataSekolah;

    protected function setUp(): void
    {
        parent::setUp();
        $this->buatSekolah();
        MasterIndikator::create(['id_indikator' => 'IND-1', 'id_materi' => 'MTR-T', 'deskripsi' => 'Menghitung skor permainan', 'urutan' => 1]);
        config(['services.ai_services.gemini_key' => 'uji']);
    }

    private function sebagai(User $user): static
    {
        Sanctum::actingAs($user);
        return $this;
    }

    /** Jawaban AI berurutan (stub Http::fake pertama yang cocok selalu dipakai, jadi semua jawaban didaftarkan sekaligus). */
    private function gemini(array ...$jawaban): void
    {
        $urut = Http::sequence();
        foreach ($jawaban as $json) $urut->push(['candidates' => [['content' => ['parts' => [['text' => json_encode($json)]]]]]]);
        Http::fake(['generativelanguage.googleapis.com/*' => $urut]);
    }

    public function test_kepsek_menyusun_peta_tema_dengan_ai_kalibrasi_lalu_menetapkan(): void
    {
        $s = $this->sekolah;
        // Guru tidak menyusun peta tema; kepala sekolah memakai semua mapel (tema lintas mapel)
        $this->sebagai($s->guruA)->postJson('/api/perangkat-ajar/tema', ['judul' => 'Main Bola'])->assertForbidden();
        $this->sebagai($s->kepsek)->getJson('/api/perangkat-ajar/tema/referensi?id_kelas=KLS-A')->assertOk()
            ->assertJsonPath('mapel.0.nama_mapel', 'IPA')->assertJsonPath('mapel.1.tp.0.id_indikator', 'IND-1');

        $id = $this->postJson('/api/perangkat-ajar/tema', ['judul' => 'Main Bola', 'id_kelas' => 'KLS-A', 'jumlah_minggu' => 2,
            'jaring' => ['mapel' => [['id_mapel' => 'MPL-A', 'nama' => 'Matematika', 'tp' => ['IND-1']], ['id_mapel' => 'MPL-B', 'nama' => 'IPA', 'tp' => ['IND-1']]]]])
            ->assertCreated()->assertJsonPath('data.fase', 'B')->assertJsonPath('data.status', 'DRAF')
            ->assertJsonPath('data.pendekatan', PetaTema::PENDEKATAN_BAWAAN)
            // TP Matematika tidak boleh menempel di cabang IPA
            ->assertJsonPath('data.jaring.mapel.0.tp', ['IND-1'])->assertJsonPath('data.jaring.mapel.1.tp', [])
            ->assertJsonCount(2, 'data.minggu')->json('data.id_peta');

        // AI: draf lengkap (mapel asing & TP palsu dibuang), lalu kalibrasi
        $this->gemini(['kategori' => 'HOBI',
            'mapel' => [['id_mapel' => 'MPL-A', 'kalibrasi' => 'Hitung skor & ukuran lapangan', 'tp' => ['IND-1', 'IND-PALSU']],
                ['id_mapel' => 'MPL-B', 'kalibrasi' => 'Gaya pada bola yang ditendang', 'tp' => []], ['id_mapel' => 'MPL-X', 'kalibrasi' => 'asing']],
            'konsep' => [['label' => 'Aturan Permainan', 'detail' => 'jumlah pemain, waktu, wasit, skor'], ['label' => 'Sejarah', 'detail' => 'sepak bola di Papua']],
            'minggu' => [['ke' => 1, 'judul' => 'Aku', 'realita' => 'Anak bermain bola di kampung', 'imajinasi' => 'Menggambar lapangan', 'makna' => 'Sportif', 'produk' => 'Gambar lapangan']]],
            ['mapel' => [['id_mapel' => 'MPL-A', 'kalibrasi' => 'Menjumlahkan gol dua babak', 'tp' => ['IND-1']]]]);
        $draf = $this->postJson("/api/perangkat-ajar/tema/{$id}/ai", ['ai_mode' => 'GEMINI', 'bagian' => 'semua', 'mapel' => ['MPL-A', 'MPL-B']])->assertOk()->json();
        $this->assertSame('HOBI', $draf['jaring']['kategori']);
        $this->assertSame(['MPL-A', 'MPL-B'], array_column($draf['jaring']['mapel'], 'id_mapel'));
        $this->assertSame(['IND-1'], $draf['jaring']['mapel'][0]['tp']);
        $this->assertCount(2, $draf['jaring']['konsep']);
        $this->assertCount(2, $draf['minggu']); // tepat jumlah_minggu, minggu ke-2 kosong untuk diisi guru
        $this->assertSame('', $draf['minggu'][1]['realita']);

        // Belum lengkap → belum bisa ditetapkan
        $this->postJson("/api/perangkat-ajar/tema/{$id}/tetapkan")->assertStatus(422);
        $this->putJson("/api/perangkat-ajar/tema/{$id}", ['jaring' => $draf['jaring'], 'minggu' => $draf['minggu'], 'sumber' => 'AI', 'ai_mode' => 'GEMINI'])
            ->assertOk()->assertJsonPath('data.sumber', 'AI')->assertJsonPath('data.tp_detail.IND-1', 'Menghitung skor permainan');

        // Kalibrasi: hanya isi cabang yang berubah, id cabang & konsep dipertahankan
        $idCabang = PetaTema::find($id)->jaring['mapel'][0]['id'];
        $kal = $this->postJson("/api/perangkat-ajar/tema/{$id}/ai", ['ai_mode' => 'GEMINI', 'bagian' => 'kalibrasi'])->assertOk()->json('jaring');
        $this->assertSame($idCabang, $kal['mapel'][0]['id']);
        $this->assertSame('Menjumlahkan gol dua babak', $kal['mapel'][0]['kalibrasi']);
        $this->assertSame('Gaya pada bola yang ditendang', $kal['mapel'][1]['kalibrasi']);
        $this->assertCount(2, $kal['konsep']);

        // Guru (wali kelas sekalipun) tidak melihat draf; setelah ditetapkan terlihat tetapi tidak bisa diubah/ditetapkan guru
        $this->sebagai($s->guruA)->getJson("/api/perangkat-ajar/tema/{$id}")->assertNotFound();
        $this->sebagai($s->guruA)->postJson("/api/perangkat-ajar/tema/{$id}/tetapkan")->assertForbidden();
        $this->sebagai($s->kepsek)->postJson("/api/perangkat-ajar/tema/{$id}/tetapkan")->assertOk();
        $this->sebagai($s->guruB)->getJson("/api/perangkat-ajar/tema/{$id}")->assertOk()->assertJsonPath('data.status', 'DISETUJUI')
            ->assertJsonPath('data.penyetuju.id', $s->kepsek->id);
        $this->sebagai($s->guruA)->putJson("/api/perangkat-ajar/tema/{$id}", ['judul' => 'Ubah'])->assertForbidden();
        $this->sebagai($s->guruA)->deleteJson("/api/perangkat-ajar/tema/{$id}")->assertForbidden();

        // Kepala sekolah mengubah peta yang sudah ditetapkan: tetap berlaku, versi naik
        $this->sebagai($s->kepsek)->putJson("/api/perangkat-ajar/tema/{$id}", ['judul' => 'Main Bola Kaki'])->assertOk()
            ->assertJsonPath('data.status', 'DISETUJUI')->assertJsonPath('data.versi', 2);

        // Admin mengisi atas nama kepala sekolah: penulis tetap kepala sekolah, akun admin tercatat sebagai penginput
        $baru = $this->sebagai($s->admin)->postJson('/api/perangkat-ajar/tema', ['judul' => 'Sagu', 'id_kelas' => 'KLS-B'])->assertCreated()
            ->assertJsonPath('data.pembuat.id', $s->kepsek->id)->assertJsonPath('data.penginput.id', $s->admin->id)->json('data.id_peta');
        $this->assertSame($s->admin->id, PetaTema::find($baru)->diinput_oleh);
    }

    public function test_high_level_peta_tema_menjadi_high_level_materi_kelas_itu(): void
    {
        $s = $this->sekolah;
        \App\Models\MasterKategoriPenilaian::create(['id_kategori' => 'KAT-ALAM', 'nama_kategori' => 'Alam']);
        \App\Models\MasterKategoriPenilaian::create(['id_kategori' => 'KAT-KHUSUS', 'nama_kategori' => 'Khusus IPA', 'id_mapel' => 'MPL-B']);
        // Referensi hanya memuat High Level semua mapel; pusat spider web mengikuti nama High Level
        $this->sebagai($s->kepsek)->getJson('/api/perangkat-ajar/tema/referensi')->assertOk()
            ->assertJsonPath('high_level.0.id_kategori', 'KAT-ALAM')->assertJsonCount(1, 'high_level');
        $id = $this->postJson('/api/perangkat-ajar/tema', ['judul' => 'Kebun Sagu', 'id_kelas' => 'KLS-A', 'id_kategori' => 'KAT-ALAM', 'tanggal_mulai' => now()->format('Y-m-d'),
            'jaring' => ['kategori' => 'diabaikan', 'mapel' => [['id_mapel' => 'MPL-A', 'nama' => 'Matematika']]]])
            ->assertCreated()->assertJsonPath('data.jaring.kategori', 'Alam')->assertJsonPath('data.kategori.nama_kategori', 'Alam')->json('data.id_peta');

        // High Level baru dari Peta Tema (kepala sekolah); nama yang sudah ada dipakai ulang, guru tidak boleh
        $this->postJson('/api/perangkat-ajar/tema/high-level', ['nama_kategori' => 'Hobi'])->assertCreated()->assertJsonPath('data.nama_kategori', 'Hobi');
        $this->postJson('/api/perangkat-ajar/tema/high-level', ['nama_kategori' => ' alam '])->assertOk()->assertJsonPath('data.id_kategori', 'KAT-ALAM');
        $this->sebagai($s->guruA)->postJson('/api/perangkat-ajar/tema/high-level', ['nama_kategori' => 'X'])->assertForbidden();

        // Formulir Materi (guru, peta masih draf): High Level otomatis dari peta tema kelas itu; peta yang memuat mapel didahulukan
        $hl = $this->sebagai($s->guruA)->getJson('/api/perangkat-ajar/tema/high-level?id_kelas=KLS-A&id_mapel=MPL-A')->assertOk()->json('data');
        $this->assertSame([$id, 'KAT-ALAM', 'Alam', true], [$hl[0]['id_peta'], $hl[0]['id_kategori'], $hl[0]['nama_kategori'], $hl[0]['memuat_mapel']]);
        $this->getJson('/api/perangkat-ajar/tema/high-level?id_kelas=KLS-B&id_mapel=MPL-A')->assertOk()->assertJsonCount(0, 'data');
    }

    public function test_detail_satu_sesi_jadwal_termasuk_hari_minggu_lama(): void
    {
        // Sesi lama di hari Minggu (sebelum aturan larangan Minggu) tersembunyi di kalender, tetapi bisa dibuka langsung
        TransJadwal::create(['id_jadwal' => 'JDW-MGG', 'id_periode' => 'PER-T', 'id_kelas' => 'KLS-A', 'id_guru' => 'GR-A', 'id_mapel' => 'MPL-A',
            'mulai' => Carbon::parse('2030-01-06 13:00'), 'selesai' => Carbon::parse('2030-01-06 14:00'), 'status_sesi' => 'Menunggu']);
        $this->sebagai($this->sekolah->guruA)->getJson('/api/jadwal/JDW-MGG')->assertOk()
            ->assertJsonPath('data.id_jadwal', 'JDW-MGG')->assertJsonPath('data.mapel.nama_mapel', 'Matematika')->assertJsonPath('data.mulai', '2030-01-06T13:00');
    }

    public function test_pola_mingguan_dari_jadwal_dan_tautan_di_editor_jadwal(): void
    {
        $s = $this->sekolah;
        $zona = config('app.zona_sekolah');
        $id = $this->sebagai($s->kepsek)->postJson('/api/perangkat-ajar/tema', ['judul' => 'Aku dan Sukuku', 'id_kelas' => 'KLS-A', 'tanggal_mulai' => '2030-01-09'])->json('data.id_peta');
        foreach ([['2030-01-07 07:30', 'MPL-A'], ['2030-01-07 09:00', 'MPL-B'], ['2030-01-09 07:30', 'MPL-A']] as $i => [$mulai, $mapel]) {
            TransJadwal::create(['id_jadwal' => "JDW-T{$i}", 'id_periode' => 'PER-T', 'id_kelas' => 'KLS-A', 'id_guru' => 'GR-A', 'id_mapel' => $mapel,
                'mulai' => Carbon::parse($mulai, $zona), 'selesai' => Carbon::parse($mulai, $zona)->addMinutes(70), 'status_sesi' => 'Menunggu']);
        }
        $pola = $this->getJson("/api/perangkat-ajar/tema/{$id}/pola-jadwal")->assertOk()
            ->assertJsonPath('minggu_mulai', '2030-01-07')->assertJsonPath('jumlah_sesi', 3)->json('data');
        $this->assertSame("07:30 Matematika (Guru A)\n09:00 IPA (Guru A)", $pola['senin']);
        $this->assertSame('07:30 Matematika (Guru A)', $pola['rabu']);
        $this->assertSame('', $pola['selasa']);

        // Editor jadwal: peta tema kelas tersedia di panel & bisa ditautkan ke sesi (jenis TEMA)
        PetaTema::whereKey($id)->update(['status' => 'DISETUJUI']);
        $this->sebagai($s->guruA)->getJson('/api/jadwal/perangkat?id_mapel=MPL-A&id_kelas=KLS-A')->assertOk()->assertJsonPath('tema.0.id_peta', $id);
        $this->putJson('/api/jadwal/JDW-T0', ['perangkat' => [['jenis' => 'TEMA', 'id' => $id, 'label' => 'Aku dan Sukuku']]] + $this->sesi('JDW-T0'))->assertOk();
        $this->assertSame('TEMA', TransJadwal::find('JDW-T0')->perangkat[0]['jenis']);
    }

    private function sesi(string $id): array
    {
        $j = TransJadwal::find($id);
        return ['jenis' => 'kbm', 'id_kelas' => $j->id_kelas, 'id_mapel' => $j->id_mapel, 'id_guru' => $j->id_guru, 'id_periode' => $j->id_periode,
            'mulai' => $j->mulai->format('Y-m-d\TH:i'), 'selesai' => $j->selesai->format('Y-m-d\TH:i')];
    }
    public function test_rekomendasi_pola_mingguan_ai_dan_lokal_mempertahankan_hari_dari_jadwal(): void
    {
        $s = $this->sekolah;
        $zona = config('app.zona_sekolah');
        $jaring = ['mapel' => [['id_mapel' => 'MPL-A', 'nama' => 'Matematika', 'kalibrasi' => 'Hitung skor'], ['id_mapel' => 'MPL-B', 'nama' => 'IPA', 'kalibrasi' => 'Gaya pada bola']]];
        $id = $this->sebagai($s->kepsek)->postJson('/api/perangkat-ajar/tema', ['judul' => 'Main Bola', 'id_kelas' => 'KLS-A', 'tanggal_mulai' => '2030-01-09', 'jaring' => $jaring])->json('data.id_peta');

        // Tanpa cabang mapel → ditolak; guru tidak boleh
        $kosong = $this->postJson('/api/perangkat-ajar/tema', ['judul' => 'Kosong', 'id_kelas' => 'KLS-A'])->json('data.id_peta');
        $this->postJson("/api/perangkat-ajar/tema/{$kosong}/pola-ai", ['ai_mode' => 'LOKAL'])->assertStatus(422);
        $this->sebagai($s->guruB)->postJson("/api/perangkat-ajar/tema/{$id}/pola-ai", ['ai_mode' => 'LOKAL'])->assertForbidden();

        // Jadwal kosong sama sekali → mode lokal mengisi Senin-Jumat, Sabtu tetap kosong
        $lokal = $this->sebagai($s->kepsek)->postJson("/api/perangkat-ajar/tema/{$id}/pola-ai", ['ai_mode' => 'LOKAL', 'jam_masuk' => '07:30', 'jam_pulang' => '12:00'])
            ->assertOk()->assertJsonPath('hari_diisi', 5)->assertJsonPath('jumlah_sesi_jadwal', 0)->json('data');
        $this->assertStringStartsWith('07:30 Pembukaan & Realita', $lokal['senin']);
        $this->assertStringContainsString('Matematika: Hitung skor', $lokal['senin']);
        $this->assertStringContainsString('Produk anak', $lokal['jumat']);
        $this->assertSame('', $lokal['sabtu']);

        // Senin sudah ada di Jadwal → dipertahankan; AI hanya mengisi hari lain (hari yang tidak diminta diabaikan)
        TransJadwal::create(['id_jadwal' => 'JDW-P1', 'id_periode' => 'PER-T', 'id_kelas' => 'KLS-A', 'id_guru' => 'GR-A', 'id_mapel' => 'MPL-A',
            'mulai' => Carbon::parse('2030-01-07 07:30', $zona), 'selesai' => Carbon::parse('2030-01-07 08:40', $zona), 'status_sesi' => 'Menunggu']);
        $this->gemini(['pola' => ['senin' => ['07:30 DIUBAH AI'], 'selasa' => ['07:30 Realita: cerita bola', '08:05 IPA: gaya'], 'rabu' => '07:30 Matematika',
            'kamis' => [], 'jumat' => ['07:30 Makna & produk'], 'sabtu' => ['07:30 tidak diminta']], 'alasan' => 'Mapel disebar merata.']);
        $r = $this->postJson("/api/perangkat-ajar/tema/{$id}/pola-ai", ['ai_mode' => 'GEMINI', 'catatan' => 'Jumat olahraga'])->assertOk()
            ->assertJsonPath('hari_dari_jadwal', 1)->assertJsonPath('hari_diisi', 3)->assertJsonPath('alasan', 'Mapel disebar merata.')->json('data');
        $this->assertSame('07:30 Matematika (Guru A)', $r['senin']);
        $this->assertSame("07:30 Realita: cerita bola\n08:05 IPA: gaya", $r['selasa']);
        $this->assertSame('07:30 Matematika', $r['rabu']);
        $this->assertSame('', $r['kamis']);
        $this->assertSame('', $r['sabtu']);
        Http::assertSent(fn($req) => str_contains($req->body(), 'hari_tetap_dari_jadwal') && str_contains($req->body(), 'Jumat olahraga'));
    }
}

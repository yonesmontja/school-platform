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
 * Peta Tema / spider web PBPM: guru menyusun tema lintas mapel (AI menyusun draf & kalibrasi, respons ditiru),
 * TP harus milik mapel cabangnya, pola mingguan diambil dari Jadwal, persetujuan kepala sekolah, dan tautan di editor jadwal.
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

    public function test_guru_menyusun_peta_tema_dengan_ai_kalibrasi_lalu_disetujui(): void
    {
        $s = $this->sekolah;
        // Kepala sekolah tidak menyusun; guru boleh memakai mapel yang tidak diampunya (tema lintas mapel)
        $this->sebagai($s->kepsek)->postJson('/api/perangkat-ajar/tema', ['judul' => 'Main Bola'])->assertForbidden();
        $this->sebagai($s->guruA)->getJson('/api/perangkat-ajar/tema/referensi?id_kelas=KLS-A')->assertOk()
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

        // Belum lengkap → belum bisa diajukan
        $this->postJson("/api/perangkat-ajar/tema/{$id}/ajukan")->assertStatus(422);
        $this->putJson("/api/perangkat-ajar/tema/{$id}", ['jaring' => $draf['jaring'], 'minggu' => $draf['minggu'], 'sumber' => 'AI', 'ai_mode' => 'GEMINI'])
            ->assertOk()->assertJsonPath('data.sumber', 'AI')->assertJsonPath('data.tp_detail.IND-1', 'Menghitung skor permainan');

        // Kalibrasi: hanya isi cabang yang berubah, id cabang & konsep dipertahankan
        $idCabang = PetaTema::find($id)->jaring['mapel'][0]['id'];
        $kal = $this->postJson("/api/perangkat-ajar/tema/{$id}/ai", ['ai_mode' => 'GEMINI', 'bagian' => 'kalibrasi'])->assertOk()->json('jaring');
        $this->assertSame($idCabang, $kal['mapel'][0]['id']);
        $this->assertSame('Menjumlahkan gol dua babak', $kal['mapel'][0]['kalibrasi']);
        $this->assertSame('Gaya pada bola yang ditendang', $kal['mapel'][1]['kalibrasi']);
        $this->assertCount(2, $kal['konsep']);

        // Guru lain tidak melihat draf; setelah disetujui terlihat dan tidak bisa diubah guru lain
        $this->sebagai($s->guruB)->getJson("/api/perangkat-ajar/tema/{$id}")->assertNotFound();
        $this->sebagai($s->guruA)->postJson("/api/perangkat-ajar/tema/{$id}/ajukan")->assertOk();
        $this->sebagai($s->guruA)->postJson("/api/perangkat-ajar/tema/{$id}/setujui")->assertForbidden();
        $this->sebagai($s->kepsek)->postJson("/api/perangkat-ajar/tema/{$id}/revisi", ['catatan' => 'Tambah Bahasa Inggris'])->assertOk();
        $this->assertSame('REVISI', PetaTema::find($id)->status);
        $this->sebagai($s->guruA)->postJson("/api/perangkat-ajar/tema/{$id}/ajukan")->assertOk();
        $this->sebagai($s->kepsek)->postJson("/api/perangkat-ajar/tema/{$id}/setujui")->assertOk();
        $this->sebagai($s->guruB)->getJson("/api/perangkat-ajar/tema/{$id}")->assertOk()->assertJsonPath('data.status', 'DISETUJUI');
        $this->sebagai($s->guruB)->putJson("/api/perangkat-ajar/tema/{$id}", ['judul' => 'Ubah'])->assertForbidden();

        // Mengubah peta yang disetujui menjadikannya draf versi baru
        $this->sebagai($s->guruA)->putJson("/api/perangkat-ajar/tema/{$id}", ['judul' => 'Main Bola Kaki'])->assertOk()
            ->assertJsonPath('data.status', 'DRAF')->assertJsonPath('data.versi', 2);
    }

    public function test_pola_mingguan_dari_jadwal_dan_tautan_di_editor_jadwal(): void
    {
        $s = $this->sekolah;
        $zona = config('app.zona_sekolah');
        $id = $this->sebagai($s->guruA)->postJson('/api/perangkat-ajar/tema', ['judul' => 'Aku dan Sukuku', 'id_kelas' => 'KLS-A', 'tanggal_mulai' => '2030-01-09'])->json('data.id_peta');
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
        $this->getJson('/api/jadwal/perangkat?id_mapel=MPL-A&id_kelas=KLS-A')->assertOk()->assertJsonPath('tema.0.id_peta', $id);
        $this->putJson('/api/jadwal/JDW-T0', ['perangkat' => [['jenis' => 'TEMA', 'id' => $id, 'label' => 'Aku dan Sukuku']]] + $this->sesi('JDW-T0'))->assertOk();
        $this->assertSame('TEMA', TransJadwal::find('JDW-T0')->perangkat[0]['jenis']);
    }

    private function sesi(string $id): array
    {
        $j = TransJadwal::find($id);
        return ['jenis' => 'kbm', 'id_kelas' => $j->id_kelas, 'id_mapel' => $j->id_mapel, 'id_guru' => $j->id_guru, 'id_periode' => $j->id_periode,
            'mulai' => $j->mulai->format('Y-m-d\TH:i'), 'selesai' => $j->selesai->format('Y-m-d\TH:i')];
    }
}

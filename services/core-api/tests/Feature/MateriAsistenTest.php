<?php

namespace Tests\Feature;

use App\Models\Atp;
use App\Models\AtpBaris;
use App\Models\CapaianPembelajaran;
use App\Models\MasterKategoriPenilaian;
use App\Models\PetaTema;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Laravel\Sanctum\Sanctum;
use Tests\Concerns\MembuatDataSekolah;
use Tests\TestCase;

/**
 * Asisten form Materi: daftar centang TP dari perangkat ajar (ATP, Peta Tema, CP) tanpa AI,
 * saran AI untuk TP / IKTP + bobot STNKM / seluruh form (respons AI ditiru), dan batas mapel diampu.
 */
class MateriAsistenTest extends TestCase
{
    use RefreshDatabase, MembuatDataSekolah;

    protected function setUp(): void
    {
        parent::setUp();
        $this->buatSekolah();
        config(['services.ai_services.gemini_key' => 'uji']);

        MasterKategoriPenilaian::create(['id_kategori' => 'KAT-B', 'nama_kategori' => 'Bilangan', 'id_mapel' => 'MPL-A']);
        CapaianPembelajaran::create(['id_cp' => 'CP-1', 'id_mapel' => 'MPL-A', 'fase' => 'B', 'elemen' => 'Bilangan', 'teks' => 'Peserta didik dapat membandingkan pecahan sederhana.', 'urutan' => 1]);
        Atp::create(['id_atp' => 'ATP-1', 'judul' => 'ATP Matematika 4A', 'id_mapel' => 'MPL-A', 'id_kelas' => 'KLS-A', 'id_periode' => 'PER-T', 'status' => 'DISETUJUI']);
        AtpBaris::create(['id_atp' => 'ATP-1', 'urutan' => 1, 'materi_usulan' => 'Skor permainan', 'tp_usulan' => 'Peserta didik mampu menjumlahkan skor permainan bola.', 'minggu' => '1-2', 'alokasi_jp' => 4]);
        PetaTema::create(['id_peta' => 'PT-1', 'judul' => 'Main Bola', 'id_kelas' => 'KLS-A', 'id_periode' => 'PER-T', 'jumlah_minggu' => 2, 'status' => 'DISETUJUI',
            'jaring' => ['kategori' => 'HOBI', 'mapel' => [['id' => 'c1', 'id_mapel' => 'MPL-A', 'nama' => 'Matematika', 'kalibrasi' => 'Hitung skor & ukuran lapangan', 'tp' => []]],
                'konsep' => [['id' => 'k1', 'label' => 'Aturan Permainan', 'detail' => 'jumlah pemain, wasit']]],
            'minggu' => [], 'pola' => []]);
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

    private function isian(array $lain = []): array
    {
        return $lain + ['id_mapel' => 'MPL-A', 'id_kelas' => 'KLS-A', 'id_periode' => 'PER-T', 'id_kategori' => 'KAT-B', 'nama_materi' => 'Skor permainan'];
    }

    public function test_rujukan_tp_dari_atp_peta_tema_dan_cp_tanpa_ai(): void
    {
        $r = $this->sebagai($this->sekolah->guruA)->postJson('/api/materi/rujukan-tp', $this->isian())->assertOk();
        $sumber = collect($r->json('data'))->pluck('sumber')->all();
        $this->assertSame('ATP', $sumber[0], 'langkah ATP yang materinya cocok didahulukan');
        $this->assertContains('PETA_TEMA', $sumber);
        $this->assertContains('CP', $sumber);
        $this->assertSame('Peserta didik mampu menjumlahkan skor permainan bola.', $r->json('data.0.teks'));
        $this->assertStringContainsString('ATP langkah 1', $r->json('data.0.label'));

        // Guru tidak boleh memakai asisten untuk mapel yang tidak diampu
        $this->sebagai($this->sekolah->guruB)->postJson('/api/materi/rujukan-tp', $this->isian())->assertForbidden();
        $this->sebagai($this->sekolah->kepsek)->postJson('/api/materi/rujukan-tp', $this->isian())->assertForbidden();
    }

    public function test_saran_iktp_dan_bobot_ai_dinormalkan_dan_tidak_mengulang_iktp_lama(): void
    {
        $this->gemini([
            'iktp' => [
                ['deskripsi' => 'Menyebutkan aturan skor permainan bola', 'dimensi' => 'T'],
                ['deskripsi' => 'Menjumlahkan skor dua tim dengan benar', 'dimensi' => 'n'],
                ['deskripsi' => 'menyebutkan aturan skor permainan bola', 'dimensi' => 'X'], // duplikat
                ['deskripsi' => 'Bekerja sama', 'dimensi' => 'K'], // sudah ada
            ],
            'bobot' => ['S' => 0.42, 'T' => 100, 'N' => 0.8, 'K' => -1, 'M' => 'tinggi'],
            'alasan' => 'Materi menekankan pemahaman dan penalaran skor.',
        ]);
        $r = $this->sebagai($this->sekolah->guruA)->postJson('/api/materi/asisten-ai', $this->isian([
            'ai_mode' => 'GEMINI', 'bagian' => 'iktp',
            'deskripsi_kompetensi' => 'Peserta didik mampu menjumlahkan skor permainan bola.',
            'indikator' => [['deskripsi' => 'Bekerja sama']],
        ]))->assertOk();

        $this->assertSame(['Menyebutkan aturan skor permainan bola', 'Menjumlahkan skor dua tim dengan benar'], collect($r->json('data.iktp'))->pluck('deskripsi')->all());
        $this->assertSame('N', $r->json('data.iktp.1.dimensi'));
        $this->assertEqualsWithDelta(0.4, $r->json('data.bobot.S'), 0.001);
        $this->assertEqualsWithDelta(1.0, $r->json('data.bobot.T'), 0.001); // 100 dibaca sebagai persen
        $this->assertEqualsWithDelta(0.0, $r->json('data.bobot.K'), 0.001);
        $this->assertNull($r->json('data.bobot.M'));
        $this->assertContains('alur ATP', $r->json('data.sumber'));
        $this->assertContains('Peta Tema', $r->json('data.sumber'));
        $this->assertContains('TP yang Anda tulis', $r->json('data.sumber'));

        // TP guru, alur ATP, dan kalibrasi Peta Tema ikut dikirim ke AI
        Http::assertSent(function ($req) {
            $isi = json_encode($req->data(), JSON_UNESCAPED_UNICODE);
            return str_contains($isi, 'menjumlahkan skor permainan bola') && str_contains($isi, 'Hitung skor & ukuran lapangan') && str_contains($isi, 'alur_atp');
        });
    }

    public function test_bikin_pakai_ai_mengisi_seluruh_form_dan_saran_tp(): void
    {
        $this->gemini([
            'nama_materi' => 'Skor Permainan Bola',
            'tp' => 'Peserta didik mampu   menjumlahkan skor permainan bola.',
            'iktp' => [['deskripsi' => 'Mencatat skor tiap tim', 'dimensi' => 'S']],
            'bobot' => ['S' => 0.6, 'T' => 1, 'N' => 0.5, 'K' => 0.3, 'M' => 0.5],
            'alasan' => 'Mengikuti ATP langkah 1.',
        ], ['tp_saran' => ['Peserta didik mampu A.', 'Peserta didik mampu B.', 'Peserta didik mampu A.'], 'alasan' => 'x'], ['lain' => 'tidak sesuai']);
        $this->sebagai($this->sekolah->guruA)->postJson('/api/materi/asisten-ai', $this->isian(['ai_mode' => 'GEMINI', 'bagian' => 'semua']))
            ->assertOk()
            ->assertJsonPath('data.nama_materi', 'Skor Permainan Bola')
            ->assertJsonPath('data.tp', 'Peserta didik mampu menjumlahkan skor permainan bola.')
            ->assertJsonPath('data.iktp.0.deskripsi', 'Mencatat skor tiap tim')
            ->assertJsonPath('data.alasan', 'Mengikuti ATP langkah 1.');

        $this->postJson('/api/materi/asisten-ai', $this->isian(['ai_mode' => 'GEMINI', 'bagian' => 'tp']))
            ->assertOk()->assertJsonPath('data.tp_saran', ['Peserta didik mampu A.', 'Peserta didik mampu B.']);

        // Jawaban AI yang tidak bisa dibaca → pesan ramah, bukan galat server
        $this->postJson('/api/materi/asisten-ai', $this->isian(['ai_mode' => 'GEMINI', 'bagian' => 'iktp']))->assertStatus(422);
        $this->postJson('/api/materi/asisten-ai', $this->isian(['ai_mode' => 'LOKAL', 'bagian' => 'iktp']))->assertStatus(422);
    }
}

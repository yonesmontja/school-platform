<?php

namespace Tests\Feature;

use App\Models\Atp;
use App\Models\AtpBaris;
use App\Models\MasterIndikator;
use App\Models\MasterPeriode;
use App\Models\TransJadwal;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\Concerns\MembuatDataSekolah;
use Tests\TestCase;

/**
 * Paket jadwal dari Promes: pola jam mingguan + ATP (minggu efektif) → sesi semester yang sudah tertaut TP,
 * sesi yang sudah ada tidak digandakan, bentrok ditandai, lalu sesi terpilih diaktifkan sebagai satu rangkaian.
 */
class JadwalPaketTest extends TestCase
{
    use RefreshDatabase, MembuatDataSekolah;

    private int $baris1;
    private int $baris2;

    protected function setUp(): void
    {
        parent::setUp();
        $this->buatSekolah();
        Carbon::setTestNow(Carbon::parse('2030-01-14 10:00', config('app.zona_sekolah'))); // Senin minggu ke-2
        MasterPeriode::whereKey('PER-T')->update(['tanggal_mulai' => '2030-01-07', 'tanggal_selesai' => '2030-03-30']);
        MasterIndikator::create(['id_indikator' => 'IND-T1', 'id_materi' => 'MTR-T', 'deskripsi' => 'Menyebutkan pembilang dan penyebut', 'urutan' => 1]);
        Atp::create(['id_atp' => 'ATP-T', 'judul' => 'ATP Matematika 4A', 'id_mapel' => 'MPL-A', 'id_kelas' => 'KLS-A', 'id_periode' => 'PER-T',
            'jp_per_minggu' => 2, 'status' => 'DISETUJUI', 'dibuat_oleh' => $this->sekolah->guruA->id]);
        $this->baris1 = AtpBaris::create(['id_atp' => 'ATP-T', 'urutan' => 1, 'id_materi' => 'MTR-T', 'id_indikator' => 'IND-T1', 'alokasi_jp' => 4, 'minggu' => '1-2'])->id;
        $this->baris2 = AtpBaris::create(['id_atp' => 'ATP-T', 'urutan' => 2, 'id_materi' => 'MTR-T', 'tp_usulan' => 'Membandingkan dua pecahan', 'alokasi_jp' => 2, 'minggu' => '3'])->id;
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function paket(array $extra = []): array
    {
        return $extra + [
            'id_mapel' => 'MPL-A', 'id_kelas' => 'KLS-A', 'id_periode' => 'PER-T', 'mulai_dari' => '2030-01-07',
            'slot' => [['hari' => 2, 'mulai' => '08:00', 'selesai' => '09:10']], // Selasa, 70 menit = 2 JP
        ];
    }

    public function test_paket_menyusun_sesi_dari_promes_lalu_diaktifkan(): void
    {
        Sanctum::actingAs($this->sekolah->guruA);
        // Sesi minggu ke-1 sudah ada (TP 1), dan kelas 4A dipakai IPA pada Selasa minggu ke-3
        $this->postJson('/api/jadwal', ['id_mapel' => 'MPL-A', 'id_kelas' => 'KLS-A', 'pola' => 'sekali', 'mulai' => '2030-01-08T08:00', 'selesai' => '2030-01-08T09:10',
            'perangkat' => [['jenis' => 'ATP', 'id' => (string) $this->baris1, 'label' => 'TP 1', 'atp' => 'ATP-T']]])->assertCreated();
        TransJadwal::create(['id_jadwal' => 'JDW-IPA', 'id_mapel' => 'MPL-B', 'id_kelas' => 'KLS-A', 'id_guru' => 'GR-B',
            'mulai' => Carbon::parse('2030-01-22 08:30'), 'selesai' => Carbon::parse('2030-01-22 09:30'), 'status_sesi' => 'Menunggu']);

        $ref = $this->getJson('/api/jadwal/paket/referensi?id_mapel=MPL-A&id_kelas=KLS-A&id_periode=PER-T')->assertOk();
        $this->assertSame('ATP-T', $ref->json('atp.id_atp'));
        $this->assertSame([['hari' => 2, 'mulai' => '08:00', 'selesai' => '09:10', 'jumlah' => 1]], $ref->json('saran.slot'));

        $p = $this->postJson('/api/jadwal/paket/pratinjau', $this->paket())->assertOk();
        $sesi = collect($p->json('sesi'))->keyBy('tanggal');
        // Minggu 1 sudah ada; minggu 2 menuntaskan TP 1 (sisa 2 JP); minggu 3 TP 2 tetapi kelas bentrok; berhenti setelah rencana tertutup
        $this->assertSame(['2030-01-08', '2030-01-15', '2030-01-22'], $sesi->keys()->all());
        $this->assertSame('SUDAH_ADA', $sesi['2030-01-08']['status']);
        $this->assertSame('BARU', $sesi['2030-01-15']['status']);
        $this->assertSame($this->baris1, $sesi['2030-01-15']['tp']['id']);
        $this->assertSame('BENTROK', $sesi['2030-01-22']['status']);
        $this->assertStringContainsString('kelas 4A', $sesi['2030-01-22']['keterangan']);
        $this->assertSame($this->baris2, $sesi['2030-01-22']['tp']['id']);
        $this->assertSame([], $p->json('tp_kurang'));
        $this->assertSame(6, $p->json('ringkasan.jp_rencana'));

        // Aktifkan sesi baru + sesi bentrok yang sengaja dipilih; sesi yang sudah ada tidak digandakan
        $a = $this->postJson('/api/jadwal/paket/aktifkan', $this->paket(['pilih' => ['2030-01-08T08:00', '2030-01-15T08:00', '2030-01-22T08:00']]))->assertCreated();
        $this->assertSame(2, $a->json('jumlah'));
        $baru = TransJadwal::where('id_group', $a->json('id_group'))->orderBy('mulai')->get();
        $this->assertCount(2, $baru);
        $this->assertStringStartsWith('PKT-', $baru[0]->id_group);
        $this->assertSame('GR-A', $baru[0]->id_guru);
        $this->assertSame('MTR-T', $baru[0]->id_materi);
        $this->assertSame(['ATP', 'INDIKATOR'], array_column($baru[0]->perangkat, 'jenis'));
        $this->assertSame((string) $this->baris1, $baru[0]->perangkat[0]['id']);
        $this->assertSame('Menunggu', $baru[0]->status_sesi);
        $this->assertSame(1, TransJadwal::where('id_mapel', 'MPL-A')->whereDate('mulai', '2030-01-08')->count());

        // Promes kini melihat seluruh TP terjadwal
        $promes = collect($this->getJson('/api/program-ajar/promes?id_mapel=MPL-A&id_kelas=KLS-A&id_periode=PER-T')->json('baris'))->keyBy('id');
        $this->assertEquals(2, $promes[$this->baris1]['jp_terjadwal']);
        $this->assertEquals(2, $promes[$this->baris2]['jp_terjadwal']);

        // Pratinjau ulang: tidak ada sesi baru lagi
        $ulang = $this->postJson('/api/jadwal/paket/pratinjau', $this->paket())->assertOk();
        $this->assertSame(0, $ulang->json('ringkasan.baru'));
    }

    public function test_akses_dan_validasi_paket(): void
    {
        // Guru B bukan pengampu Matematika
        Sanctum::actingAs($this->sekolah->guruB);
        $this->postJson('/api/jadwal/paket/pratinjau', $this->paket())->assertForbidden();

        // Admin: tanpa ATP ditolak; guru bawaan = pengampu mapel; jam selesai harus setelah mulai
        Sanctum::actingAs($this->sekolah->admin);
        $this->postJson('/api/jadwal/paket/pratinjau', $this->paket(['id_mapel' => 'MPL-B']))->assertStatus(422)->assertJsonValidationErrors('id_mapel');
        $this->postJson('/api/jadwal/paket/pratinjau', $this->paket(['slot' => [['hari' => 2, 'mulai' => '09:00', 'selesai' => '08:00']]]))->assertStatus(422);
        $this->postJson('/api/jadwal/paket/pratinjau', $this->paket(['slot' => [['hari' => 7, 'mulai' => '08:00', 'selesai' => '09:00']]]))->assertStatus(422);
        $a = $this->postJson('/api/jadwal/paket/aktifkan', $this->paket(['pilih' => ['2030-01-08T08:00']]))->assertCreated();
        $this->assertSame('GR-A', TransJadwal::where('id_group', $a->json('id_group'))->value('id_guru'));
    }
}

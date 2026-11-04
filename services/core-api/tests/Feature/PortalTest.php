<?php

namespace Tests\Feature;

use App\Models\MasterIndikator;
use App\Models\TransJadwal;
use App\Models\TransNilai;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\Concerns\MembuatDataSekolah;
use Tests\TestCase;

/**
 * Portal siswa & orang tua: capaian per indikator, rencana tindak lanjut anak, dan jadwal sepekan
 * tanpa membocorkan data siswa lain (sesi remedial berisi nama teman sekelas).
 */
class PortalTest extends TestCase
{
    use RefreshDatabase, MembuatDataSekolah;

    protected function setUp(): void
    {
        parent::setUp();
        $this->buatSekolah();
        MasterIndikator::create(['id_indikator' => 'IND-1', 'id_materi' => 'MTR-T', 'deskripsi' => 'Membandingkan pecahan', 'urutan' => 1]);
    }

    private function hari(int $geser): string
    {
        return now(config('app.zona_sekolah'))->addDays($geser)->toDateString();
    }

    private function rencanaUntuk(string $idSiswa, int $hari): void
    {
        $idNilai = TransNilai::where('id_siswa', $idSiswa)->value('id_nilai');
        $this->postJson('/api/remedial', [
            'id_nilai' => [$idNilai], 'opsi_tindakan' => 'Tes Ulang', 'tanggal_rencana' => $this->hari($hari),
            'masuk_jadwal' => true, 'jam_mulai' => '13:00', 'jam_selesai' => '14:00', 'catatan' => 'Latihan soal 1–5',
        ])->assertOk();
    }

    public function test_portal_memuat_capaian_remedial_dan_jadwal_tanpa_data_teman(): void
    {
        Sanctum::actingAs($this->sekolah->guruA);
        $this->postJson('/api/nilai/batch', $this->sekolah->meta + ['tanggal' => '2030-01-05', 'records' => [
            ['id_siswa' => 'SIS-1', 'nilai_indikator' => ['IND-1' => 50]],
            ['id_siswa' => 'SIS-2', 'nilai' => 40],
        ]])->assertOk();
        $this->rencanaUntuk('SIS-1', 1);
        $this->rencanaUntuk('SIS-2', 2);
        TransJadwal::create([
            'id_jadwal' => 'JDW-REG', 'id_periode' => 'PER-T', 'id_kelas' => 'KLS-A', 'id_guru' => 'GR-A', 'id_mapel' => 'MPL-A',
            'judul' => 'Matematika', 'mulai' => $this->hari(1) . ' 07:30', 'selesai' => $this->hari(1) . ' 08:40', 'status_sesi' => 'Menunggu',
        ]);

        Sanctum::actingAs($this->sekolah->siswa); // akun SIS-1 (Ani)
        $res = $this->getJson('/api/portal/rapor?id_siswa=SIS-1&id_periode=PER-T')->assertOk();

        $this->assertSame('Pecahan', $res->json('nilai_indikator.0.nama_materi'));

        $remedial = $res->json('remedial');
        $this->assertCount(1, $remedial); // hanya milik Ani
        $this->assertSame('Tes Ulang', $remedial[0]['opsi_tindakan']);
        $this->assertSame('13:00–14:00', $remedial[0]['jam']);
        $this->assertEquals(50, $remedial[0]['nilai_asal']);

        $jadwal = collect($res->json('jadwal_pekan'));
        $this->assertSame(['Matematika', 'Remedial: Tes Ulang'], $jadwal->pluck('judul')->all());
        $this->assertStringNotContainsString('Budi', json_encode($res->json('jadwal_pekan')));
        $this->assertArrayNotHasKey('catatan', $jadwal->first());
    }
}

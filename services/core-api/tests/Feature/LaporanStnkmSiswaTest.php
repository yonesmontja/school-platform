<?php

namespace Tests\Feature;

use App\Models\TransJurnal;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\Concerns\MembuatDataSekolah;
use Tests\TestCase;

/** Rincian Laporan STNKM satu siswa: nilai & jurnal lengkap, narasi jurnal sensitif disamarkan bagi yang tidak berhak. */
class LaporanStnkmSiswaTest extends TestCase
{
    use RefreshDatabase, MembuatDataSekolah;

    protected function setUp(): void
    {
        parent::setUp();
        $this->buatSekolah();
        Sanctum::actingAs($this->sekolah->guruA);
        $this->postJson('/api/nilai/batch', $this->sekolah->meta + ['tanggal' => '2030-01-07', 'records' => [
            ['id_siswa' => 'SIS-1', 'nilai' => 80], ['id_siswa' => 'SIS-2', 'nilai' => 70],
        ]])->assertOk();
        Model::unguarded(function () {
            foreach ([['JR-1', false, 'Ani menolong teman yang jatuh.'], ['JR-2', true, 'Catatan keluarga Ani yang sensitif.']] as [$id, $sensitif, $narasi]) {
                TransJurnal::create(['id_jurnal' => $id, 'tanggal' => '2030-01-08', 'id_siswa' => 'SIS-1', 'id_kelas' => 'KLS-A', 'id_guru' => 'GR-A',
                    'narasi_kejadian' => $narasi, 'mode_dampak' => 'PISAH', 'sensitif' => $sensitif, 'val_S' => 3, 'dicatat_oleh' => $this->sekolah->guruA->id]);
            }
        });
    }

    private function rincian(string $siswa = 'SIS-1')
    {
        return $this->getJson('/api/laporan/stnkm/siswa?' . http_build_query(['id_kelas' => 'KLS-A', 'id_periode' => 'PER-T', 'id_siswa' => $siswa]));
    }

    public function test_rincian_memuat_nilai_dan_jurnal_satu_siswa_beserta_pengisi(): void
    {
        $res = $this->rincian()->assertOk();
        $this->assertSame('Ani', $res->json('students.0.nama_siswa'));
        $this->assertCount(1, $res->json('nilai'));
        $this->assertSame('Matematika', $res->json('nilai.0.mapel.nama_mapel'));
        $this->assertSame('Pecahan', $res->json('nilai.0.materi.nama_materi'));
        $this->assertSame('Guru A', $res->json('nilai.0.guru.nama_guru'));
        $this->assertCount(2, $res->json('jurnal'));
        $this->assertSame('Ani menolong teman yang jatuh.', $res->json('jurnal.0.narasi_kejadian'));
        // Penulis jurnal sensitif tetap bisa membaca
        $this->assertSame('Catatan keluarga Ani yang sensitif.', $res->json('jurnal.1.narasi_kejadian'));
    }

    public function test_narasi_sensitif_disamarkan_dan_siswa_luar_kelas_ditolak(): void
    {
        Sanctum::actingAs($this->sekolah->guruB);
        $res = $this->rincian()->assertOk();
        $this->assertSame('Ani menolong teman yang jatuh.', $res->json('jurnal.0.narasi_kejadian'));
        $this->assertNull($res->json('jurnal.1.narasi_kejadian'));
        $this->assertTrue($res->json('jurnal.1.tersembunyi'));
        // Skor jurnal tetap ada agar rekap tidak berubah
        $this->assertEquals(3, $res->json('jurnal.1.val_S'));

        $this->rincian('SIS-4')->assertStatus(404);
    }
}

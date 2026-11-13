<?php

namespace Tests\Feature;

use App\Models\MasterIndikator;
use App\Models\TransNilai;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\Concerns\MembuatDataSekolah;
use Tests\TestCase;

/**
 * Ringkasan sebelum menilai: penilaian terakhir (materi & indikator), progres capaian per materi/indikator
 * memakai nilai efektif (remedial menggantikan nilai asal), dan siswa yang perlu perhatian.
 */
class RingkasanNilaiTest extends TestCase
{
    use RefreshDatabase, MembuatDataSekolah;

    private const Q = '/api/nilai/ringkasan?id_kelas=KLS-A&id_mapel=MPL-A&id_periode=PER-T';

    protected function setUp(): void
    {
        parent::setUp();
        $this->buatSekolah();
        MasterIndikator::create(['id_indikator' => 'IND-1', 'id_materi' => 'MTR-T', 'deskripsi' => 'Membandingkan pecahan', 'urutan' => 1]);
    }

    public function test_ringkasan_penilaian_terakhir_dan_progres_materi(): void
    {
        Sanctum::actingAs($this->sekolah->guruA);
        $this->postJson('/api/nilai/batch', $this->sekolah->meta + ['tanggal' => '2030-01-07', 'records' => [
            ['id_siswa' => 'SIS-1', 'nilai' => 90],
            ['id_siswa' => 'SIS-2', 'nilai' => 60],
        ]])->assertOk();
        $this->postJson('/api/nilai/batch', $this->sekolah->meta + ['tanggal' => '2030-01-08', 'records' => [
            ['id_siswa' => 'SIS-1', 'nilai_indikator' => ['IND-1' => 80]],
            ['id_siswa' => 'SIS-2', 'nilai_indikator' => ['IND-1' => 50]],
            ['id_siswa' => 'SIS-3', 'nilai_indikator' => ['IND-1' => 40]],
        ]])->assertOk();

        $res = $this->getJson(self::Q)->assertOk();
        $res->assertJsonPath('jumlah_siswa', 3)
            ->assertJsonPath('ringkas.jumlah_sesi', 2)
            // Penilaian terakhir lebih dulu, lengkap dengan indikatornya
            ->assertJsonPath('sesi_terakhir.0.tanggal', '2030-01-08')
            ->assertJsonPath('sesi_terakhir.0.materi', 'Pecahan')
            ->assertJsonPath('sesi_terakhir.0.indikator.0', 'Membandingkan pecahan')
            ->assertJsonPath('sesi_terakhir.0.dinilai', 3)
            ->assertJsonPath('sesi_terakhir.0.di_bawah_kkm', 2)
            ->assertJsonPath('sesi_terakhir.0.belum_ditindak', 2);

        // Rata-rata per siswa: Ani (90+80)/2=85 tuntas, Budi 55, Citra 40
        $materi = collect($res->json('materi'))->firstWhere('id_materi', 'MTR-T');
        $this->assertSame(2, $materi['jumlah_sesi']);
        $this->assertSame(1, $materi['tuntas']);
        $this->assertSame(3, $materi['dinilai']);
        $this->assertSame(['Citra', 'Budi'], collect($materi['belum_tuntas'])->pluck('nama_siswa')->all());
        $this->assertSame(1, $materi['indikator'][0]['tuntas']);
        $this->assertSame(['Citra', 'Budi'], collect($res->json('perhatian'))->pluck('nama_siswa')->all());

        // Remedial Budi (85) menggantikan nilai asalnya pada 7 Jan: rata Budi (85+50)/2 = 67,5 (masih belum tuntas)
        $asal = TransNilai::where('id_siswa', 'SIS-2')->whereDate('tanggal', '2030-01-07')->value('id_nilai');
        $this->postJson('/api/remedial', ['id_nilai' => [$asal], 'opsi_tindakan' => 'Tes Ulang', 'tanggal_rencana' => '2030-01-09'])->assertOk();
        $this->postJson('/api/nilai/batch', $this->sekolah->meta + ['tanggal' => '2030-01-10', 'tipe_nilai' => 'REMEDIAL',
            'records' => [['id_siswa' => 'SIS-2', 'nilai' => 85]]])->assertOk();
        $budi = collect(collect($this->getJson(self::Q)->json('materi'))->firstWhere('id_materi', 'MTR-T')['belum_tuntas'])->firstWhere('nama_siswa', 'Budi');
        $this->assertEquals(67.5, $budi['nilai']);
    }

    public function test_guru_lain_tidak_bisa_melihat_ringkasan_mapel_yang_tidak_diampu(): void
    {
        Sanctum::actingAs($this->sekolah->guruB);
        $this->getJson(self::Q)->assertForbidden();
    }
}

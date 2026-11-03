<?php

namespace Tests\Feature;

use App\Models\MasterIndikator;
use App\Models\MasterMateri;
use App\Models\TransNilai;
use App\Models\TransNilaiIndikator;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\Concerns\MembuatDataSekolah;
use Tests\TestCase;

/**
 * Penilaian per indikator (IKTP): satu sesi bisa menilai beberapa indikator; nilai materi = rata-ratanya
 * dan tetap mengalir ke STNKM, KKM, dan remedial seperti nilai biasa.
 */
class NilaiIndikatorTest extends TestCase
{
    use RefreshDatabase, MembuatDataSekolah;

    protected function setUp(): void
    {
        parent::setUp();
        $this->buatSekolah();
        MasterIndikator::create(['id_indikator' => 'IND-1', 'id_materi' => 'MTR-T', 'deskripsi' => 'Menyebutkan pembilang', 'urutan' => 1]);
        MasterIndikator::create(['id_indikator' => 'IND-2', 'id_materi' => 'MTR-T', 'deskripsi' => 'Membandingkan pecahan', 'urutan' => 2]);
        Sanctum::actingAs($this->sekolah->guruA);
    }

    private function simpan(array $records, string $tanggal = '2030-01-05')
    {
        return $this->postJson('/api/nilai/batch', $this->sekolah->meta + ['tanggal' => $tanggal, 'records' => $records]);
    }

    private function lembar(string $tanggal = '2030-01-05')
    {
        return $this->getJson('/api/nilai/students?' . http_build_query($this->sekolah->meta + ['tanggal' => $tanggal]))->assertOk();
    }

    public function test_nilai_materi_adalah_rata_rata_indikator_yang_dinilai(): void
    {
        $this->simpan([
            ['id_siswa' => 'SIS-1', 'nilai' => 10, 'nilai_indikator' => ['IND-1' => 80, 'IND-2' => 60]],
            ['id_siswa' => 'SIS-2', 'nilai_indikator' => ['IND-1' => 90]],
            ['id_siswa' => 'SIS-3', 'nilai' => 75],
        ])->assertOk();

        // Nilai kiriman diabaikan bila ada nilai indikator
        $this->assertEquals(70, TransNilai::where('id_siswa', 'SIS-1')->value('nilai'));
        $this->assertEquals(90, TransNilai::where('id_siswa', 'SIS-2')->value('nilai'));
        $this->assertEquals(75, TransNilai::where('id_siswa', 'SIS-3')->value('nilai'));
        $this->assertSame(3, TransNilaiIndikator::count());

        $res = $this->lembar();
        $this->assertEqualsCanonicalizing(['IND-1', 'IND-2'], array_column($res->json('indikator_sesi'), 'id_indikator'));
        $ani = collect($res->json('students'))->firstWhere('id_siswa', 'SIS-1');
        $this->assertEquals(['IND-1' => 80, 'IND-2' => 60], $ani['nilai_indikator']);
    }

    public function test_menyimpan_ulang_menyamakan_indikator_dengan_kiriman(): void
    {
        $this->simpan([['id_siswa' => 'SIS-1', 'nilai_indikator' => ['IND-1' => 80, 'IND-2' => 60]]])->assertOk();
        $this->simpan([['id_siswa' => 'SIS-1', 'nilai_indikator' => ['IND-2' => 50]]])->assertOk()->assertJson(['updated' => 1]);

        $this->assertSame(['IND-2'], TransNilaiIndikator::pluck('id_indikator')->all());
        $this->assertEquals(50, TransNilai::value('nilai'));

        // Kembali ke nilai tunggal: data indikator lama dibuang agar tidak bertentangan dengan nilai
        $this->simpan([['id_siswa' => 'SIS-1', 'nilai' => 88]])->assertOk();
        $this->assertSame(0, TransNilaiIndikator::count());
    }

    public function test_indikator_harus_milik_materi_dan_isian_valid(): void
    {
        MasterMateri::create(['id_materi' => 'MTR-LAIN', 'nama_materi' => 'Desimal', 'id_mapel' => 'MPL-A', 'id_kelas' => 'KLS-A', 'id_periode' => 'PER-T']);
        MasterIndikator::create(['id_indikator' => 'IND-LAIN', 'id_materi' => 'MTR-LAIN', 'deskripsi' => 'Milik materi lain']);

        $this->simpan([['id_siswa' => 'SIS-1', 'nilai_indikator' => ['IND-LAIN' => 70]]])->assertUnprocessable();
        $this->simpan([['id_siswa' => 'SIS-1', 'nilai_indikator' => ['IND-1' => 120]]])->assertUnprocessable();
        $this->simpan([['id_siswa' => 'SIS-1', 'nilai_indikator' => []]])->assertUnprocessable();
        $this->assertSame(0, TransNilai::count());
    }

    public function test_indikator_yang_sudah_dinilai_tidak_bisa_dihapus_dan_ikut_terhapus_bersama_nilainya(): void
    {
        $this->simpan([['id_siswa' => 'SIS-1', 'nilai_indikator' => ['IND-1' => 40]]])->assertOk();

        Sanctum::actingAs($this->sekolah->admin);
        $this->deleteJson('/api/indikator/IND-1')->assertUnprocessable();

        // Nilai rendah dari indikator tetap memicu tindak lanjut seperti biasa
        $idNilai = TransNilai::value('id_nilai');
        $this->assertSame(1, $this->simpan([['id_siswa' => 'SIS-1', 'nilai_indikator' => ['IND-1' => 40]]])->json('perlu_tindak_lanjut'));

        $this->deleteJson("/api/nilai/$idNilai")->assertOk();
        $this->assertSame(0, TransNilaiIndikator::count());
        $this->deleteJson('/api/indikator/IND-1')->assertOk();
    }

    public function test_remedial_per_indikator_menggabungkan_indikator_yang_sudah_tuntas(): void
    {
        // Indikator 1 tuntas (90), indikator 2 belum (40) → nilai asal 65, di bawah KKM 75
        $this->simpan([['id_siswa' => 'SIS-1', 'nilai_indikator' => ['IND-1' => 90, 'IND-2' => 40]]])->assertOk();
        $asal = TransNilai::value('id_nilai');
        $this->postJson('/api/remedial', ['id_nilai' => [$asal], 'opsi_tindakan' => 'Tes Ulang', 'tanggal_rencana' => '2030-01-08'])->assertOk();

        $res = $this->getJson('/api/nilai/remedial?' . http_build_query($this->sekolah->meta))->assertOk();
        $this->assertCount(2, $res->json('data.0.nilai_asal.nilai_indikator'));

        // Hanya indikator 2 yang diulang: nilai remedial = (90 + 80) / 2
        $this->postJson('/api/nilai/batch', $this->sekolah->meta + ['tanggal' => '2030-01-09', 'tipe_nilai' => 'REMEDIAL', 'records' => [
            ['id_siswa' => 'SIS-1', 'nilai_indikator' => ['IND-2' => 80]],
        ]])->assertOk();

        $remedial = TransNilai::where('tipe_nilai', 'REMEDIAL')->first();
        $this->assertEquals(85, $remedial->nilai);
        $this->assertSame(['IND-2'], $remedial->nilaiIndikator()->pluck('id_indikator')->all());
    }

    public function test_rapor_memuat_nilai_indikator_dan_kktp_diatur_sekolah(): void
    {
        $this->simpan([['id_siswa' => 'SIS-1', 'nilai_indikator' => ['IND-1' => 90, 'IND-2' => 60]]])->assertOk();
        $this->getJson('/api/settings')->assertOk(); // membuat baris pengaturan bawaan, seperti saat aplikasi pertama dibuka

        $res = $this->getJson("/api/rapor/data?id_kelas=KLS-A&id_periode=PER-T")->assertOk();
        $this->assertCount(2, $res->json('nilai_indikator'));
        $this->assertSame('Menyebutkan pembilang', collect($res->json('nilai_indikator'))->firstWhere('id_indikator', 'IND-1')['deskripsi']);
        $this->assertSame(80, $res->json('settings.kktp_baik'));

        Sanctum::actingAs($this->sekolah->admin);
        $this->postJson('/api/settings', ['kktp_cukup' => 75, 'kktp_baik' => 70, 'kktp_sangat_baik' => 92])->assertUnprocessable();
        $this->postJson('/api/settings', ['kktp_cukup' => 65, 'kktp_baik' => 78, 'kktp_sangat_baik' => 92])->assertOk();
        $this->assertSame(78, \App\Models\SchoolSetting::first()->kktp_baik);
    }

    public function test_riwayat_memuat_nilai_per_indikator(): void
    {
        $this->simpan([['id_siswa' => 'SIS-1', 'nilai_indikator' => ['IND-1' => 80, 'IND-2' => 70]]])->assertOk();

        $res = $this->getJson('/api/nilai?id_kelas=KLS-A&id_periode=PER-T')->assertOk();
        $this->assertCount(2, $res->json('data.0.nilai_indikator'));
        $this->assertSame('Menyebutkan pembilang', collect($res->json('data.0.nilai_indikator'))->firstWhere('id_indikator', 'IND-1')['indikator']['deskripsi']);
    }
}

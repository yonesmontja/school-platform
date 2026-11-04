<?php

namespace Tests\Feature;

use App\Models\MasterMBK;
use App\Models\TransDiagnostikNonkognitif;
use App\Models\TransNilai;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\Concerns\MembuatDataSekolah;
use Tests\TestCase;

/**
 * Asesmen diagnostik: nilai diagnostik tidak masuk rekap/remedial tetapi tersedia untuk pemetaan,
 * dan diagnostik non-kognitif hanya diisi wali kelas atau pengelola.
 */
class DiagnostikTest extends TestCase
{
    use RefreshDatabase, MembuatDataSekolah;

    protected function setUp(): void
    {
        parent::setUp();
        $this->buatSekolah();
        MasterMBK::create(['id_jenis' => 'JNS-D', 'kategori_penilaian' => 'Tes Pemetaan Awal', 'jenis_asesmen' => 'DIAGNOSTIK']);
    }

    public function test_nilai_diagnostik_untuk_pemetaan_bukan_rapor_atau_remedial(): void
    {
        Sanctum::actingAs($this->sekolah->guruA);
        $meta = ['id_jenis' => 'JNS-D'] + $this->sekolah->meta;
        $res = $this->postJson('/api/nilai/batch', $meta + ['tanggal' => '2030-01-03', 'records' => [
            ['id_siswa' => 'SIS-1', 'nilai' => 40], ['id_siswa' => 'SIS-2', 'nilai' => 90],
        ]])->assertOk();
        $this->assertSame(0, $res->json('perlu_tindak_lanjut'));

        // Tidak masuk rapor & tidak bisa diremedial
        $this->assertCount(0, $this->getJson('/api/rapor/data?id_kelas=KLS-A&id_periode=PER-T')->json('nilai'));
        $this->postJson('/api/remedial', ['id_nilai' => [TransNilai::where('id_siswa', 'SIS-1')->value('id_nilai')], 'opsi_tindakan' => 'Tes Ulang', 'tanggal_rencana' => '2030-01-08'])
            ->assertUnprocessable();

        // Tersedia untuk pemetaan; guru lain boleh melihat
        Sanctum::actingAs($this->sekolah->guruB);
        $peta = $this->getJson('/api/diagnostik/kognitif?id_kelas=KLS-A&id_periode=PER-T')->assertOk();
        $this->assertCount(2, $peta->json('nilai'));
        $this->assertSame('Tes Pemetaan Awal', $peta->json('nilai.0.jenis.kategori_penilaian'));
    }

    public function test_nonkognitif_diisi_wali_kelas(): void
    {
        $isi = ['id_kelas' => 'KLS-A', 'id_periode' => 'PER-T', 'records' => [
            ['id_siswa' => 'SIS-1', 'gaya_belajar' => 'VISUAL', 'minat' => 'Menggambar, sepak bola', 'kesejahteraan' => 'PERLU_PERHATIAN', 'dukungan_rumah' => 'KURANG'],
            ['id_siswa' => 'SIS-2'], // kosong: tidak dibuat
        ]];

        Sanctum::actingAs($this->sekolah->guruB); // bukan wali KLS-A
        $this->putJson('/api/diagnostik/nonkognitif', $isi)->assertForbidden();
        $this->assertFalse($this->getJson('/api/diagnostik/nonkognitif?id_kelas=KLS-A&id_periode=PER-T')->json('boleh_ubah'));

        Sanctum::actingAs($this->sekolah->guruA);
        $this->assertContains('diagnostik', array_column($this->getJson('/api/notifikasi')->json('data'), 'jenis'));
        $this->putJson('/api/diagnostik/nonkognitif', $isi)->assertOk();
        $this->assertSame(1, TransDiagnostikNonkognitif::count());
        $this->assertSame('VISUAL', TransDiagnostikNonkognitif::value('gaya_belajar'));

        $this->putJson('/api/diagnostik/nonkognitif', ['id_kelas' => 'KLS-A', 'id_periode' => 'PER-T', 'records' => [
            ['id_siswa' => 'SIS-4', 'gaya_belajar' => 'AUDITORI'], // siswa kelas lain
        ]])->assertUnprocessable();
        $this->putJson('/api/diagnostik/nonkognitif', ['id_kelas' => 'KLS-A', 'id_periode' => 'PER-T', 'records' => [
            ['id_siswa' => 'SIS-1', 'gaya_belajar' => 'TERBANG'],
        ]])->assertUnprocessable();
    }
}

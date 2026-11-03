<?php

namespace Tests\Feature;

use App\Models\TransNilai;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\Concerns\MembuatDataSekolah;
use Tests\TestCase;

/**
 * Nilai mencatat guru penilai (ID guru, terhubung ke Master Guru) dan akun pengisinya secara terpisah.
 */
class GuruPenilaiTest extends TestCase
{
    use RefreshDatabase, MembuatDataSekolah;

    protected function setUp(): void
    {
        parent::setUp();
        $this->buatSekolah();
    }

    private function simpan(array $nilai, string $idMapel = 'MPL-A')
    {
        $meta = ['id_mapel' => $idMapel] + $this->sekolah->meta;
        $records = array_map(fn ($sis, $n) => ['id_siswa' => $sis, 'nilai' => $n], array_keys($nilai), $nilai);
        return $this->postJson('/api/nilai/batch', $meta + ['tanggal' => '2030-01-05', 'records' => $records]);
    }

    public function test_guru_tercatat_sebagai_penilai_dan_pengisi(): void
    {
        Sanctum::actingAs($this->sekolah->guruA);
        $this->simpan(['SIS-1' => 80])->assertOk();

        $n = TransNilai::first();
        $this->assertSame('GR-A', $n->id_guru);
        $this->assertSame($this->sekolah->guruA->id, $n->diisi_oleh);
    }

    public function test_admin_menilai_atas_nama_guru_pengampu_dan_koreksi_tidak_mengganti_penilai(): void
    {
        Sanctum::actingAs($this->sekolah->admin);
        $this->simpan(['SIS-1' => 70], 'MPL-B')->assertOk();
        $n = TransNilai::first();
        $this->assertSame('GR-B', $n->id_guru);
        $this->assertSame($this->sekolah->admin->id, $n->diisi_oleh);

        // Guru A menilai, lalu kepsek mengoreksi: penilai tetap Guru A, pengisi terakhir kepsek
        Sanctum::actingAs($this->sekolah->guruA);
        $this->simpan(['SIS-2' => 60])->assertOk();
        Sanctum::actingAs($this->sekolah->kepsek);
        $this->simpan(['SIS-2' => 65])->assertOk();
        $koreksi = TransNilai::where('id_siswa', 'SIS-2')->first();
        $this->assertSame('GR-A', $koreksi->id_guru);
        $this->assertSame($this->sekolah->kepsek->id, $koreksi->diisi_oleh);
    }

    public function test_riwayat_memuat_nama_guru_dan_pengisi(): void
    {
        Sanctum::actingAs($this->sekolah->admin);
        $this->simpan(['SIS-1' => 70])->assertOk();

        $res = $this->getJson('/api/nilai?id_kelas=KLS-A&id_periode=PER-T')->assertOk();
        $this->assertSame('Guru A', $res->json('data.0.guru.nama_guru'));
        $this->assertSame($this->sekolah->admin->name, $res->json('data.0.pengisi.name'));
    }
}

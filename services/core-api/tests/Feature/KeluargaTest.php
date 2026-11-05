<?php

namespace Tests\Feature;

use App\Models\MasterOrtu;
use App\Models\Student;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\Concerns\MembuatDataSekolah;
use Tests\TestCase;

/**
 * Master Orang Tua & Wali: admin membuat data keluarga dan menghubungkan anaknya;
 * kepsek hanya melihat; data yang sudah punya akun portal tidak bisa dihapus.
 */
class KeluargaTest extends TestCase
{
    use RefreshDatabase, MembuatDataSekolah;

    protected function setUp(): void
    {
        parent::setUp();
        $this->buatSekolah();
    }

    private function buatOrtu(array $isian = []): string
    {
        Sanctum::actingAs($this->sekolah->admin);
        return $this->postJson('/api/keluarga/ortu', $isian + [
            'nama_ayah' => 'Yohanis', 'nama_ibu' => 'Maria', 'id_pekerjaan_ayah' => 'PKJ-02', 'no_wa' => '0812-3456 7890', 'anak' => ['SIS-1', 'SIS-2'],
        ])->assertCreated()->json('data.id_ortu');
    }

    public function test_admin_membuat_orang_tua_dan_menghubungkan_anak(): void
    {
        $id = $this->buatOrtu();

        $this->assertSame('081234567890', MasterOrtu::find($id)->no_wa);
        $this->assertSame([$id, $id, null], Student::whereIn('id_siswa', ['SIS-1', 'SIS-2', 'SIS-3'])->orderBy('id_siswa')->pluck('id_ortu')->all());

        $data = $this->getJson('/api/keluarga')->assertOk();
        $this->assertCount(2, $data->json('ortu.0.anak'));
        $this->assertSame('4A', $data->json('ortu.0.anak.0.kelas.nama_kelas'));
        $this->assertNotEmpty($data->json('pekerjaan'));
    }

    public function test_validasi_nama_dan_nomor_wa(): void
    {
        Sanctum::actingAs($this->sekolah->admin);
        $this->postJson('/api/keluarga/ortu', ['nama_ayah' => '', 'nama_ibu' => ''])->assertJsonValidationErrors(['nama_ayah', 'nama_ibu']);
        $this->postJson('/api/keluarga/wali', ['nama_wali' => 'Paman', 'no_wa' => 'nomor saya'])->assertJsonValidationErrors(['no_wa']);
        $this->postJson('/api/keluarga/kakek', ['nama_wali' => 'X'])->assertNotFound();
    }

    public function test_ubah_memindahkan_dan_melepas_anak(): void
    {
        $lama = $this->buatOrtu();
        $baru = $this->buatOrtu(['nama_ayah' => 'Markus', 'anak' => ['SIS-2']]);

        $this->assertSame($lama, Student::find('SIS-1')->id_ortu);
        $this->assertSame($baru, Student::find('SIS-2')->id_ortu);

        $this->putJson("/api/keluarga/ortu/{$lama}", ['nama_ayah' => 'Yohanis', 'anak' => []])->assertOk();
        $this->assertNull(Student::find('SIS-1')->id_ortu);
        $this->assertSame($baru, Student::find('SIS-2')->id_ortu);
    }

    public function test_wali_dan_hak_akses_peran(): void
    {
        Sanctum::actingAs($this->sekolah->admin);
        $id = $this->postJson('/api/keluarga/wali', ['nama_wali' => 'Paman Daniel', 'anak' => ['SIS-4']])->assertCreated()->json('data.id_wali');
        $this->assertSame($id, Student::find('SIS-4')->id_wali);

        Sanctum::actingAs($this->sekolah->kepsek);
        $this->getJson('/api/keluarga')->assertOk()->assertJsonPath('wali.0.nama_wali', 'Paman Daniel');
        $this->postJson('/api/keluarga/wali', ['nama_wali' => 'X'])->assertForbidden();

        Sanctum::actingAs($this->sekolah->guruA);
        $this->getJson('/api/keluarga')->assertForbidden();
    }

    public function test_hapus_ditolak_bila_ada_akun_portal(): void
    {
        $id = $this->buatOrtu();
        $akun = User::create(['name' => 'Yohanis', 'username' => 'ortu.uji', 'password' => 'rahasia123', 'role' => 'ortu', 'aktif' => true, 'id_ortu' => $id]);

        $this->deleteJson("/api/keluarga/ortu/{$id}")->assertJsonValidationErrors(['akun']);

        $akun->delete();
        $this->deleteJson("/api/keluarga/ortu/{$id}")->assertOk();
        $this->assertNull(MasterOrtu::find($id));
        $this->assertNull(Student::find('SIS-1')->id_ortu);
    }
}

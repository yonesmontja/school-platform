<?php

namespace Tests\Feature;

use App\Models\Teacher;
use App\Models\TransJurnal;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\Concerns\MembuatDataSekolah;
use Tests\TestCase;

/**
 * Jurnal sensitif: narasi hanya terbaca admin, kepala sekolah, guru penulis, dan wali kelas siswa.
 * Akun lain (guru lain, peninjau, portal) hanya tahu ada catatan tertutup; skor tetap dihitung.
 * Narasinya juga tidak pernah ikut data rapor/portal maupun bahan AI catatan wali.
 */
class JurnalSensitifTest extends TestCase
{
    use RefreshDatabase, MembuatDataSekolah;

    private User $guruC;
    private User $wakasis;

    protected function setUp(): void
    {
        parent::setUp();
        $this->buatSekolah();
        Teacher::create(['id_guru' => 'GR-C', 'nama_guru' => 'Guru C']);
        $akun = fn($role, $extra = []) => User::create(['name' => $role, 'username' => $role . '_' . uniqid(), 'password' => 'rahasia123', 'role' => $role, 'aktif' => true] + $extra);
        $this->guruC = $akun('guru', ['id_guru' => 'GR-C']);
        $this->wakasis = $akun('wakasis');
    }

    private function tulis(bool $sensitif): string
    {
        Sanctum::actingAs($this->guruC);
        return $this->postJson('/api/jurnal/store', [
            'tanggal' => '2030-01-07', 'id_siswa' => 'SIS-1', 'id_kelas' => 'KLS-A', 'mode_dampak' => 'PISAH', 'sensitif' => $sensitif,
            'narasi_kejadian' => 'Ani bercerita tentang kejadian di rumah yang perlu pendampingan khusus.', 'val_K' => -2,
        ])->assertCreated()->json('data.id_jurnal');
    }

    private function narasiUntuk(User $user, string $id): array
    {
        Sanctum::actingAs($user);
        $j = collect($this->getJson('/api/jurnal?id_kelas=KLS-A')->assertOk()->json('data'))->firstWhere('id_jurnal', $id);
        return [$j['narasi_kejadian'], $j['tersembunyi'] ?? false, (float) $j['val_K']];
    }

    public function test_narasi_sensitif_hanya_terbaca_penulis_wali_dan_pimpinan(): void
    {
        $id = $this->tulis(true);
        foreach ([$this->guruC, $this->sekolah->guruA, $this->sekolah->admin, $this->sekolah->kepsek] as $boleh) {
            [$narasi, $tutup] = $this->narasiUntuk($boleh, $id);
            $this->assertStringContainsString('pendampingan khusus', $narasi, $boleh->role);
            $this->assertFalse($tutup);
        }
        foreach ([$this->sekolah->guruB, $this->wakasis] as $tidak) {
            [$narasi, $tutup, $skor] = $this->narasiUntuk($tidak, $id);
            $this->assertNull($narasi, $tidak->role);
            $this->assertTrue($tutup);
            $this->assertSame(-2.0, $skor); // skor tetap terlihat & dihitung
        }

        // Rapor/portal tidak memuat narasi sensitif, bahkan untuk admin
        Sanctum::actingAs($this->sekolah->admin);
        $rapor = collect($this->getJson('/api/rapor/data?id_kelas=KLS-A&id_periode=PER-T')->assertOk()->json('jurnal'))->firstWhere('id_jurnal', $id);
        $this->assertNull($rapor['narasi_kejadian']);
        Sanctum::actingAs($this->sekolah->siswa);
        $portal = collect($this->getJson('/api/portal/rapor?id_siswa=SIS-1&id_periode=PER-T')->assertOk()->json('jurnal'))->firstWhere('id_jurnal', $id);
        $this->assertNull($portal['narasi_kejadian']);
    }

    public function test_tanda_sensitif_diubah_penulis_atau_wali_saja(): void
    {
        $id = $this->tulis(false);
        [$narasi] = $this->narasiUntuk($this->sekolah->guruB, $id);
        $this->assertNotNull($narasi);

        // Guru lain dan peninjau tidak boleh mengubah tanda
        Sanctum::actingAs($this->sekolah->guruB);
        $this->patchJson("/api/jurnal/$id/sensitif", ['sensitif' => true])->assertForbidden();
        Sanctum::actingAs($this->wakasis);
        $this->patchJson("/api/jurnal/$id/sensitif", ['sensitif' => true])->assertForbidden();

        // Wali kelas siswa boleh menandai
        Sanctum::actingAs($this->sekolah->guruA);
        $this->patchJson("/api/jurnal/$id/sensitif", ['sensitif' => true])->assertOk()->assertJsonPath('data.sensitif', true);
        [$narasi, $tutup] = $this->narasiUntuk($this->sekolah->guruB, $id);
        $this->assertNull($narasi);
        $this->assertTrue($tutup);

        // Penulis boleh membuka kembali
        Sanctum::actingAs($this->guruC);
        $this->patchJson("/api/jurnal/$id/sensitif", ['sensitif' => false])->assertOk();
        $this->assertFalse(TransJurnal::find($id)->sensitif);
    }
}

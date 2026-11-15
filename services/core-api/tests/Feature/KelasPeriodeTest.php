<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\Concerns\MembuatDataSekolah;
use Tests\TestCase;

/**
 * Status rombel per semester: bawaan aktif; admin menonaktifkan rombel untuk semester aktif sehingga
 * hilang dari pilihan kelas & peta kerja guru, tanpa mengubah data lama. Admin/kepsek tetap melihat semua.
 */
class KelasPeriodeTest extends TestCase
{
    use RefreshDatabase, MembuatDataSekolah;

    protected function setUp(): void
    {
        parent::setUp();
        $this->buatSekolah();
    }

    private function sebagai(User $user): static
    {
        Sanctum::actingAs($user);
        return $this;
    }

    public function test_admin_menonaktifkan_rombel_untuk_semester_aktif(): void
    {
        $s = $this->sekolah;
        // Bawaan: semua rombel aktif
        $this->sebagai($s->guruA)->getJson('/api/classes')->assertOk()->assertJsonCount(2, 'data')
            ->assertJsonPath('data.0.aktif_semester', true)->assertJsonPath('periode_aktif.id_periode', 'PER-T');

        // Hanya admin yang mengatur
        $this->sebagai($s->guruA)->putJson('/api/classes/KLS-A/aktif-semester', ['aktif' => false])->assertForbidden();
        $this->sebagai($s->kepsek)->putJson('/api/classes/KLS-A/aktif-semester', ['aktif' => false])->assertForbidden();
        $this->sebagai($s->admin)->putJson('/api/classes/KLS-A/aktif-semester', ['aktif' => false])->assertOk()
            ->assertJsonPath('aktif_semester', false);
        $this->assertDatabaseHas('kelas_periode', ['id_kelas' => 'KLS-A', 'id_periode' => 'PER-T', 'aktif' => false]);

        // Admin & kepsek tetap melihat semua (ditandai); guru tidak lagi melihat rombel nonaktif di pilihan kelas
        $admin = collect($this->sebagai($s->admin)->getJson('/api/classes')->json('data'))->keyBy('id_kelas');
        $this->assertFalse($admin['KLS-A']['aktif_semester']);
        $this->assertTrue($admin['KLS-B']['aktif_semester']);
        $this->sebagai($s->guruA)->getJson('/api/classes')->assertJsonCount(1, 'data')->assertJsonPath('data.0.id_kelas', 'KLS-B');
        $this->assertSame(['KLS-B'], collect($this->getJson('/api/jadwal/referensi')->json('classes'))->pluck('id_kelas')->all());
        $this->assertSame(['KLS-B'], collect($this->getJson('/api/perangkat-ajar/referensi')->json('kelas'))->pluck('id_kelas')->all());

        // Peta kerja wali kelas tidak lagi menghitung rombel nonaktif; data siswa & materi lama tetap ada
        $this->getJson('/api/panduan/kerja')->assertOk()->assertJsonPath('data.kelas_binaan', []);
        $this->assertDatabaseHas('students', ['id_siswa' => 'SIS-1', 'id_kelas' => 'KLS-A']);
        $this->assertDatabaseHas('master_materi', ['id_materi' => 'MTR-T', 'id_kelas' => 'KLS-A']);

        // Diaktifkan lagi lewat form edit kelas
        $this->sebagai($s->admin)->putJson('/api/classes/KLS-A', ['nama_kelas' => '4A', 'wali_kelas' => 'GR-A', 'aktif_semester' => true])->assertOk();
        $this->sebagai($s->guruA)->getJson('/api/classes')->assertJsonCount(2, 'data');
        $this->getJson('/api/panduan/kerja')->assertJsonPath('data.kelas_binaan', ['4A']);
    }
}

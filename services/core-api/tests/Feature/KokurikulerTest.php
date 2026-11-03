<?php

namespace Tests\Feature;

use App\Models\MasterProyek;
use App\Models\SchoolSetting;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\Concerns\MembuatDataSekolah;
use Tests\TestCase;

/**
 * Kegiatan kokurikuler (menu Proyek): bentuk kegiatan, 8 Dimensi Profil Lulusan, dan skala predikat sekolah.
 */
class KokurikulerTest extends TestCase
{
    use RefreshDatabase, MembuatDataSekolah;

    protected function setUp(): void
    {
        parent::setUp();
        $this->buatSekolah();
    }

    private function kegiatan(array $tambahan = []): array
    {
        return $tambahan + [
            'judul_proyek' => 'Kebun Sekolah', 'id_kelas' => 'KLS-A', 'id_periode' => 'PER-T',
            'targets' => [['dimensi' => 'Kolaborasi', 'elemen' => 'Kerja sama', 'relasi_stnkm' => ['K']]],
        ];
    }

    public function test_kegiatan_menyimpan_bentuk_dan_bawaannya_proyek(): void
    {
        Sanctum::actingAs($this->sekolah->guruA);

        $id = $this->postJson('/api/p5/proyek', $this->kegiatan(['bentuk' => 'KEBIASAAN']))->assertCreated()->json('data.id_proyek');
        $this->assertSame('KEBIASAAN', MasterProyek::find($id)->bentuk);

        $lain = $this->postJson('/api/p5/proyek', $this->kegiatan(['judul_proyek' => 'Pameran']))->assertCreated()->json('data.id_proyek');
        $this->assertSame('PROYEK', MasterProyek::find($lain)->fresh()->bentuk);

        $this->postJson('/api/p5/proyek', $this->kegiatan(['bentuk' => 'LAINNYA']))->assertUnprocessable();
        $this->putJson("/api/p5/proyek/$id", $this->kegiatan(['bentuk' => 'INTRAKURIKULER']))->assertOk();
        $this->assertSame('INTRAKURIKULER', MasterProyek::find($id)->bentuk);
    }

    public function test_skala_predikat_diatur_admin_dan_hanya_3_atau_4(): void
    {
        Sanctum::actingAs($this->sekolah->admin);
        $this->getJson('/api/settings')->assertOk()->assertJson(['skala_kokurikuler' => '4']);

        $this->postJson('/api/settings', ['skala_kokurikuler' => '5'])->assertUnprocessable();
        $this->postJson('/api/settings', ['skala_kokurikuler' => '3'])->assertOk();
        $this->assertSame('3', SchoolSetting::first()->skala_kokurikuler);

        Sanctum::actingAs($this->sekolah->guruA);
        $this->postJson('/api/settings', ['skala_kokurikuler' => '4'])->assertForbidden();
    }
}

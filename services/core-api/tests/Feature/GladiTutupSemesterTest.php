<?php

namespace Tests\Feature;

use App\Models\MasterPeriode;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/** Gladi Tutup Semester hanya boleh berjalan di salinan database (berakhiran _gladi), tidak pernah di database sekolah. */
class GladiTutupSemesterTest extends TestCase
{
    use RefreshDatabase;

    public function test_menolak_berjalan_di_database_yang_bukan_salinan_gladi(): void
    {
        MasterPeriode::create(['id_periode' => 'PER-G', 'tahun_ajaran' => '2030/2031', 'semester' => 'Ganjil', 'status_aktif' => 'AKTIF']);

        $this->artisan('semester:gladi')
            ->expectsOutputToContain('bukan salinan gladi')
            ->assertExitCode(1);

        $this->assertSame('AKTIF', MasterPeriode::find('PER-G')->status_aktif);
    }
}

<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\Concerns\MembuatDataSekolah;
use Tests\TestCase;

/** Poin STNKM diisi manual oleh guru disimpan apa adanya dan dibuka kembali di lembar nilai. */
class StnkmManualTest extends TestCase
{
    use RefreshDatabase, MembuatDataSekolah;

    public function test_poin_manual_disimpan_dan_dikembalikan_di_lembar(): void
    {
        $this->buatSekolah();
        Sanctum::actingAs($this->sekolah->guruA);
        $this->postJson('/api/nilai/batch', $this->sekolah->meta + ['tanggal' => '2030-01-07', 'metode_stnkm' => 'MANUAL', 'records' => [
            ['id_siswa' => 'SIS-1', 'nilai' => 40, 'poin_S' => 20, 'poin_T' => 20, 'poin_N' => 20, 'poin_K' => 70, 'poin_M' => 70],
        ]])->assertOk();

        $res = $this->getJson('/api/nilai/students?' . http_build_query($this->sekolah->meta + ['tanggal' => '2030-01-07']))->assertOk();
        $ani = collect($res->json('students'))->firstWhere('id_siswa', 'SIS-1');
        $this->assertSame('MANUAL', $ani['metode_stnkm']);
        $this->assertEquals(['S' => 20, 'T' => 20, 'N' => 20, 'K' => 70, 'M' => 70], $ani['poin']);

        // Tanpa metode manual, poin dihitung ulang dari bobot
        $this->postJson('/api/nilai/batch', $this->sekolah->meta + ['tanggal' => '2030-01-07', 'records' => [['id_siswa' => 'SIS-1', 'nilai' => 40]]])->assertOk();
        $ani = collect($this->getJson('/api/nilai/students?' . http_build_query($this->sekolah->meta + ['tanggal' => '2030-01-07']))->json('students'))->firstWhere('id_siswa', 'SIS-1');
        $this->assertSame('OTOMATIS', $ani['metode_stnkm']);
    }
}

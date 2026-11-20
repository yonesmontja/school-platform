<?php

namespace Tests\Feature;

use App\Models\TransJadwal;
use App\Models\TransPresensi;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Laravel\Sanctum\Sanctum;
use Tests\Concerns\MembuatDataSekolah;
use Tests\TestCase;

/**
 * Mode "Hari ini" untuk guru di HP: sesi hari ini, presensi kelas binaan, pengingat.
 */
class HariIniTest extends TestCase
{
    use RefreshDatabase, MembuatDataSekolah;

    protected function setUp(): void
    {
        parent::setUp();
        $this->buatSekolah();
    }

    public function test_guru_melihat_sesi_hari_ini_dan_presensi_kelas_binaan(): void
    {
        $hariIni = now(config('app.zona_sekolah'));
        TransJadwal::unguarded(function () use ($hariIni) {
            TransJadwal::create(['id_jadwal' => 'JDW-1', 'id_guru' => 'GR-A', 'id_mapel' => 'MPL-A', 'id_kelas' => 'KLS-A', 'id_periode' => 'PER-T',
                'mulai' => $hariIni->copy()->setTime(7, 30)->format('Y-m-d H:i:s'), 'selesai' => $hariIni->copy()->setTime(8, 40)->format('Y-m-d H:i:s'), 'status_sesi' => 'Menunggu']);
            // Sesi guru lain dan sesi kemarin tidak ikut
            TransJadwal::create(['id_jadwal' => 'JDW-2', 'id_guru' => 'GR-B', 'id_mapel' => 'MPL-B', 'id_kelas' => 'KLS-B', 'id_periode' => 'PER-T',
                'mulai' => $hariIni->copy()->setTime(9, 0)->format('Y-m-d H:i:s'), 'selesai' => $hariIni->copy()->setTime(10, 0)->format('Y-m-d H:i:s'), 'status_sesi' => 'Menunggu']);
            TransJadwal::create(['id_jadwal' => 'JDW-3', 'id_guru' => 'GR-A', 'id_mapel' => 'MPL-A', 'id_kelas' => 'KLS-A', 'id_periode' => 'PER-T',
                'mulai' => $hariIni->copy()->subDay()->setTime(7, 30)->format('Y-m-d H:i:s'), 'selesai' => $hariIni->copy()->subDay()->setTime(8, 40)->format('Y-m-d H:i:s'), 'status_sesi' => 'Selesai']);
        });
        TransPresensi::create(['id_presensi' => (string) Str::uuid(), 'id_siswa' => 'SIS-2', 'id_kelas' => 'KLS-A', 'id_periode' => 'PER-T',
            'tanggal' => $hariIni->toDateString(), 'status_kehadiran' => 'SAKIT', 'keterangan' => 'Demam']);

        Sanctum::actingAs($this->sekolah->guruA);
        $res = $this->getJson('/api/hari-ini')->assertOk();
        $this->assertSame(['JDW-1'], array_column($res->json('sesi'), 'id_jadwal'));
        $this->assertSame('07:30', $res->json('sesi.0.mulai'));
        $this->assertSame('Matematika', $res->json('sesi.0.judul'));

        $kelas = $res->json('kelas_binaan');
        $this->assertCount(1, $kelas);
        $this->assertSame('4A', $kelas[0]['nama_kelas']);
        $this->assertCount(3, $kelas[0]['siswa']);
        $this->assertSame(1, $kelas[0]['terisi']);
        $budi = collect($kelas[0]['siswa'])->firstWhere('id_siswa', 'SIS-2');
        $this->assertSame(['SAKIT', 'Demam'], [$budi['status'], $budi['keterangan']]);
        $this->assertSame('PER-T', $res->json('periode'));
        $this->assertIsArray($res->json('pengingat'));
    }

    public function test_siswa_tidak_boleh(): void
    {
        Sanctum::actingAs($this->sekolah->siswa);
        $this->getJson('/api/hari-ini')->assertForbidden();
    }
}

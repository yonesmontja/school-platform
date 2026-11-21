<?php

namespace Tests\Feature;

use App\Models\TransNilai;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Laravel\Sanctum\Sanctum;
use Tests\Concerns\MembuatDataSekolah;
use Tests\TestCase;

/**
 * Kiriman nilai dari antrean offline membawa "dasar" (waktu nilai saat lembar dibuka). Bila nilai di server
 * sudah diubah sesudahnya dan berbeda, server menolak (409) dengan rincian, kecuali dikirim ulang dengan paksa.
 */
class NilaiBentrokOfflineTest extends TestCase
{
    use RefreshDatabase, MembuatDataSekolah;

    protected function setUp(): void
    {
        parent::setUp();
        $this->buatSekolah();
    }

    private function kirim(array $nilai, array $tambahan = [])
    {
        $meta = ['id_mapel' => 'MPL-A'] + $this->sekolah->meta;
        $records = array_map(fn ($sis, $n) => ['id_siswa' => $sis, 'nilai' => $n], array_keys($nilai), $nilai);
        return $this->postJson('/api/nilai/batch', $meta + ['tanggal' => '2030-01-05', 'records' => $records] + $tambahan);
    }

    private function lembar()
    {
        $meta = ['id_mapel' => 'MPL-A'] + $this->sekolah->meta;
        return $this->getJson('/api/nilai/students?' . http_build_query($meta + ['tanggal' => '2030-01-05']))->assertOk();
    }

    public function test_kiriman_offline_yang_terlambat_tidak_menimpa_diam_diam(): void
    {
        Carbon::setTestNow('2030-01-05 08:00:00');
        Sanctum::actingAs($this->sekolah->guruA);
        $this->kirim(['SIS-1' => 70])->assertOk();

        // Guru A membuka lembar (lalu offline): dasar SIS-1 = waktu nilai 70, SIS-2 belum punya nilai
        $siswa = collect($this->lembar()->json('students'))->keyBy('id_siswa');
        $this->assertNotNull($siswa['SIS-1']['diperbarui']);
        $dasar = ['SIS-1' => $siswa['SIS-1']['diperbarui'], 'SIS-2' => $siswa['SIS-2']['diperbarui']];
        $this->assertNull($dasar['SIS-2']);

        // Sementara itu kepsek mengoreksi SIS-1 dan mengisi SIS-2 dari perangkat lain
        Carbon::setTestNow('2030-01-05 09:00:00');
        Sanctum::actingAs($this->sekolah->kepsek);
        $this->kirim(['SIS-1' => 75, 'SIS-2' => 60])->assertOk();

        // Antrean Guru A terkirim: ditolak dengan rincian, tidak ada yang tersimpan
        Carbon::setTestNow('2030-01-05 10:00:00');
        Sanctum::actingAs($this->sekolah->guruA);
        $res = $this->kirim(['SIS-1' => 85, 'SIS-2' => 90], ['dasar' => $dasar])->assertStatus(409);
        $this->assertCount(2, $res->json('bentrok'));
        $b = collect($res->json('bentrok'))->keyBy('id_siswa');
        $this->assertEquals(75, $b['SIS-1']['nilai_server']);
        $this->assertEquals(85, $b['SIS-1']['nilai_kiriman']);
        $this->assertSame($this->sekolah->kepsek->name, $b['SIS-1']['diubah_oleh']);
        $this->assertEquals(75, TransNilai::where('id_siswa', 'SIS-1')->value('nilai'));

        // Pilih "Timpa": dikirim ulang dengan paksa
        $this->kirim(['SIS-1' => 85, 'SIS-2' => 90], ['dasar' => $dasar, 'paksa' => true])->assertOk();
        $this->assertEquals(85, TransNilai::where('id_siswa', 'SIS-1')->value('nilai'));
        $this->assertEquals(90, TransNilai::where('id_siswa', 'SIS-2')->value('nilai'));
    }

    public function test_tanpa_perubahan_lain_atau_nilai_sama_tetap_tersimpan(): void
    {
        Carbon::setTestNow('2030-01-05 08:00:00');
        Sanctum::actingAs($this->sekolah->guruA);
        $this->kirim(['SIS-1' => 70])->assertOk();
        $siswa = collect($this->lembar()->json('students'))->keyBy('id_siswa');
        $dasar = ['SIS-1' => $siswa['SIS-1']['diperbarui'], 'SIS-2' => null];

        // Tidak ada yang mengubah sejak dibuka: langsung tersimpan
        Carbon::setTestNow('2030-01-05 10:00:00');
        $this->kirim(['SIS-1' => 80, 'SIS-2' => 65], ['dasar' => $dasar])->assertOk();
        $this->assertEquals(80, TransNilai::where('id_siswa', 'SIS-1')->value('nilai'));

        // Orang lain mengubah ke nilai yang sama dengan kiriman: bukan bentrok
        Carbon::setTestNow('2030-01-05 11:00:00');
        Sanctum::actingAs($this->sekolah->kepsek);
        $this->kirim(['SIS-2' => 66])->assertOk();
        Carbon::setTestNow('2030-01-05 12:00:00');
        Sanctum::actingAs($this->sekolah->guruA);
        $this->kirim(['SIS-2' => 66], ['dasar' => ['SIS-2' => null]])->assertOk();

        // Dua kiriman offline berurutan dari akun yang sama (dasar lama): kiriman kedua tidak bentrok dengan yang pertama
        Carbon::setTestNow('2030-01-05 13:00:00');
        $this->kirim(['SIS-1' => 81], ['dasar' => $dasar])->assertOk();
        Carbon::setTestNow('2030-01-05 13:01:00');
        $this->kirim(['SIS-1' => 82], ['dasar' => $dasar])->assertOk();
        $this->assertEquals(82, TransNilai::where('id_siswa', 'SIS-1')->value('nilai'));
    }
}

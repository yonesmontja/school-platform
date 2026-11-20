<?php

namespace Tests\Feature;

use App\Models\Classes;
use App\Models\MasterPeriode;
use App\Models\Student;
use App\Models\TransJurnal;
use App\Models\TransNilai;
use App\Models\TransPresensi;
use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\Concerns\MembuatDataSekolah;
use Tests\TestCase;

/**
 * Rekam jejak siswa lintas semester: rombel & wali tiap semester, ringkasan nilai/kehadiran/jurnal,
 * rincian nilai harian & jurnal per semester (narasi sensitif disembunyikan), dan aturan akses.
 */
class RekamJejakTest extends TestCase
{
    use RefreshDatabase, MembuatDataSekolah;

    protected function setUp(): void
    {
        parent::setUp();
        $this->buatSekolah();
        MasterPeriode::whereKey('PER-T')->update(['tanggal_mulai' => '2030-01-06', 'tanggal_selesai' => '2030-06-27']);
        Model::unguarded(function () {
            TransNilai::create(['id_nilai' => 'N1', 'tanggal' => '2030-02-10', 'id_siswa' => 'SIS-1', 'id_mapel' => 'MPL-A', 'id_periode' => 'PER-T',
                'id_jenis' => 'JNS-T', 'id_materi' => 'MTR-T', 'id_kelas' => 'KLS-A', 'nilai' => 80]);
            TransNilai::create(['id_nilai' => 'N2', 'tanggal' => '2030-03-10', 'id_siswa' => 'SIS-1', 'id_mapel' => 'MPL-A', 'id_periode' => 'PER-T',
                'id_jenis' => 'JNS-T', 'id_materi' => 'MTR-T', 'id_kelas' => 'KLS-A', 'nilai' => 90]);
            TransPresensi::create(['id_presensi' => 'P1', 'tanggal' => '2030-02-10', 'id_siswa' => 'SIS-1', 'id_kelas' => 'KLS-A', 'id_periode' => 'PER-T', 'status_kehadiran' => 'ALPA']);
            foreach ([['J1', false, 1.0], ['J2', true, -1.0]] as [$id, $sensitif, $v]) {
                TransJurnal::create(['id_jurnal' => $id, 'tanggal' => '2030-02-11', 'id_siswa' => 'SIS-1', 'id_kelas' => 'KLS-A', 'id_guru' => 'GR-A',
                    'id_jenis' => 'JNS-T', 'id_materi' => 'MTR-T', 'narasi_kejadian' => "Narasi $id", 'sensitif' => $sensitif, 'val_S' => $v]);
            }
        });
    }

    private function sebagai(User $user): static
    {
        Sanctum::actingAs($user);
        return $this;
    }

    public function test_rekam_jejak_lintas_semester_setelah_naik_kelas(): void
    {
        $s = $this->sekolah;
        // Tahun berikutnya: Ani naik ke 5A dengan wali Guru B
        $this->sebagai($s->admin)->postJson('/api/periodes', ['tahun_ajaran' => '2030/2031', 'semester' => 'Ganjil', 'status_aktif' => 'AKTIF'])->assertCreated();
        Model::unguarded(fn() => Classes::create(['id_kelas' => 'KLS-5A', 'nama_kelas' => '5A', 'wali_kelas' => 'GR-B']));
        Student::find('SIS-1')->update(['id_kelas' => 'KLS-5A']);

        $r = $this->getJson('/api/siswa/SIS-1/rekam-jejak')->assertOk()->assertJsonCount(2, 'semester');
        // Terbaru di atas
        $r->assertJsonPath('semester.0.id_kelas', 'KLS-5A')->assertJsonPath('semester.0.wali_kelas', 'Guru B')->assertJsonPath('semester.0.aktif', true);
        $lama = $r->json('semester.1');
        $this->assertSame(['KLS-A', 'Guru A', 85], [$lama['id_kelas'], $lama['wali_kelas'], (int) $lama['rata_rata']]);
        $this->assertSame(1, $lama['presensi']['alpa']);
        $this->assertSame(['jumlah' => 2, 'positif' => 1, 'perlu_perhatian' => 1], $lama['jurnal']);

        // Rincian per semester
        $this->getJson('/api/siswa/SIS-1/rekam-jejak/nilai?id_periode=PER-T')->assertOk()->assertJsonCount(2, 'data');
        $jurnal = collect($this->getJson('/api/siswa/SIS-1/rekam-jejak/jurnal?id_periode=PER-T')->assertOk()->json('data'))->keyBy('id_jurnal');
        $this->assertSame('Narasi J1', $jurnal['J1']['narasi_kejadian']);
        $this->assertNull($jurnal['J2']['narasi_kejadian']);
    }

    public function test_akses_rekam_jejak(): void
    {
        $s = $this->sekolah;
        $this->sebagai($s->guruA)->getJson('/api/siswa/SIS-1/rekam-jejak')->assertOk();      // wali kelasnya sekarang
        $this->sebagai($s->guruB)->getJson('/api/siswa/SIS-1/rekam-jejak')->assertForbidden(); // bukan wali kelasnya
        $this->sebagai($s->siswa)->getJson('/api/siswa/SIS-1/rekam-jejak')->assertOk();       // dirinya sendiri
        $this->getJson('/api/siswa/SIS-2/rekam-jejak')->assertForbidden();
        $this->sebagai($s->kepsek)->getJson('/api/siswa/SIS-4/rekam-jejak')->assertOk();
    }
}

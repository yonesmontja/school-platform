<?php

namespace Tests\Feature;

use App\Models\Classes;
use App\Models\MasterPeriode;
use App\Models\Student;
use App\Models\Subject;
use App\Models\TransKenaikan;
use App\Models\TransNilai;
use App\Models\User;
use App\Services\NotifikasiService;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\Concerns\MembuatDataSekolah;
use Tests\TestCase;

/**
 * Kenaikan kelas: usulan dari data setahun, keputusan wali kelas, pengesahan kepala sekolah, blok rapor Genap,
 * penerapan saat Tutup Semester ke tahun ajaran baru, dan pemetaan rombel siswa yang naik.
 */
class KenaikanTest extends TestCase
{
    use RefreshDatabase, MembuatDataSekolah;

    protected function setUp(): void
    {
        parent::setUp();
        $this->buatSekolah(); // PER-T = 2029/2030 Genap (aktif); 4A: SIS-1..3 (wali Guru A), 4B: SIS-4 (wali Guru B)
        Model::unguarded(function () {
            Classes::create(['id_kelas' => 'KLS-5A', 'nama_kelas' => '5A']);
            Classes::create(['id_kelas' => 'KLS-5B', 'nama_kelas' => '5B']);
            Classes::create(['id_kelas' => 'KLS-6', 'nama_kelas' => '6', 'wali_kelas' => 'GR-B']);
            Student::create(['id_siswa' => 'SIS-6', 'nama_siswa' => 'Eka', 'id_kelas' => 'KLS-6', 'jenis_kelamin' => 'P']);
            Subject::create(['id_mapel' => 'MPL-C', 'nama_mapel' => 'IPS', 'kkm' => 75]);
            // Ani (SIS-1) di bawah KKM pada tiga mapel; Budi (SIS-2) tuntas
            $n = 0;
            foreach (['MPL-A' => 50, 'MPL-B' => 60, 'MPL-C' => 55] as $m => $v) {
                foreach (['SIS-1' => $v, 'SIS-2' => 90] as $s => $nilai) {
                    TransNilai::create(['id_nilai' => 'N' . (++$n), 'tanggal' => '2030-02-10', 'id_siswa' => $s, 'id_mapel' => $m, 'id_periode' => 'PER-T',
                        'id_jenis' => 'JNS-T', 'id_materi' => 'MTR-T', 'id_kelas' => 'KLS-A', 'nilai' => $nilai]);
                }
            }
        });
    }

    private function sebagai(User $user): static
    {
        Sanctum::actingAs($user);
        return $this;
    }

    public function test_usulan_dari_data_dan_akses_wali_kelas(): void
    {
        $s = $this->sekolah;
        $this->sebagai($s->guruB)->getJson('/api/kenaikan?id_kelas=KLS-A')->assertForbidden();

        $r = $this->sebagai($s->guruA)->getJson('/api/kenaikan')->assertOk()
            ->assertJsonPath('kelas.id_kelas', 'KLS-A')->assertJsonPath('tingkat_akhir', 6)->assertJsonPath('boleh_sahkan', false);
        $d = collect($r->json('data'))->keyBy('id_siswa');
        $this->assertSame('TIDAK_NAIK', $d['SIS-1']['usulan']['keputusan']);
        $this->assertSame(3, $d['SIS-1']['usulan']['mapel_bawah']);
        $this->assertSame('NAIK', $d['SIS-2']['usulan']['keputusan']);
        $this->assertSame(5, $d['SIS-2']['usulan']['ke_tingkat']);
        // Kelas tertinggi diusulkan lulus
        $this->sebagai($s->guruB)->getJson('/api/kenaikan?id_kelas=KLS-6')->assertOk()->assertJsonPath('data.0.usulan.keputusan', 'LULUS');
    }

    public function test_keputusan_disahkan_kepala_sekolah_dan_tampil_di_rapor(): void
    {
        $s = $this->sekolah;
        $baris = [['id_siswa' => 'SIS-1', 'keputusan' => 'TIDAK_NAIK'], ['id_siswa' => 'SIS-2', 'keputusan' => 'NAIK']];
        $this->sebagai($s->guruA)->putJson('/api/kenaikan', ['id_kelas' => 'KLS-A', 'id_periode' => 'PER-T', 'baris' => $baris])->assertOk();
        $this->postJson('/api/kenaikan/sahkan', ['id_kelas' => 'KLS-A', 'id_periode' => 'PER-T', 'sahkan' => true])->assertForbidden();
        $this->putJson('/api/kenaikan', ['id_kelas' => 'KLS-A', 'id_periode' => 'PER-T', 'baris' => [['id_siswa' => 'SIS-4', 'keputusan' => 'NAIK']]])->assertStatus(422);

        // Belum lengkap (SIS-3) → tidak bisa disahkan
        $this->sebagai($s->kepsek)->postJson('/api/kenaikan/sahkan', ['id_kelas' => 'KLS-A', 'id_periode' => 'PER-T', 'sahkan' => true])->assertStatus(422);
        $this->getJson('/api/rapor/data?id_kelas=KLS-A&id_periode=PER-T')->assertOk()->assertJsonCount(0, 'kenaikan');

        $this->sebagai($s->guruA)->putJson('/api/kenaikan', ['id_kelas' => 'KLS-A', 'id_periode' => 'PER-T', 'baris' => [['id_siswa' => 'SIS-3', 'keputusan' => 'NAIK']]])->assertOk();
        $this->sebagai($s->kepsek)->postJson('/api/kenaikan/sahkan', ['id_kelas' => 'KLS-A', 'id_periode' => 'PER-T', 'sahkan' => true])->assertOk();
        $this->assertSame(3, TransKenaikan::where('disahkan', true)->count());

        // Sudah disahkan → wali tidak bisa mengubah; rapor memuat keputusan
        $this->sebagai($s->guruA)->putJson('/api/kenaikan', ['id_kelas' => 'KLS-A', 'id_periode' => 'PER-T', 'baris' => $baris])->assertStatus(423);
        $kenaikan = collect($this->getJson('/api/rapor/data?id_kelas=KLS-A&id_periode=PER-T')->json('kenaikan'))->keyBy('id_siswa');
        $this->assertSame('NAIK', $kenaikan['SIS-2']['keputusan']);
        $this->assertSame(5, $kenaikan['SIS-2']['ke_tingkat']);

        // Pengesahan bisa dibatalkan sebelum diterapkan
        $this->sebagai($s->kepsek)->postJson('/api/kenaikan/sahkan', ['id_kelas' => 'KLS-A', 'id_periode' => 'PER-T', 'sahkan' => false])->assertOk();
        $this->assertSame(0, TransKenaikan::where('disahkan', true)->count());
    }

    public function test_tutup_semester_menerapkan_kenaikan_lalu_pemetaan_rombel(): void
    {
        $s = $this->sekolah;
        $this->sebagai($s->guruA)->putJson('/api/kenaikan', ['id_kelas' => 'KLS-A', 'id_periode' => 'PER-T', 'baris' => [
            ['id_siswa' => 'SIS-1', 'keputusan' => 'TIDAK_NAIK'], ['id_siswa' => 'SIS-2', 'keputusan' => 'NAIK'], ['id_siswa' => 'SIS-3', 'keputusan' => 'NAIK'],
        ]])->assertOk();
        $this->sebagai($s->guruB)->putJson('/api/kenaikan', ['id_kelas' => 'KLS-6', 'id_periode' => 'PER-T', 'baris' => [['id_siswa' => 'SIS-6', 'keputusan' => 'LULUS']]])->assertOk();
        $this->sebagai($s->kepsek);
        foreach (['KLS-A', 'KLS-6'] as $k) $this->postJson('/api/kenaikan/sahkan', ['id_kelas' => $k, 'id_periode' => 'PER-T', 'sahkan' => true])->assertOk();

        // Tutup Semester menandai rombel 4B yang belum diputuskan
        $periksa = $this->sebagai($s->admin)->getJson('/api/semester/tutup')->assertOk()->assertJsonPath('naik_tahun', true)->assertJsonPath('salin.kenaikan_disahkan', 4);
        $this->assertContains('kenaikan', collect($periksa->json('periksa'))->pluck('jenis')->all());

        $r = $this->postJson('/api/semester/tutup', ['tahun_ajaran' => '2030/2031', 'semester' => 'Ganjil', 'terapkan_kenaikan' => true])->assertOk();
        $this->assertSame(['naik' => 2, 'langsung' => 0, 'menunggu' => 2, 'tinggal' => 1, 'lulus' => 1], $r->json('ringkasan.kenaikan'));
        $baru = MasterPeriode::where('status_aktif', 'AKTIF')->value('id_periode');

        $this->assertSame('KLS-A', Student::find('SIS-1')->id_kelas);          // tinggal kelas
        $this->assertNull(Student::find('SIS-2')->id_kelas);                     // naik, menunggu pemetaan (5A & 5B)
        $this->assertSame(5, Student::find('SIS-2')->tingkat_tunggu);
        $this->assertSame('lulus', Student::find('SIS-6')->status_siswa);        // alumni
        $this->assertSame('KLS-B', Student::find('SIS-4')->id_kelas);          // tanpa keputusan → tetap
        // Rapor 4A semester Genap tetap utuh
        $this->getJson('/api/rapor/data?id_kelas=KLS-A&id_periode=PER-T')->assertOk()->assertJsonCount(3, 'students')->assertJsonCount(3, 'kenaikan');

        // Admin diingatkan & memetakan
        $notif = (new NotifikasiService(User::find($s->admin->id)))->semua();
        $this->assertContains('pemetaan-rombel', $notif->pluck('jenis')->all());
        $this->getJson('/api/pemetaan-rombel')->assertOk()->assertJsonPath('tingkat', 5)->assertJsonCount(2, 'menunggu')->assertJsonCount(2, 'rombel');
        $this->sebagai($s->guruA)->putJson('/api/pemetaan-rombel', ['baris' => [['id_siswa' => 'SIS-2', 'id_kelas' => 'KLS-5A']]])->assertForbidden();
        $this->sebagai($s->admin)->putJson('/api/pemetaan-rombel', ['baris' => [['id_siswa' => 'SIS-2', 'id_kelas' => 'KLS-5A'], ['id_siswa' => 'SIS-3', 'id_kelas' => 'KLS-5B']]])
            ->assertOk()->assertJsonPath('diubah', 2);
        $this->assertNull(Student::find('SIS-2')->tingkat_tunggu);
        $this->assertDatabaseHas('siswa_rombel', ['id_siswa' => 'SIS-2', 'id_periode' => $baru, 'id_kelas' => 'KLS-5A']);
        $this->assertDatabaseHas('siswa_rombel', ['id_siswa' => 'SIS-2', 'id_periode' => 'PER-T', 'id_kelas' => 'KLS-A']);
        $this->assertSame(0, \App\Services\KenaikanService::jumlahMenunggu());
    }
}

<?php

namespace Tests\Feature;

use App\Models\Classes;
use App\Models\MasterPeriode;
use App\Models\Student;
use App\Models\TransNilai;
use App\Models\User;
use App\Services\RiwayatRombel;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\Concerns\MembuatDataSekolah;
use Tests\TestCase;

/**
 * Riwayat rombel per semester: rapor & laporan semester lama tetap memuat siswa dan wali kelas saat itu,
 * walaupun siswa sudah naik/pindah kelas dan wali kelas berganti. Status siswa lulus/mutasi melepas kelas sekarang.
 */
class RiwayatRombelTest extends TestCase
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

    public function test_rombel_dan_wali_tercatat_otomatis_untuk_semester_aktif(): void
    {
        $this->assertDatabaseHas('siswa_rombel', ['id_siswa' => 'SIS-1', 'id_periode' => 'PER-T', 'id_kelas' => 'KLS-A']);
        $this->assertDatabaseHas('wali_kelas_periode', ['id_kelas' => 'KLS-A', 'id_periode' => 'PER-T', 'id_guru' => 'GR-A']);
        // Tingkat terisi dari nama kelas
        $this->assertSame(4, Classes::find('KLS-A')->tingkat);

        Student::find('SIS-1')->update(['id_kelas' => 'KLS-B']);
        $this->assertDatabaseHas('siswa_rombel', ['id_siswa' => 'SIS-1', 'id_periode' => 'PER-T', 'id_kelas' => 'KLS-B']);
        $this->assertDatabaseCount('siswa_rombel', 4);
    }

    public function test_rapor_semester_lama_tetap_utuh_setelah_naik_kelas_dan_wali_berganti(): void
    {
        $s = $this->sekolah;
        Model::unguarded(fn() => TransNilai::create([
            'id_nilai' => 'NIL-1', 'tanggal' => '2030-02-10', 'id_siswa' => 'SIS-1', 'id_mapel' => 'MPL-A', 'id_guru' => 'GR-A',
            'id_periode' => 'PER-T', 'id_jenis' => 'JNS-T', 'id_materi' => 'MTR-T', 'id_kelas' => 'KLS-A', 'nilai' => 88,
        ]));

        // Admin membuka semester baru (aktif) → semester lama dipotret, lalu siswa naik ke rombel lain & wali berganti
        $this->sebagai($s->admin)->postJson('/api/periodes', ['tahun_ajaran' => '2030/2031', 'semester' => 'Ganjil', 'status_aktif' => 'AKTIF'])->assertCreated();
        $baru = MasterPeriode::where('status_aktif', 'AKTIF')->value('id_periode');
        Classes::create(['id_kelas' => 'KLS-5A', 'nama_kelas' => 'Kelas 5A', 'wali_kelas' => 'GR-B']);
        Student::whereIn('id_siswa', ['SIS-1', 'SIS-2', 'SIS-3'])->get()->each->update(['id_kelas' => 'KLS-5A']);
        Classes::find('KLS-A')->update(['wali_kelas' => 'GR-B']);

        // Rapor 4A semester lama: tiga siswa lama, wali lama, nilainya ikut
        $lama = $this->sebagai($s->admin)->getJson('/api/rapor/data?id_kelas=KLS-A&id_periode=PER-T')->assertOk();
        $this->assertEqualsCanonicalizing(['SIS-1', 'SIS-2', 'SIS-3'], collect($lama->json('students'))->pluck('id_siswa')->all());
        $lama->assertJsonPath('wali_kelas.id_guru', 'GR-A')->assertJsonCount(1, 'nilai');

        // Rapor 4A semester baru kosong; 5A semester baru berisi tiga siswa dengan wali baru
        $this->getJson("/api/rapor/data?id_kelas=KLS-A&id_periode={$baru}")->assertOk()->assertJsonCount(0, 'students')->assertJsonPath('wali_kelas.id_guru', 'GR-B');
        $this->getJson("/api/rapor/data?id_kelas=KLS-5A&id_periode={$baru}")->assertOk()->assertJsonCount(3, 'students');
        $this->assertSame(5, Classes::find('KLS-5A')->tingkat);

        // Dashboard pribadi/portal: rapor semester lama memakai rombel lama
        $this->getJson('/api/portal/rapor?id_siswa=SIS-1&id_periode=PER-T')->assertOk()->assertJsonCount(1, 'nilai');

        // Riwayat siswa urut semester
        $riwayat = RiwayatRombel::riwayatSiswa('SIS-1');
        $this->assertSame(['KLS-A', 'KLS-5A'], array_column($riwayat, 'id_kelas'));
        $this->assertSame([false, true], array_column($riwayat, 'aktif'));
    }

    public function test_status_lulus_melepas_kelas_tanpa_menghapus_riwayat(): void
    {
        $s = $this->sekolah;
        $this->sebagai($s->admin)->putJson('/api/students/SIS-4', ['status_siswa' => 'lulus', 'keterangan_status' => 'Lulus 2030'])->assertOk();
        $siswa = Student::find('SIS-4');
        $this->assertNull($siswa->id_kelas);
        $this->assertSame('lulus', $siswa->status_siswa);
        $this->assertNotNull($siswa->tanggal_status);
        $this->assertDatabaseHas('siswa_rombel', ['id_siswa' => 'SIS-4', 'id_periode' => 'PER-T', 'id_kelas' => 'KLS-B']);

        // Daftar siswa bawaan hanya yang aktif; status=ALL / lulus menampilkannya
        $this->getJson('/api/students')->assertOk()->assertJsonCount(3, 'data');
        $this->getJson('/api/students?status=ALL')->assertJsonCount(4, 'data');
        $this->getJson('/api/students?status=lulus')->assertJsonCount(1, 'data')->assertJsonPath('data.0.id_siswa', 'SIS-4');

        $this->putJson('/api/students/SIS-4', ['status_siswa' => 'pensiun'])->assertStatus(422);
        $this->putJson('/api/classes/KLS-A', ['nama_kelas' => '4A', 'tingkat' => 13])->assertStatus(422);
        $this->putJson('/api/classes/KLS-A', ['nama_kelas' => '4A', 'tingkat' => ''])->assertOk();
        $this->assertSame(4, Classes::find('KLS-A')->tingkat);
    }
}

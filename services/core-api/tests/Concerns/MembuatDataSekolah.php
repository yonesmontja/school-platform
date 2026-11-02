<?php

namespace Tests\Concerns;

use App\Models\Classes;
use App\Models\MasterMateri;
use App\Models\MasterMBK;
use App\Models\MasterPeriode;
use App\Models\Student;
use App\Models\Subject;
use App\Models\Teacher;
use App\Models\User;
use Illuminate\Database\Eloquent\Model;

/**
 * Sekolah mini untuk tes:
 * - Guru A: wali kelas KLS-A, mengampu MPL-A (KKM 75)
 * - Guru B: wali kelas KLS-B, mengampu MPL-B
 * - KLS-A berisi 3 siswa (SIS-1..3), KLS-B berisi 1 siswa (SIS-4)
 * - Akun: admin, kepsek, guruA, guruB, siswa (SIS-1)
 */
trait MembuatDataSekolah
{
    protected object $sekolah;

    protected function buatSekolah(): object
    {
        Model::unguarded(function () {
            MasterPeriode::create(['id_periode' => 'PER-T', 'tahun_ajaran' => '2029/2030', 'semester' => 'Genap', 'status_aktif' => 'AKTIF']);
            MasterMBK::create(['id_jenis' => 'JNS-T', 'kategori_penilaian' => 'Ulangan Harian']);
            Teacher::create(['id_guru' => 'GR-A', 'nama_guru' => 'Guru A']);
            Teacher::create(['id_guru' => 'GR-B', 'nama_guru' => 'Guru B']);
            Classes::create(['id_kelas' => 'KLS-A', 'nama_kelas' => '4A', 'wali_kelas' => 'GR-A']);
            Classes::create(['id_kelas' => 'KLS-B', 'nama_kelas' => '4B', 'wali_kelas' => 'GR-B']);
            Subject::create(['id_mapel' => 'MPL-A', 'nama_mapel' => 'Matematika', 'kkm' => 75, 'id_guru' => 'GR-A']);
            Subject::create(['id_mapel' => 'MPL-B', 'nama_mapel' => 'IPA', 'kkm' => 75, 'id_guru' => 'GR-B']);
            MasterMateri::create(['id_materi' => 'MTR-T', 'nama_materi' => 'Pecahan', 'id_mapel' => 'MPL-A', 'id_kelas' => 'KLS-A', 'id_periode' => 'PER-T']);
            foreach (['SIS-1' => 'Ani', 'SIS-2' => 'Budi', 'SIS-3' => 'Citra'] as $id => $nama) {
                Student::create(['id_siswa' => $id, 'nama_siswa' => $nama, 'id_kelas' => 'KLS-A']);
            }
            Student::create(['id_siswa' => 'SIS-4', 'nama_siswa' => 'Dodi', 'id_kelas' => 'KLS-B']);
        });

        $akun = fn (string $role, array $extra = []) => User::create($extra + [
            'name' => ucfirst($role), 'username' => $role . '_' . uniqid(), 'password' => 'rahasia123', 'role' => $role, 'aktif' => true,
        ]);

        return $this->sekolah = (object) [
            'admin' => $akun('admin'),
            'kepsek' => $akun('kepsek'),
            'guruA' => $akun('guru', ['id_guru' => 'GR-A']),
            'guruB' => $akun('guru', ['id_guru' => 'GR-B']),
            'siswa' => $akun('siswa', ['id_siswa' => 'SIS-1']),
            'periode' => 'PER-T',
            // Parameter satu lembar penilaian mapel MPL-A di KLS-A
            'meta' => ['id_kelas' => 'KLS-A', 'id_mapel' => 'MPL-A', 'id_periode' => 'PER-T', 'id_jenis' => 'JNS-T', 'id_materi' => 'MTR-T'],
        ];
    }
}

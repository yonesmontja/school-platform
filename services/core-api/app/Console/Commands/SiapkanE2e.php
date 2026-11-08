<?php

namespace App\Console\Commands;

use App\Models\BankSoal;
use App\Models\Classes;
use App\Models\MasterIndikator;
use App\Models\MasterKategoriPenilaian;
use App\Models\MasterMateri;
use App\Models\MasterMBK;
use App\Models\MasterOrtu;
use App\Models\MasterPeriode;
use App\Models\SchoolSetting;
use App\Models\Student;
use App\Models\Subject;
use App\Models\Teacher;
use App\Models\TransJadwal;
use App\Models\User;
use Illuminate\Console\Command;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Artisan;

/**
 * Database untuk tes web end-to-end (tests/web): dikosongkan lalu diisi sekolah fiktif.
 * Hanya mau berjalan bila nama database berakhiran "_e2e" (container core-api-e2e), sehingga
 * tidak mungkin menyentuh database sekolah.
 */
class SiapkanE2e extends Command
{
    public const SANDI = 'Uji-E2E-2026';

    protected $signature = 'e2e:siapkan';

    protected $description = 'Kosongkan dan isi database tes web (school_platform_e2e) dengan sekolah fiktif';

    public function handle(): int
    {
        $db = config('database.connections.' . config('database.default') . '.database');
        if (! str_ends_with((string) $db, '_e2e')) {
            $this->error("Ditolak: database \"{$db}\" bukan database tes (harus berakhiran _e2e).");
            return self::FAILURE;
        }

        Artisan::call('migrate:fresh', ['--force' => true]);
        $this->isiSekolah();
        $this->info("Database {$db} siap. Sandi semua akun: " . self::SANDI);

        return self::SUCCESS;
    }

    private function isiSekolah(): void
    {
        $hariIni = now(config('app.zona_sekolah'))->toDateString();

        Model::unguarded(function () use ($hariIni) {
            SchoolSetting::create([
                'nama_sekolah' => 'SD Uji Coba Nusantara', 'alamat_sekolah' => 'Jalan Contoh 1', 'kota' => 'Nabire',
                'nama_kepsek' => 'Kepala Uji', 'nip_kepsek' => '000000', 'npsn' => '000000',
            ]);
            MasterPeriode::create(['id_periode' => 'PER-E2E', 'tahun_ajaran' => '2026/2027', 'semester' => 'Ganjil', 'status_aktif' => 'AKTIF']);
            MasterMBK::create(['id_jenis' => 'JNS-UH', 'kategori_penilaian' => 'Ulangan Harian', 'jenis_asesmen' => 'FORMATIF']);
            MasterMBK::create(['id_jenis' => 'JNS-TPA', 'kategori_penilaian' => 'Tes Pemetaan Awal', 'jenis_asesmen' => 'DIAGNOSTIK']);
            MasterKategoriPenilaian::create(['id_kategori' => 'KAT-E1', 'nama_kategori' => 'Pemahaman Konsep']);

            Teacher::create(['id_guru' => 'GR-E1', 'nama_guru' => 'Yakobus Wenda']);
            Teacher::create(['id_guru' => 'GR-E2', 'nama_guru' => 'Ester Rumbiak']);
            Classes::create(['id_kelas' => 'KLS-E4A', 'nama_kelas' => '4A', 'wali_kelas' => 'GR-E1']);
            Classes::create(['id_kelas' => 'KLS-E5A', 'nama_kelas' => '5A', 'wali_kelas' => 'GR-E2']);
            Subject::create(['id_mapel' => 'MPL-EMTK', 'nama_mapel' => 'Matematika', 'kkm' => 75, 'id_guru' => 'GR-E1']);
            Subject::create(['id_mapel' => 'MPL-EIPA', 'nama_mapel' => 'IPA', 'kkm' => 70, 'id_guru' => 'GR-E2']);

            MasterMateri::create([
                'id_materi' => 'MTR-E1', 'nama_materi' => 'Pecahan Sederhana', 'id_mapel' => 'MPL-EMTK',
                'id_kelas' => 'KLS-E4A', 'id_periode' => 'PER-E2E', 'id_kategori' => 'KAT-E1',
            ]);
            MasterIndikator::create(['id_indikator' => 'IND-E1', 'id_materi' => 'MTR-E1', 'deskripsi' => 'Menyebutkan pembilang dan penyebut', 'urutan' => 1]);
            // Materi tanpa indikator untuk tes offline (nilai diisi langsung)
            MasterMateri::create([
                'id_materi' => 'MTR-E2', 'nama_materi' => 'Bilangan Cacah', 'id_mapel' => 'MPL-EMTK',
                'id_kelas' => 'KLS-E4A', 'id_periode' => 'PER-E2E', 'id_kategori' => 'KAT-E1',
            ]);
            MasterIndikator::create(['id_indikator' => 'IND-E2', 'id_materi' => 'MTR-E1', 'deskripsi' => 'Membandingkan dua pecahan', 'urutan' => 2]);

            MasterOrtu::create(['id_ortu' => 'ORT-E1', 'nama_ayah' => 'Paulus Kogoya', 'nama_ibu' => 'Maria Kogoya', 'no_wa' => '081200000001']);
            $siswa = [
                ['SIS-E1', 'Abner Kogoya', 'L', 'KLS-E4A', 'ORT-E1'],
                ['SIS-E2', 'Debora Tabuni', 'P', 'KLS-E4A', null],
                ['SIS-E3', 'Natan Murib', 'L', 'KLS-E4A', null],
                ['SIS-E4', 'Rahel Yikwa', 'P', 'KLS-E4A', null],
                ['SIS-E5', 'Simon Wonda', 'L', 'KLS-E5A', null],
                ['SIS-E6', 'Lea Kambu', 'P', 'KLS-E5A', null],
            ];
            foreach ($siswa as $i => [$id, $nama, $jk, $kelas, $ortu]) {
                Student::create([
                    'id_siswa' => $id, 'nisn' => sprintf('900%04d', $i + 1), 'nama_siswa' => $nama,
                    'panggilan' => strtok($nama, ' '), 'jenis_kelamin' => $jk, 'id_kelas' => $kelas, 'id_ortu' => $ortu,
                ]);
            }

            TransJadwal::create([
                'id_jadwal' => 'JDW-E1', 'id_periode' => 'PER-E2E', 'id_kelas' => 'KLS-E4A', 'id_guru' => 'GR-E1',
                'id_mapel' => 'MPL-EMTK', 'id_materi' => 'MTR-E1', 'judul' => 'Matematika',
                'mulai' => "{$hariIni} 08:00", 'selesai' => "{$hariIni} 09:00",
            ]);
        });

        $akun = [
            ['Admin Uji', 'admin.e2e', 'admin', []],
            ['Kepala Uji', 'kepsek.e2e', 'kepsek', []],
            ['Yakobus Wenda', 'guru.e2e', 'guru', ['id_guru' => 'GR-E1']],
            ['Ester Rumbiak', 'guru2.e2e', 'guru', ['id_guru' => 'GR-E2']],
            ['Paulus Kogoya', 'ortu.e2e', 'ortu', ['id_ortu' => 'ORT-E1']],
            ['Natan Murib', 'siswa.e2e', 'siswa', ['id_siswa' => 'SIS-E3']],
        ];
        foreach ($akun as [$nama, $username, $role, $extra]) {
            User::create($extra + [
                'name' => $nama, 'username' => $username, 'password' => self::SANDI, 'role' => $role,
                'aktif' => true, 'wajib_ganti_password' => false,
            ]);
        }

        // Soal membaca nyaring yang sudah disetujui, untuk tes rekaman suara siswa
        BankSoal::create([
            'id_soal' => 'SOAL-E2E-BACA', 'id_mapel' => 'MPL-EMTK', 'id_kelas' => 'KLS-E4A', 'id_materi' => 'MTR-E1', 'bentuk' => 'MEMBACA_NYARING',
            'level_kognitif' => 'C3', 'tingkat_kesulitan' => 'SEDANG', 'pertanyaan' => 'Bacalah cerita pecahan berikut dengan nyaring.',
            'isi' => ['teks' => 'Ibu memotong kue menjadi empat bagian sama besar. Adik mendapat satu bagian, yaitu seperempat kue.'],
            'kunci' => [], 'rubrik' => "4 = lancar, lafal tepat, jeda sesuai tanda baca
2 = tersendat
1 = belum lancar", 'skor_maks' => 4,
            'status' => 'DISETUJUI', 'sumber' => 'MANUAL', 'dibuat_oleh' => User::where('username', 'guru.e2e')->value('id'),
            'disetujui_oleh' => User::where('username', 'kepsek.e2e')->value('id'), 'disetujui_pada' => now(),
        ]);
    }
}

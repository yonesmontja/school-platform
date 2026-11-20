<?php

namespace App\Services;

use App\Models\Classes;
use App\Models\MasterPeriode;
use App\Models\SiswaRombel;
use App\Models\Student;
use App\Models\Teacher;
use App\Models\WaliKelasPeriode;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Facades\DB;

/**
 * Siapa anggota rombel dan siapa wali kelasnya pada semester tertentu.
 * Semester aktif selalu memakai data sekarang (students.id_kelas, classes.wali_kelas);
 * semester lain memakai riwayat (siswa_rombel, wali_kelas_periode), sehingga rapor dan laporan
 * semester lama tetap utuh walaupun siswa sudah naik kelas atau wali kelas berganti.
 */
class RiwayatRombel
{
    public static function periodeAktif(): ?string
    {
        return MasterPeriode::where('status_aktif', 'AKTIF')->value('id_periode');
    }

    public static function adalahAktif(?string $idPeriode): bool
    {
        return !$idPeriode || $idPeriode === self::periodeAktif();
    }

    /** Query siswa anggota rombel pada semester itu. */
    public static function anggota(string $idKelas, ?string $idPeriode): Builder
    {
        if (self::adalahAktif($idPeriode)) return Student::query()->where('id_kelas', $idKelas);
        return Student::query()->whereIn('id_siswa', SiswaRombel::where('id_kelas', $idKelas)->where('id_periode', $idPeriode)->select('id_siswa'));
    }

    /** Rombel seorang siswa pada semester itu (null bila tidak tercatat). */
    public static function kelasSiswa(string $idSiswa, ?string $idPeriode): ?string
    {
        if (self::adalahAktif($idPeriode)) return Student::whereKey($idSiswa)->value('id_kelas');
        return SiswaRombel::where('id_siswa', $idSiswa)->where('id_periode', $idPeriode)->value('id_kelas');
    }

    /** Wali kelas rombel pada semester itu. */
    public static function wali(string $idKelas, ?string $idPeriode, array $kolom = ['id_guru', 'nama_guru', 'nip_nik']): ?Teacher
    {
        $idGuru = self::adalahAktif($idPeriode)
            ? Classes::whereKey($idKelas)->value('wali_kelas')
            : (WaliKelasPeriode::where('id_kelas', $idKelas)->where('id_periode', $idPeriode)->first()?->id_guru
                ?? Classes::whereKey($idKelas)->value('wali_kelas'));
        return $idGuru ? Teacher::whereKey($idGuru)->first($kolom) : null;
    }

    /** Catat rombel sekarang seorang siswa untuk semester aktif. */
    public static function catatSiswa(Student $s): void
    {
        $periode = self::periodeAktif();
        if (!$periode || !$s->id_kelas) return;
        SiswaRombel::updateOrCreate(['id_siswa' => $s->id_siswa, 'id_periode' => $periode], ['id_kelas' => $s->id_kelas]);
    }

    /** Catat wali sekarang sebuah rombel untuk semester aktif. */
    public static function catatWali(Classes $k): void
    {
        $periode = self::periodeAktif();
        if (!$periode) return;
        WaliKelasPeriode::updateOrCreate(['id_kelas' => $k->id_kelas, 'id_periode' => $periode], ['id_guru' => $k->wali_kelas]);
    }

    /**
     * Potret seluruh rombel & wali sekarang ke riwayat semester tertentu (dipanggil sebelum semester aktif berganti).
     * Siswa yang sudah keluar (tanpa kelas) tidak menghapus catatan lamanya.
     */
    public static function potret(string $idPeriode): int
    {
        $now = now();
        $siswa = Student::whereNotNull('id_kelas')->get(['id_siswa', 'id_kelas']);
        DB::transaction(function () use ($siswa, $idPeriode, $now) {
            foreach ($siswa->chunk(500) as $c) {
                SiswaRombel::upsert($c->map(fn($s) => ['id_siswa' => $s->id_siswa, 'id_periode' => $idPeriode, 'id_kelas' => $s->id_kelas, 'created_at' => $now, 'updated_at' => $now])->values()->all(),
                    ['id_siswa', 'id_periode'], ['id_kelas', 'updated_at']);
            }
            $kelas = Classes::get(['id_kelas', 'wali_kelas']);
            if ($kelas->isNotEmpty()) {
                WaliKelasPeriode::upsert($kelas->map(fn($k) => ['id_kelas' => $k->id_kelas, 'id_periode' => $idPeriode, 'id_guru' => $k->wali_kelas, 'created_at' => $now, 'updated_at' => $now])->values()->all(),
                    ['id_kelas', 'id_periode'], ['id_guru', 'updated_at']);
            }
        });
        return $siswa->count();
    }

    /**
     * Riwayat rombel seorang siswa, urut semester (dipakai rekam jejak; semester aktif ditambahkan dari kelas sekarang).
     *
     * @return array<int, array{id_periode: string, tahun_ajaran: string, semester: string, id_kelas: string, nama_kelas: ?string, tingkat: ?int, aktif: bool}>
     */
    public static function riwayatSiswa(string $idSiswa): array
    {
        $baris = SiswaRombel::with(['kelas:id_kelas,nama_kelas,tingkat', 'periode:id_periode,tahun_ajaran,semester'])
            ->where('id_siswa', $idSiswa)->get()->keyBy('id_periode');
        $aktif = self::periodeAktif();
        $sekarang = Student::whereKey($idSiswa)->value('id_kelas');
        $hasil = $baris->map(fn($r) => [
            'id_periode' => $r->id_periode,
            'tahun_ajaran' => $r->periode?->tahun_ajaran,
            'semester' => $r->periode?->semester,
            'id_kelas' => $r->id_periode === $aktif && $sekarang ? $sekarang : $r->id_kelas,
            'nama_kelas' => $r->kelas?->nama_kelas,
            'tingkat' => $r->kelas?->tingkat,
            'aktif' => $r->id_periode === $aktif,
        ]);
        if ($aktif && $sekarang && !$hasil->has($aktif)) {
            $p = MasterPeriode::find($aktif);
            $k = Classes::find($sekarang);
            $hasil[$aktif] = ['id_periode' => $aktif, 'tahun_ajaran' => $p?->tahun_ajaran, 'semester' => $p?->semester, 'id_kelas' => $sekarang, 'nama_kelas' => $k?->nama_kelas, 'tingkat' => $k?->tingkat, 'aktif' => true];
        }
        return $hasil->values()->sortBy(fn($r) => ($r['tahun_ajaran'] ?? '') . ($r['semester'] === 'Genap' ? '2' : '1'))->values()->all();
    }

    /** Tingkat dari nama kelas ("Kelas 2A" → 2, "Kelas IV B" → 4). */
    public static function tingkatDariNama(string $nama): ?int
    {
        if (preg_match('/\b(1[0-2]|[1-9])(?!\d)/', $nama, $m)) return (int) $m[1];
        foreach (['XII' => 12, 'XI' => 11, 'X' => 10, 'IX' => 9, 'VIII' => 8, 'VII' => 7, 'VI' => 6, 'V' => 5, 'IV' => 4, 'III' => 3, 'II' => 2, 'I' => 1] as $r => $n) {
            if (preg_match('/\b' . $r . '(?=[A-Z]?\b)/', $nama)) return $n;
        }
        return null;
    }
}

<?php

namespace App\Services;

use App\Models\Classes;
use App\Models\PengampuMapel;
use App\Models\Subject;

/**
 * Pembagian mengajar per semester. Untuk satu rombel × mapel, guru yang berlaku adalah guru di pengampu_mapel
 * pada semester itu; bila belum diatur, guru bawaan di Mata Pelajaran (subjects.id_guru).
 * Sekolah yang belum mengatur pembagian apa pun berperilaku persis seperti sebelumnya.
 */
class Pengampu
{
    /** Guru yang mengampu mapel di rombel itu pada semester tersebut (bawaan: semester aktif). */
    public static function guru(string $idKelas, string $idMapel, ?string $idPeriode = null): ?string
    {
        $idPeriode ??= RiwayatRombel::periodeAktif();
        return ($idPeriode ? PengampuMapel::where(['id_periode' => $idPeriode, 'id_kelas' => $idKelas, 'id_mapel' => $idMapel])->value('id_guru') : null)
            ?? Subject::whereKey($idMapel)->value('id_guru');
    }

    /** Apakah guru mengampu mapel ini di rombel ini pada semester tersebut. */
    public static function mengampu(string $idGuru, string $idMapel, string $idKelas, ?string $idPeriode = null): bool
    {
        return self::guru($idKelas, $idMapel, $idPeriode) === $idGuru;
    }

    /**
     * Mapel yang diampu guru pada semester itu: mapel yang dibagikan kepadanya, ditambah mapel bawaannya
     * selama masih ada rombel aktif yang belum dibagikan ke guru lain.
     */
    public static function mapelGuru(string $idGuru, ?string $idPeriode = null): array
    {
        $idPeriode ??= RiwayatRombel::periodeAktif();
        $bawaan = Subject::where('id_guru', $idGuru)->pluck('id_mapel')->all();
        if (!$idPeriode) return $bawaan;

        $baris = PengampuMapel::where('id_periode', $idPeriode)->get(['id_kelas', 'id_mapel', 'id_guru']);
        if ($baris->isEmpty()) return $bawaan;

        $dibagi = $baris->where('id_guru', $idGuru)->pluck('id_mapel')->all();
        $jumlahKelas = Classes::aktifSemester($idPeriode)->count();
        $perMapel = $baris->groupBy('id_mapel');
        // Mapel bawaan tetap miliknya bila sebagian rombel belum dibagikan, atau ada rombel yang dibagikan kepadanya
        $sisaBawaan = array_filter($bawaan, fn($m) => !isset($perMapel[$m]) || $perMapel[$m]->count() < $jumlahKelas);
        return array_values(array_unique([...$dibagi, ...$sisaBawaan]));
    }

    /** Rombel tempat guru mengampu mapel itu pada semester tersebut. */
    public static function kelasGuru(string $idGuru, string $idMapel, ?string $idPeriode = null): array
    {
        $idPeriode ??= RiwayatRombel::periodeAktif();
        $baris = $idPeriode ? PengampuMapel::where(['id_periode' => $idPeriode, 'id_mapel' => $idMapel])->pluck('id_guru', 'id_kelas') : collect();
        $bawaan = Subject::whereKey($idMapel)->value('id_guru');
        return Classes::aktifSemester($idPeriode)->pluck('id_kelas')
            ->filter(fn($k) => ($baris[$k] ?? $bawaan) === $idGuru)->values()->all();
    }

    /** Salin pembagian mengajar dari satu semester ke semester lain (baris yang sudah ada tidak ditimpa). */
    public static function salin(string $dari, string $ke): int
    {
        $now = now();
        $ada = PengampuMapel::where('id_periode', $ke)->get(['id_kelas', 'id_mapel'])->map(fn($r) => "{$r->id_kelas}|{$r->id_mapel}")->flip();
        $baru = PengampuMapel::where('id_periode', $dari)->get()
            ->reject(fn($r) => $ada->has("{$r->id_kelas}|{$r->id_mapel}"))
            ->map(fn($r) => ['id_periode' => $ke, 'id_kelas' => $r->id_kelas, 'id_mapel' => $r->id_mapel, 'id_guru' => $r->id_guru, 'created_at' => $now, 'updated_at' => $now]);
        foreach ($baru->chunk(500) as $c) PengampuMapel::insert($c->values()->all());
        return $baru->count();
    }
}

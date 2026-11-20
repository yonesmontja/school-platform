<?php

namespace App\Services;

use App\Models\PesanSiswa;
use App\Models\Student;
use App\Models\User;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * Pesan dua arah wali kelas ↔ orang tua/siswa (satu utas per siswa).
 * Peserta utas: akun siswa & orang tua/wali siswa itu, wali kelasnya, admin, dan kepala sekolah.
 */
class PesanService
{
    public static function boleh(User $u, Student $s): bool
    {
        if ($u->isPortal()) return in_array($s->id_siswa, $u->siswaTerjangkau(), true);
        if ($u->isAdmin() || $u->isKepsek()) return true;
        return $u->isGuru() && $s->id_kelas && in_array($s->id_kelas, $u->kelasBinaan(), true);
    }

    /** id_siswa yang utasnya terjangkau akun: portal anaknya; wali kelas binaannya; admin/kepsek binaan + semua yang punya pesan. */
    public static function siswaUtas(User $u): Collection
    {
        if ($u->isPortal()) return collect($u->siswaTerjangkau());
        $binaan = $u->kelasBinaan() ? Student::whereIn('id_kelas', $u->kelasBinaan())->pluck('id_siswa') : collect();
        if ($u->isAdmin() || $u->isKepsek()) return $binaan->merge(PesanSiswa::distinct()->pluck('id_siswa'))->unique()->values();
        return $u->isGuru() ? $binaan : collect();
    }

    /** Jumlah pesan belum dibaca per siswa (pesan dari orang lain setelah penanda terakhir akun ini). */
    public static function belumDibaca(User $u, Collection $idSiswa): Collection
    {
        if ($idSiswa->isEmpty()) return collect();
        return PesanSiswa::query()
            ->leftJoin('pesan_siswa_dibaca as d', fn($j) => $j->on('d.id_siswa', '=', 'pesan_siswa.id_siswa')->where('d.user_id', $u->id))
            ->whereIn('pesan_siswa.id_siswa', $idSiswa)
            ->where(fn($q) => $q->whereNull('pesan_siswa.dari_user')->orWhere('pesan_siswa.dari_user', '<>', $u->id))
            ->whereRaw('pesan_siswa.id > COALESCE(d.terakhir_id, 0)')
            ->groupBy('pesan_siswa.id_siswa')
            ->selectRaw('pesan_siswa.id_siswa, count(*) as n')
            ->pluck('n', 'id_siswa');
    }

    public static function tandaiDibaca(User $u, string $idSiswa, int $sampaiId): void
    {
        if ($sampaiId <= 0) return;
        DB::table('pesan_siswa_dibaca')->upsert(
            [['user_id' => $u->id, 'id_siswa' => $idSiswa, 'terakhir_id' => $sampaiId, 'dibaca_pada' => now()]],
            ['user_id', 'id_siswa'], ['terakhir_id', 'dibaca_pada']
        );
    }
}

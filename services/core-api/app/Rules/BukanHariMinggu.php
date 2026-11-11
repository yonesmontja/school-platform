<?php

namespace App\Rules;

use App\Models\HariLibur;
use Carbon\Carbon;
use Closure;
use Illuminate\Contracts\Validation\ValidationRule;

/**
 * Tanggal kegiatan sekolah tidak boleh hari Minggu (libur umum) atau hari libur di tabel hari_libur (libur nasional,
 * cuti bersama, libur sekolah): jadwal, presensi, nilai, jurnal, rencana tindak lanjut, jadwal ujian.
 * Nilai yang bukan tanggal valid dibiarkan untuk aturan `date` / `date_format`.
 */
class BukanHariMinggu implements ValidationRule
{
    public function validate(string $attribute, mixed $value, Closure $fail): void
    {
        if (!is_string($value) || $value === '') return;
        try {
            $tanggal = Carbon::parse($value);
        } catch (\Throwable) {
            return;
        }
        if ($pesan = self::alasan($tanggal)) $fail($pesan);
    }

    /** Pesan penolakan bila tanggal adalah hari Minggu atau hari libur; null bila hari sekolah. */
    public static function alasan(Carbon $tanggal): ?string
    {
        if ($tanggal->isSunday()) return self::pesan($tanggal);
        if ($nama = HariLibur::namaPada($tanggal)) {
            return 'Tanggal ' . $tanggal->locale('id')->translatedFormat('j F Y') . " adalah hari libur ({$nama}). Pilih hari sekolah lain.";
        }
        return null;
    }

    public static function pesan(Carbon $tanggal): string
    {
        return 'Tanggal ' . $tanggal->locale('id')->translatedFormat('j F Y') . ' adalah hari Minggu (libur umum). Pilih hari Senin–Sabtu.';
    }
}

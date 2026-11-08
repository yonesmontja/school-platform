<?php

namespace App\Rules;

use Carbon\Carbon;
use Closure;
use Illuminate\Contracts\Validation\ValidationRule;

/**
 * Tanggal kegiatan sekolah tidak boleh hari Minggu (libur umum): jadwal, presensi, nilai, jurnal, rencana tindak lanjut,
 * jadwal ujian. Nilai yang bukan tanggal valid dibiarkan untuk aturan `date` / `date_format`.
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
        if ($tanggal->isSunday()) {
            $fail(self::pesan($tanggal));
        }
    }

    public static function pesan(Carbon $tanggal): string
    {
        return 'Tanggal ' . $tanggal->locale('id')->translatedFormat('j F Y') . ' adalah hari Minggu (libur umum). Pilih hari Senin–Sabtu.';
    }
}

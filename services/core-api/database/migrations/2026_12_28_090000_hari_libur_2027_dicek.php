<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Kalender 2027 dicocokkan (19 Nov 2026) dengan SKB Menteri Agama, Menteri Ketenagakerjaan, dan Menteri PANRB
 * Nomor 1205, 3, dan 2 Tahun 2026 (ditandatangani 15 September 2026), sebagaimana dikutip setneg.go.id:
 * 18 hari libur nasional + 8 hari cuti bersama. Semua 26 tanggal data awal cocok, jadi tanda "perlu dicek" dilepas.
 * Hanya baris yang tanggal DAN jenisnya sama dengan daftar resmi yang diubah; tambahan atau ubahan sekolah tidak disentuh.
 */
return new class extends Migration
{
    private const RESMI = [
        'NASIONAL' => ['2027-01-01', '2027-01-05', '2027-02-06', '2027-03-08', '2027-03-10', '2027-03-11', '2027-03-26', '2027-03-28', '2027-05-01',
            '2027-05-06', '2027-05-17', '2027-05-20', '2027-06-01', '2027-06-06', '2027-08-15', '2027-08-17', '2027-12-25', '2027-12-26'],
        'CUTI_BERSAMA' => ['2027-02-05', '2027-03-09', '2027-03-12', '2027-03-15', '2027-03-25', '2027-05-18', '2027-05-19', '2027-12-24'],
    ];

    public function up(): void
    {
        foreach (self::RESMI as $jenis => $tanggal) {
            DB::table('hari_libur')->where('jenis', $jenis)->whereIn('tanggal', $tanggal)->where('perlu_cek', true)->update(['perlu_cek' => false, 'updated_at' => now()]);
        }
    }

    public function down(): void
    {
        foreach (self::RESMI as $jenis => $tanggal) {
            DB::table('hari_libur')->where('jenis', $jenis)->whereIn('tanggal', $tanggal)->update(['perlu_cek' => true]);
        }
    }
};

<?php

namespace App\Support;

/** Konstanta Keuangan & Pembayaran (Administrasi Sekolah Tahap C). */
class Keuangan
{
    public const PERIODE = ['BULANAN' => 'Bulanan', 'SEKALI' => 'Sekali bayar'];

    public const STATUS = ['BELUM' => 'Belum dibayar', 'SEBAGIAN' => 'Dibayar sebagian', 'LUNAS' => 'Lunas', 'BATAL' => 'Dibatalkan'];

    public const METODE = ['TUNAI' => 'Tunai', 'TRANSFER' => 'Transfer bank', 'LAINNYA' => 'Lainnya'];

    public const BULAN = [1 => 'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

    /** Kategori kas yang disarankan; operator boleh menulis kategori lain. */
    public const KATEGORI_KAS = [
        'MASUK' => ['Dana BOS', 'Sumbangan', 'Usaha sekolah', 'Lainnya'],
        'KELUAR' => ['Honor', 'ATK & bahan ajar', 'Listrik, air & internet', 'Pemeliharaan', 'Kegiatan siswa', 'Lainnya'],
    ];

    /** "2027-07" → "Juli 2027". */
    public static function namaBulan(string $kode): string
    {
        [$th, $bl] = explode('-', $kode);
        return self::BULAN[(int) $bl] . " {$th}";
    }

    /** "2027-07-10" → "10 Juli 2027". */
    public static function tanggal(string $ymd): string
    {
        [$th, $bl, $hr] = explode('-', substr($ymd, 0, 10));
        return (int) $hr . ' ' . self::BULAN[(int) $bl] . " {$th}";
    }

    public static function rupiah(int $n): string
    {
        return 'Rp' . number_format($n, 0, ',', '.');
    }
}

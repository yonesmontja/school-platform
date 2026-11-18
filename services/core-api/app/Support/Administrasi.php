<?php

namespace App\Support;

/**
 * Daftar submodul Administrasi Sekolah (Fase 26). Kode dipakai di kolom operator_sekolah.submodul,
 * middleware `administrasi:KODE`, dan profil akses frontend. `tahap` = tahap roadmap yang membangun submodul itu.
 */
class Administrasi
{
    public const SUBMODUL = [
        'SPMB' => ['nama' => 'SPMB', 'uraian' => 'Pendaftaran murid baru: formulir daring, berkas, verifikasi, pengumuman, daftar ulang', 'tahap' => 'B', 'ikon' => 'bi-person-plus'],
        'KEUANGAN' => ['nama' => 'Keuangan & Pembayaran', 'uraian' => 'Jenis biaya, tagihan per siswa, kuitansi, tunggakan, laporan kas', 'tahap' => 'C', 'ikon' => 'bi-cash-coin'],
        'SURAT' => ['nama' => 'Surat & Arsip', 'uraian' => 'Penomoran otomatis, templat surat, surat masuk/keluar, arsip dan dokumen legal', 'tahap' => 'D', 'ikon' => 'bi-envelope-paper'],
        'INVENTARIS' => ['nama' => 'Inventaris', 'uraian' => 'Aset per ruang, kondisi, peminjaman, stok habis pakai, pengadaan', 'tahap' => 'E', 'ikon' => 'bi-box-seam'],
    ];

    /** Submodul yang sudah dibangun; yang lain tampil sebagai "belum tersedia". */
    public const TERSEDIA = ['SPMB'];

    public static function kode(): array
    {
        return array_keys(self::SUBMODUL);
    }

    /** Buang kode tak dikenal dan duplikat, urutkan sesuai daftar resmi. */
    public static function rapikan(array $kode): array
    {
        return array_values(array_intersect(self::kode(), $kode));
    }
}

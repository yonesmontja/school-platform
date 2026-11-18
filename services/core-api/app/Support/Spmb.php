<?php

namespace App\Support;

/** Daftar baku SPMB (Fase 26 Tahap B): jenis berkas dan alur status pendaftar. */
class Spmb
{
    public const BERKAS = [
        'AKTA' => 'Akta kelahiran',
        'KK' => 'Kartu Keluarga',
        'FOTO' => 'Pas foto',
        'IJAZAH' => 'Ijazah / SKL sekolah asal',
        'RAPOR' => 'Rapor terakhir',
        'KIP' => 'KIP / KKS / PKH',
        'LAINNYA' => 'Berkas lain',
    ];

    /**
     * Alur: DIAJUKAN ⇄ PERLU_PERBAIKAN → TERVERIFIKASI → DITERIMA / CADANGAN / TIDAK_DITERIMA
     * → DAFTAR_ULANG (pendaftar mengonfirmasi) → SELESAI (sudah menjadi siswa).
     */
    public const STATUS = [
        'DIAJUKAN' => 'Menunggu verifikasi',
        'PERLU_PERBAIKAN' => 'Perlu perbaikan',
        'TERVERIFIKASI' => 'Terverifikasi',
        'DITERIMA' => 'Diterima',
        'CADANGAN' => 'Cadangan',
        'TIDAK_DITERIMA' => 'Tidak diterima',
        'DAFTAR_ULANG' => 'Sudah daftar ulang',
        'SELESAI' => 'Menjadi siswa',
    ];

    public const HASIL = ['DITERIMA', 'CADANGAN', 'TIDAK_DITERIMA'];

    /** Status yang masih boleh diubah datanya / diunggah berkasnya oleh pendaftar. */
    public const BOLEH_UBAH = ['DIAJUKAN', 'PERLU_PERBAIKAN'];

    /** Berkas: foto/PDF saja, maks. 5 MB (foto sudah diperkecil di browser). */
    public const MIME = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp', 'application/pdf' => 'pdf'];
    public const MAKS_BYTE = 5 * 1024 * 1024;
}

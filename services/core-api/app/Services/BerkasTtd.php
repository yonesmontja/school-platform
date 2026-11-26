<?php

namespace App\Services;

use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

/**
 * Berkas gambar tanda tangan (kepala sekolah & guru). Disimpan di disk privat (storage/app/private/signatures),
 * tidak lewat /storage publik, dan hanya diberikan kepada akun staf yang masuk lewat GET /api/signature/{nama}.
 * Nilai kolom tetap berbentuk "/storage/signatures/<nama>" agar data lama tetap terbaca; yang dipakai hanya nama berkasnya.
 */
class BerkasTtd
{
    public const MAP = 'signatures';

    /** Simpan data URL PNG/JPEG sebagai berkas tanda tangan baru; mengembalikan nilai untuk kolom *_url. */
    public static function simpan(string $dataUrl, string $awalan, string $kolom): string
    {
        $tolak = fn(string $pesan) => throw ValidationException::withMessages([$kolom => $pesan]);
        if (!preg_match('#^data:image/(png|jpeg);base64,#', $dataUrl)) $tolak('Tanda tangan harus berupa gambar PNG atau JPG.');
        $biner = base64_decode(substr($dataUrl, strpos($dataUrl, ',') + 1), true);
        if ($biner === false || strlen($biner) > 2 * 1024 * 1024) $tolak('Gambar tanda tangan maksimal 2 MB.');
        $info = @getimagesizefromstring($biner);
        if (!$info || !in_array($info[2], [IMAGETYPE_PNG, IMAGETYPE_JPEG], true)) $tolak('Berkas tanda tangan bukan gambar PNG/JPG yang valid.');
        // Nama acak: tidak bisa ditebak dari waktu unggah
        $nama = $awalan . '_' . time() . '_' . Str::lower(Str::random(16)) . ($info[2] === IMAGETYPE_PNG ? '.png' : '.jpg');
        Storage::disk('local')->put(self::MAP . '/' . $nama, $biner);
        return '/storage/' . self::MAP . '/' . $nama;
    }

    /** Hapus berkas tanda tangan (di disk privat maupun sisa lama di disk publik). */
    public static function hapus(?string $url): void
    {
        if (!$url) return;
        $nama = basename($url);
        Storage::disk('local')->delete(self::MAP . '/' . $nama);
        Storage::disk('public')->delete(self::MAP . '/' . $nama);
    }

    /** Path lengkap berkas di disk privat, null bila tidak ada. */
    public static function path(string $nama): ?string
    {
        $nama = basename($nama);
        if ($nama === '' || !preg_match('/^[A-Za-z0-9_.-]+\.(png|jpe?g)$/i', $nama)) return null;
        $relatif = self::MAP . '/' . $nama;
        return Storage::disk('local')->exists($relatif) ? Storage::disk('local')->path($relatif) : null;
    }

    /**
     * Pindahkan berkas lama dari disk publik ke disk privat. Berkas privat yang sudah ada tidak pernah ditimpa;
     * salinan publik yang tidak bisa dihapus (izin berkas di host) dikosongkan agar gambarnya tidak lagi bisa diunduh.
     * Mengembalikan [dipindahkan, dikosongkan].
     */
    public static function amankanBerkasLama(): array
    {
        $publik = Storage::disk('public');
        $privat = Storage::disk('local');
        $pindah = $kosong = 0;
        foreach ($publik->files(self::MAP) as $relatif) {
            $tujuan = self::MAP . '/' . basename($relatif);
            if (!$privat->exists($tujuan)) {
                $isi = $publik->get($relatif);
                if ($isi === null || $isi === '') continue;
                $privat->put($tujuan, $isi);
            }
            if ($publik->delete($relatif) && !$publik->exists($relatif)) { $pindah++; continue; }
            if ($publik->size($relatif) > 0) { @file_put_contents($publik->path($relatif), ''); $kosong++; }
        }
        return [$pindah, $kosong];
    }
}

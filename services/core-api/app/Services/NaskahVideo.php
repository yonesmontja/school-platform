<?php

namespace App\Services;

/**
 * Naskah video rakitan (Studio Rakit Video): JSON adegan → elemen yang tidak terikat mesin render.
 * Semua posisi & ukuran dalam persen bingkai sehingga satu naskah cocok untuk rasio apa pun.
 * Kelas ini membersihkan naskah dari klien: hanya kunci yang dikenal, angka dalam batas, teks dipotong.
 * Bentuknya sama dengan rapikanNaskah() di apps/web/components/video/templat/rakitan.jsx.
 */
class NaskahVideo
{
    public const MESIN = ['REMOTION', 'REVIDEO'];
    public const TIPE = ['teks', 'emoji', 'gambar', 'bentuk'];
    public const BENTUK = ['kotak', 'bulat', 'lingkaran', 'panah', 'bintang', 'garis'];
    public const MASUK = ['tidak', 'pudar', 'geser-kiri', 'geser-kanan', 'geser-atas', 'geser-bawah', 'pop', 'zoom', 'putar', 'mantul', 'ketik', 'sapu'];
    public const GERAK = ['tidak', 'melambung', 'denyut', 'goyang', 'putar'];
    public const KELUAR = ['tidak', 'pudar', 'geser-kiri', 'geser-kanan', 'geser-atas', 'geser-bawah', 'zoom'];
    public const TUJUAN = ['PEMBELAJARAN', 'PROMOSI', 'PENGUMUMAN', 'ACARA'];
    public const TRANSISI = ['tidak', 'pudar', 'geser', 'zoom'];
    public const LATAR = ['warna', 'gradien', 'gambar'];
    public const HURUF = ['Nunito', 'Noto Sans', 'Noto Serif', 'DejaVu Sans'];
    public const MAKS_ADEGAN = 20;
    public const MAKS_ELEMEN = 12;
    private const ASET = '#^/storage/video-aset/[\w.-]+\.(png|jpe?g|webp)$#';
    private const ASET_AUDIO = '#^/storage/video-aset/[\w.-]+\.(mp3|m4a|ogg|wav)$#';

    public static function rapikan(array $p): array
    {
        $merek = is_array($p['merek'] ?? null) ? $p['merek'] : [];
        return [
            'rasio' => in_array($p['rasio'] ?? null, ['16:9', '9:16', '1:1', '4:3'], true) ? $p['rasio'] : '16:9',
            'judul' => self::teks($p['judul'] ?? '', 120),
            'subtitle' => (bool) ($p['subtitle'] ?? true),
            'musik' => self::musik($p['musik'] ?? null),
            'merek' => [
                'logo' => self::aset($merek['logo'] ?? null),
                'posisi_logo' => in_array($merek['posisi_logo'] ?? null, ['kiri-atas', 'kanan-atas', 'kiri-bawah', 'kanan-bawah', 'tidak'], true) ? $merek['posisi_logo'] : 'kanan-atas',
                'huruf' => in_array($merek['huruf'] ?? null, self::HURUF, true) ? $merek['huruf'] : 'Nunito',
                'warna' => array_values(array_slice(array_filter(array_map([self::class, 'warna'], (array) ($merek['warna'] ?? []))), 0, 4)),
            ],
            'adegan' => array_values(array_map([self::class, 'adegan'], array_slice(array_values(array_filter((array) ($p['adegan'] ?? []), 'is_array')), 0, self::MAKS_ADEGAN))),
        ];
    }

    private static function adegan(array $a): array
    {
        $l = is_array($a['latar'] ?? null) ? $a['latar'] : [];
        return [
            'narasi' => self::teks($a['narasi'] ?? '', 600),
            'durasi' => self::angka($a['durasi'] ?? null, 2, 30, null),
            'transisi' => in_array($a['transisi'] ?? null, self::TRANSISI, true) ? $a['transisi'] : 'pudar',
            'latar' => [
                'tipe' => in_array($l['tipe'] ?? null, self::LATAR, true) ? $l['tipe'] : 'warna',
                'warna' => self::warna($l['warna'] ?? null) ?? '#ffffff',
                'warna2' => self::warna($l['warna2'] ?? null) ?? '#dbeafe',
                'gambar' => self::aset($l['gambar'] ?? null),
                'redup' => self::angka($l['redup'] ?? 0, 0, 0.8, 0),
            ],
            'elemen' => array_values(array_filter(array_map([self::class, 'elemen'], array_slice(array_values(array_filter((array) ($a['elemen'] ?? []), 'is_array')), 0, self::MAKS_ELEMEN)))),
        ];
    }

    private static function elemen(array $e): ?array
    {
        $tipe = in_array($e['tipe'] ?? null, self::TIPE, true) ? $e['tipe'] : null;
        if (!$tipe) return null;
        $g = is_array($e['gaya'] ?? null) ? $e['gaya'] : [];
        $m = is_array($e['masuk'] ?? null) ? $e['masuk'] : [];
        $isi = match ($tipe) {
            'gambar' => self::aset($e['isi'] ?? null),
            'bentuk' => in_array($e['isi'] ?? null, self::BENTUK, true) ? $e['isi'] : 'kotak',
            'emoji' => self::teks($e['isi'] ?? '', 16),
            default => self::teks($e['isi'] ?? '', 300),
        };
        if ($tipe === 'gambar' && !$isi) return null;
        return [
            'id' => preg_replace('/[^\w-]/', '', (string) ($e['id'] ?? '')) ?: bin2hex(random_bytes(4)),
            'tipe' => $tipe,
            'isi' => $isi,
            'x' => self::angka($e['x'] ?? 50, -20, 120, 50),
            'y' => self::angka($e['y'] ?? 50, -20, 120, 50),
            'w' => self::angka($e['w'] ?? 40, 2, 150, 40),
            'h' => self::angka($e['h'] ?? 20, 2, 150, 20),
            'rot' => self::angka($e['rot'] ?? 0, -180, 180, 0),
            'gaya' => [
                'ukuran' => self::angka($g['ukuran'] ?? 60, 10, 400, 60),
                'warna' => self::warna($g['warna'] ?? null) ?? '#1f2937',
                'latar' => self::warna($g['latar'] ?? null),
                'garis' => self::warna($g['garis'] ?? null),
                'tebal' => (bool) ($g['tebal'] ?? true),
                'miring' => (bool) ($g['miring'] ?? false),
                'rata' => in_array($g['rata'] ?? null, ['kiri', 'tengah', 'kanan'], true) ? $g['rata'] : 'tengah',
                'sudut' => self::angka($g['sudut'] ?? 0, 0, 50, 0),
                'bayangan' => (bool) ($g['bayangan'] ?? false),
                'buram' => self::angka($g['buram'] ?? 1, 0.1, 1, 1),
            ],
            'masuk' => [
                'preset' => in_array($m['preset'] ?? null, self::MASUK, true) ? $m['preset'] : 'pudar',
                'mulai' => self::angka($m['mulai'] ?? 0, 0, 30, 0),
                'durasi' => self::angka($m['durasi'] ?? 0.6, 0.1, 5, 0.6),
            ],
            'gerak' => in_array($e['gerak'] ?? null, self::GERAK, true) ? $e['gerak'] : 'tidak',
            'keluar' => [
                'preset' => in_array($e['keluar']['preset'] ?? null, self::KELUAR, true) ? $e['keluar']['preset'] : 'tidak',
                'pada' => self::angka($e['keluar']['pada'] ?? null, 0.2, 40, null),
            ],
        ];
    }

    private static function musik($m): ?array
    {
        if (!is_array($m) || !is_string($m['src'] ?? null) || !preg_match(self::ASET_AUDIO, $m['src'])) return null;
        return ['src' => $m['src'], 'volume' => self::angka($m['volume'] ?? 0.35, 0, 1, 0.35), 'redam' => (bool) ($m['redam'] ?? true)];
    }

    /** Semua aset gambar yang dipakai naskah (elemen, latar, logo). */
    public static function asetGambar(array $naskah): array
    {
        $aset = [$naskah['merek']['logo'] ?? null];
        foreach ($naskah['adegan'] ?? [] as $a) {
            $aset[] = $a['latar']['gambar'] ?? null;
            foreach ($a['elemen'] ?? [] as $e) if (($e['tipe'] ?? null) === 'gambar') $aset[] = $e['isi'] ?? null;
        }
        return array_values(array_unique(array_filter($aset)));
    }

    private static function teks($v, int $maks): string { return mb_substr(is_scalar($v) ? (string) $v : '', 0, $maks); }
    private static function warna($v): ?string { return is_string($v) && preg_match('/^#[0-9a-fA-F]{6}$/', $v) ? strtolower($v) : null; }
    private static function aset($v): ?string { return is_string($v) && preg_match(self::ASET, $v) ? $v : null; }
    private static function angka($v, float $min, float $maks, ?float $bawaan): ?float
    {
        if (!is_numeric($v)) return $bawaan;
        return round(min($maks, max($min, (float) $v)), 2);
    }
}

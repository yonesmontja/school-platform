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
    public const TIPE = ['teks', 'emoji', 'gambar', 'bentuk', 'ikon'];
    /** Ikon pustaka Tabler (MIT): "outline/nama" atau "filled/nama", berkas di apps/web/public/pustaka/ikon. */
    private const IKON = '#^(outline|filled)/[a-z0-9-]{1,60}$#';
    public const BENTUK = ['kotak', 'bulat', 'lingkaran', 'panah', 'bintang', 'garis'];
    public const MASUK = ['tidak', 'pudar', 'geser-kiri', 'geser-kanan', 'geser-atas', 'geser-bawah', 'pop', 'zoom', 'putar', 'mantul', 'ketik', 'kata', 'hitung', 'sapu'];
    public const GERAK = ['tidak', 'melambung', 'denyut', 'goyang', 'putar'];
    public const KELUAR = ['tidak', 'pudar', 'geser-kiri', 'geser-kanan', 'geser-atas', 'geser-bawah', 'zoom'];
    public const TUJUAN = ['PEMBELAJARAN', 'PROMOSI', 'PENGUMUMAN', 'ACARA'];
    public const TRANSISI = ['tidak', 'pudar', 'geser', 'zoom'];
    public const LATAR = ['warna', 'gradien', 'gambar'];
    public const HURUF = ['Nunito', 'Poppins', 'Playfair Display', 'Noto Sans', 'Noto Serif', 'DejaVu Sans'];
    public const KAMERA = ['tidak', 'zoom-masuk', 'zoom-keluar', 'geser-kiri', 'geser-kanan'];
    public const HIAS = ['tidak', 'gumpalan', 'bokeh', 'garis', 'titik', 'gelombang'];

    /**
     * Gaya visual siap pakai (E1): satu pilihan mengatur font judul/isi, latar hias, gerak kamera, transisi,
     * animasi teks, kartu kaca, dan palet latar. Dipakai tombol "Terapkan gaya" di Studio dan papan cerita AI.
     */
    public const GAYA = [
        'ceria' => ['nama' => 'Ceria', 'judul' => 'Nunito', 'isi' => 'Nunito', 'hias' => ['bokeh', 'gumpalan'], 'kamera' => ['zoom-masuk', 'tidak'],
            'transisi' => ['geser', 'zoom'], 'masuk_judul' => 'pop', 'masuk_isi' => 'geser-bawah', 'kaca' => false,
            'palet' => [['#2563eb', '#60a5fa'], ['#f59e0b', '#fcd34d'], ['#16a34a', '#4ade80'], ['#db2777', '#f472b6']]],
        'elegan' => ['nama' => 'Elegan', 'judul' => 'Playfair Display', 'isi' => 'Poppins', 'hias' => ['gumpalan'], 'kamera' => ['zoom-masuk', 'zoom-keluar'],
            'transisi' => ['pudar'], 'masuk_judul' => 'kata', 'masuk_isi' => 'pudar', 'kaca' => true,
            'palet' => [['#0f172a', '#1e3a8a'], ['#1c1917', '#57534e'], ['#1e1b4b', '#4c1d95'], ['#042f2e', '#0f766e']], 'hias_warna' => '#93c5fd'],
        'formal' => ['nama' => 'Formal', 'judul' => 'Poppins', 'isi' => 'Poppins', 'hias' => ['garis', 'tidak'], 'kamera' => ['tidak', 'geser-kanan'],
            'transisi' => ['pudar', 'geser'], 'masuk_judul' => 'geser-bawah', 'masuk_isi' => 'pudar', 'kaca' => false,
            'palet' => [['#0b3d91', '#1d4ed8'], ['#1f2937', '#475569'], ['#14532d', '#15803d']]],
        'modern' => ['nama' => 'Modern', 'judul' => 'Poppins', 'isi' => 'Poppins', 'hias' => ['gelombang', 'titik'], 'kamera' => ['geser-kiri', 'zoom-masuk'],
            'transisi' => ['geser', 'zoom'], 'masuk_judul' => 'kata', 'masuk_isi' => 'sapu', 'kaca' => true,
            'palet' => [['#7c3aed', '#ec4899'], ['#0ea5e9', '#6366f1'], ['#f97316', '#e11d48'], ['#059669', '#06b6d4']]],
    ];
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
            'gaya' => array_key_exists($p['gaya'] ?? null, self::GAYA) ? $p['gaya'] : null,
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
            'kamera' => in_array($a['kamera'] ?? null, self::KAMERA, true) ? $a['kamera'] : 'tidak',
            'latar' => [
                'tipe' => in_array($l['tipe'] ?? null, self::LATAR, true) ? $l['tipe'] : 'warna',
                'warna' => self::warna($l['warna'] ?? null) ?? '#ffffff',
                'warna2' => self::warna($l['warna2'] ?? null) ?? '#dbeafe',
                'gambar' => self::aset($l['gambar'] ?? null),
                'redup' => self::angka($l['redup'] ?? 0, 0, 0.8, 0),
                'hias' => in_array($l['hias'] ?? null, self::HIAS, true) ? $l['hias'] : 'tidak',
                'warna_hias' => self::warna($l['warna_hias'] ?? null) ?? '#ffffff',
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
            'ikon' => is_string($e['isi'] ?? null) && preg_match(self::IKON, $e['isi']) ? $e['isi'] : null,
            default => self::teks($e['isi'] ?? '', 300),
        };
        if (in_array($tipe, ['gambar', 'ikon'], true) && !$isi) return null;
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
                'huruf' => in_array($g['huruf'] ?? null, self::HURUF, true) ? $g['huruf'] : null,
                'kaca' => (bool) ($g['kaca'] ?? false),
                'emoji' => ($g['emoji'] ?? null) === 'datar' ? 'datar' : '3d', // emoji 3D Fluent bila tersedia
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

    // ===== Gaya visual (E1) =====

    /**
     * Terapkan gaya visual ke seluruh naskah: font judul (teks terbesar tiap adegan) & isi, animasi teks, kartu kaca,
     * latar hias, kamera, dan transisi; bila $warna, latar diganti palet gaya dan warna teks disesuaikan kontrasnya.
     */
    public static function terapkanGaya(array $naskah, string $gaya, bool $warna = true): array
    {
        $d = self::GAYA[$gaya] ?? self::GAYA['ceria'];
        $naskah = self::rapikan($naskah);
        foreach ($naskah['adegan'] as $i => &$a) {
            $a['transisi'] = $i === 0 ? 'pudar' : $d['transisi'][$i % count($d['transisi'])];
            $a['kamera'] = $d['kamera'][$i % count($d['kamera'])];
            $latarLama = $a['latar']['warna'];
            if ($warna && $a['latar']['tipe'] !== 'gambar') {
                [$w1, $w2] = $d['palet'][$i % count($d['palet'])];
                $a['latar'] = array_merge($a['latar'], ['tipe' => 'gradien', 'warna' => $w1, 'warna2' => $w2]);
            }
            $terang = $a['latar']['tipe'] !== 'gambar' && self::kontras($a['latar']['warna']) === '#1f2937';
            $a['latar']['hias'] = $d['hias'][$i % count($d['hias'])];
            $a['latar']['warna_hias'] = $terang ? '#64748b' : ($d['hias_warna'] ?? '#ffffff');
            // Teks sangat pendek (tanda kutip besar, nomor linimasa) adalah hiasan: tidak dihitung sebagai judul
            $hiasan = fn($e) => mb_strlen(trim($e['isi'])) <= 2;
            $teks = array_filter($a['elemen'], fn($e) => $e['tipe'] === 'teks' && !$hiasan($e));
            $terbesar = $teks ? max(array_map(fn($e) => $e['gaya']['ukuran'], $teks)) : 0;
            foreach ($a['elemen'] as &$e) {
                if ($e['tipe'] !== 'teks') continue;
                if ($hiasan($e)) {
                    if (ctype_digit(trim($e['isi']))) $e['gaya']['huruf'] = $d['isi'];
                    continue;
                }
                $judul = $e['gaya']['ukuran'] >= $terbesar;
                $e['gaya']['huruf'] = $judul ? $d['judul'] : $d['isi'];
                // Warna teks bawaan (putih/abu tua) mengikuti kontras latar baru; warna khusus dibiarkan
                if ($warna && in_array($e['gaya']['warna'], ['#ffffff', '#1f2937'], true) && !$e['gaya']['latar']) {
                    $e['gaya']['warna'] = $a['latar']['tipe'] === 'gambar' ? '#ffffff' : self::kontras($a['latar']['warna']);
                    $e['gaya']['bayangan'] = $e['gaya']['warna'] === '#ffffff' && $gaya === 'ceria';
                }
                if (in_array($e['masuk']['preset'], ['hitung', 'ketik'], true)) continue;
                $preset = $judul ? $d['masuk_judul'] : $d['masuk_isi'];
                $e['masuk']['preset'] = $preset;
                if ($preset === 'kata') {
                    $kata = count(preg_split('/\s+/', trim($e['isi']), -1, PREG_SPLIT_NO_EMPTY));
                    $e['masuk']['durasi'] = round(min(2, max(0.4, $kata * 0.14)), 2);
                }
                $e['gaya']['kaca'] = !$judul && $d['kaca'] && !$e['gaya']['latar'];
            }
            unset($e);
            if ($latarLama !== $a['latar']['warna']) {
                // Bentuk ber-warna latar lama (mis. teks ajakan berlatar putih bertulisan warna latar) ikut warna baru
                foreach ($a['elemen'] as &$e) if (($e['gaya']['warna'] ?? null) === $latarLama) $e['gaya']['warna'] = $a['latar']['warna'];
                unset($e);
            }
        }
        unset($a);
        $naskah['gaya'] = $gaya;
        $naskah['merek']['huruf'] = $d['isi'];
        return self::rapikan($naskah);
    }

    // ===== Papan cerita AI → naskah (D3) =====

    /**
     * Ubah papan cerita AI (isi per adegan + jenis tata letak) menjadi naskah dengan elemen berposisi baku.
     * Posisi menyesuaikan bingkai tegak (9:16), persegi (1:1), atau mendatar (16:9, 4:3).
     */
    public static function dariPapanCerita(array $papan, string $rasio, array $merek = [], ?string $gaya = null): array
    {
        $tegak = $rasio === '9:16';
        self::$aspek = ['16:9' => 16 / 9, '9:16' => 9 / 16, '1:1' => 1.0, '4:3' => 4 / 3][$rasio] ?? 16 / 9;
        $transisi = ['pudar', 'geser', 'zoom'];
        $adegan = [];
        foreach (array_slice(array_values(array_filter((array) ($papan['adegan'] ?? []), 'is_array')), 0, self::MAKS_ADEGAN) as $i => $a) {
            $latar = self::warna($a['latar'] ?? null) ?? ($merek['warna'][$i % max(1, count($merek['warna'] ?? []))] ?? '#2563eb');
            $teksW = in_array(strtolower((string) ($a['warna_teks'] ?? '')), ['#ffffff', '#1f2937'], true) ? strtolower($a['warna_teks']) : self::kontras($latar);
            $narasi = self::teks($a['narasi'] ?? '', 600);
            $kata = count(preg_split('/\s+/', trim($narasi), -1, PREG_SPLIT_NO_EMPTY));
            $tata = in_array($a['tata'] ?? null, StudioAIService::TATA, true) ? $a['tata'] : ($i === 0 ? 'pembuka' : 'emoji-besar');
            $adegan[] = [
                'narasi' => $narasi,
                'durasi' => min(30, max(4, ceil(($kata / 2.3 + 1.5) * 2) / 2)),
                'transisi' => $i === 0 ? 'pudar' : $transisi[$i % 3],
                'latar' => ['tipe' => 'gradien', 'warna' => $latar, 'warna2' => self::warna($a['latar2'] ?? null) ?? self::terangkan($latar), 'gambar' => null, 'redup' => 0],
                'elemen' => self::tataLetak($tata, $a, $tegak, $teksW, $latar, $i),
            ];
        }
        $naskah = self::rapikan(['rasio' => $rasio, 'judul' => $papan['judul'] ?? '', 'subtitle' => true, 'merek' => $merek, 'adegan' => $adegan]);
        // Gaya Ceria memakai warna pilihan AI; gaya lain memakai paletnya sendiri agar tampilannya konsisten
        return $gaya ? self::terapkanGaya($naskah, $gaya, $gaya !== 'ceria') : $naskah;
    }

    private static function tataLetak(string $tata, array $a, bool $tegak, string $warna, string $latar, int $n): array
    {
        $judul = self::teks($a['judul'] ?? '', 80);
        $sub = self::teks($a['subjudul'] ?? '', 120);
        $emoji = self::teks($a['emoji'] ?? '⭐', 16) ?: '⭐';
        $id = fn($k) => "a{$n}{$k}";
        $teks = fn($k, $isi, $x, $y, $w, $ukuran, $masuk, $mulai, $gaya = [], $lain = []) => $isi === '' ? null : array_merge([
            'id' => $id($k), 'tipe' => 'teks', 'isi' => $isi, 'x' => $x, 'y' => $y, 'w' => $w, 'h' => 12, 'rot' => 0, 'gerak' => 'tidak',
            'gaya' => array_merge(['ukuran' => $ukuran, 'warna' => $warna, 'tebal' => true, 'rata' => 'tengah', 'bayangan' => $warna === '#ffffff'], $gaya),
            'masuk' => ['preset' => $masuk, 'mulai' => $mulai, 'durasi' => 0.6],
        ], $lain);
        $emo = fn($k, $isi, $x, $y, $ukuran, $masuk, $mulai, $gerak = 'tidak') => [
            'id' => $id($k), 'tipe' => 'emoji', 'isi' => $isi, 'x' => $x, 'y' => $y, 'w' => 30, 'h' => 18, 'rot' => 0, 'gerak' => $gerak,
            'gaya' => ['ukuran' => $ukuran], 'masuk' => ['preset' => $masuk, 'mulai' => $mulai, 'durasi' => 0.7],
        ];
        $el = match ($tata) {
            'pembuka' => [
                $emo('e', $emoji, 50, $tegak ? 32 : 30, $tegak ? 220 : 180, 'pop', 0.1, 'melambung'),
                $teks('j', $judul, 50, $tegak ? 54 : 58, $tegak ? 88 : 80, $tegak ? 66 : 72, 'geser-bawah', 0.5),
                $teks('s', $sub, 50, $tegak ? 69 : 74, $tegak ? 84 : 70, $tegak ? 40 : 38, 'pudar', 0.9, ['tebal' => false]),
            ],
            'daftar' => self::daftar($a, $tegak, $warna, $n, $teks, $emo, $judul),
            'kutipan' => [
                $teks('q', '“', $tegak ? 18 : 14, $tegak ? 22 : 20, 30, $tegak ? 260 : 220, 'zoom', 0.1, ['huruf' => 'Playfair Display', 'buram' => 0.45, 'bayangan' => false]),
                $teks('j', $judul, 50, $tegak ? 46 : 46, $tegak ? 84 : 76, $tegak ? 56 : 52, 'kata', 0.4, ['huruf' => 'Playfair Display', 'miring' => true, 'tebal' => false]),
                $teks('s', $sub === '' ? '' : '— ' . ltrim($sub, '-— '), 50, $tegak ? 66 : 72, $tegak ? 80 : 60, $tegak ? 38 : 34, 'pudar', 1.4, ['tebal' => false]),
            ],
            'perbandingan' => self::perbandingan($a, $tegak, $warna, $n, $teks, $emo, $judul),
            'linimasa' => self::linimasa($a, $tegak, $warna, $n, $teks, $judul),
            'fakta' => [
                $emo('e', $emoji, 50, $tegak ? 22 : 20, 120, 'mantul', 0.1),
                preg_match('/\d/', $judul)
                    ? array_merge($teks('j', $judul, 50, $tegak ? 41 : 46, 90, $tegak ? 110 : 120, 'hitung', 0.4), ['masuk' => ['preset' => 'hitung', 'mulai' => 0.4, 'durasi' => 1.6]])
                    : $teks('j', $judul, 50, $tegak ? 41 : 46, 90, $tegak ? 110 : 120, 'pop', 0.4),
                $teks('s', $sub, 50, $tegak ? 64 : 70, $tegak ? 84 : 76, $tegak ? 44 : 40, 'pudar', 0.9, ['tebal' => false]),
            ],
            'ajakan' => [
                $teks('j', $judul, 50, $tegak ? 36 : 32, $tegak ? 88 : 70, $tegak ? 68 : 64, 'pop', 0.2,
                    ['warna' => $latar, 'latar' => '#ffffff', 'sudut' => 18, 'bayangan' => false], ['rot' => -3, 'gerak' => 'denyut']),
                $emo('e', $emoji, 50, $tegak ? 53 : 55, 140, 'mantul', 0.7, 'melambung'),
                $teks('s', $sub, 50, $tegak ? 66 : 73, $tegak ? 84 : 70, $tegak ? 46 : 40, 'pudar', 1.0),
            ],
            default => [ // emoji-besar
                $emo('e', $emoji, 50, $tegak ? 36 : 32, $tegak ? 260 : 210, 'zoom', 0.1, 'denyut'),
                $teks('j', $judul, 50, $tegak ? 60 : 62, $tegak ? 88 : 80, $tegak ? 66 : 60, 'geser-bawah', 0.6),
                $teks('s', $sub, 50, $tegak ? 69 : 74, $tegak ? 84 : 70, $tegak ? 42 : 38, 'pudar', 1.0, ['tebal' => false]),
            ],
        };
        return array_values(array_filter($el));
    }

    private static function daftar(array $a, bool $tegak, string $warna, int $n, \Closure $teks, \Closure $emo, string $judul): array
    {
        $poin = array_slice(array_values(array_filter((array) ($a['poin'] ?? []), fn($p) => is_array($p) && trim((string) ($p['teks'] ?? '')) !== '')), 0, 3);
        $el = [$teks('j', $judul, 50, $tegak ? 17 : 15, 88, $tegak ? 62 : 56, 'geser-atas', 0.1)];
        $jumlah = max(1, count($poin));
        foreach ($poin as $i => $p) {
            $mulai = 0.6 + $i * 0.6;
            $isi = self::teks($p['teks'], 60);
            $ikon = self::teks($p['emoji'] ?? '✅', 16) ?: '✅';
            if ($tegak) {
                $y = 36 + $i * 17;
                $el[] = $emo("p{$i}", $ikon, 18, $y, 100, 'pop', $mulai);
                $el[] = $teks("t{$i}", $isi, 60, $y, 64, 48, 'geser-kanan', $mulai + 0.1, ['rata' => 'kiri']);
            } else {
                $x = $jumlah === 1 ? 50 : 50 + ($i - ($jumlah - 1) / 2) * ($jumlah === 2 ? 34 : 30);
                $el[] = $emo("p{$i}", $ikon, $x, 46, 110, 'pop', $mulai);
                $el[] = $teks("t{$i}", $isi, $x, 68, $jumlah === 3 ? 22 : 28, 38, 'geser-bawah', $mulai + 0.1);
            }
        }
        return $el;
    }

    /** Dua sisi berdampingan (mendatar) atau bertumpuk (tegak) dalam kartu kaca: poin[0] vs poin[1]. */
    private static function perbandingan(array $a, bool $tegak, string $warna, int $n, \Closure $teks, \Closure $emo, string $judul): array
    {
        $poin = array_slice(array_values(array_filter((array) ($a['poin'] ?? []), fn($p) => is_array($p) && trim((string) ($p['teks'] ?? '')) !== '')), 0, 2);
        $el = [$teks('j', $judul, 50, $tegak ? 15 : 15, 88, $tegak ? 60 : 54, 'geser-atas', 0.1)];
        foreach ($poin as $i => $p) {
            [$x, $y] = $tegak ? [50, 38 + $i * 28] : [28 + $i * 44, 55];
            $mulai = 0.5 + $i * 0.7;
            $el[] = $emo("p{$i}", self::teks($p['emoji'] ?? '⭐', 16) ?: '⭐', $x, $tegak ? $y - 6 : $y - 10, $tegak ? 100 : 110, 'pop', $mulai);
            $el[] = $teks("t{$i}", self::teks($p['teks'], 60), $x, $tegak ? $y + 6 : $y + 14, $tegak ? 70 : 36, $tegak ? 44 : 40, $i ? 'geser-kanan' : 'geser-kiri', $mulai + 0.15, ['kaca' => true]);
        }
        if (count($poin) === 2) $el[] = $teks('v', 'vs', 50, $tegak ? 52 : 57, 14, $tegak ? 40 : 44, 'zoom', 1.0, ['buram' => 0.8]);
        return $el;
    }

    /** Lebar÷tinggi bingkai papan cerita yang sedang disusun (agar lingkaran tetap bulat di semua rasio). */
    private static float $aspek = 16 / 9;

    /** Linimasa 3 langkah: garis + lingkaran bernomor + label (mendatar), atau menurun di sisi kiri (tegak). */
    private static function linimasa(array $a, bool $tegak, string $warna, int $n, \Closure $teks, string $judul): array
    {
        $poin = array_slice(array_values(array_filter((array) ($a['poin'] ?? []), fn($p) => is_array($p) && trim((string) ($p['teks'] ?? '')) !== '')), 0, 3);
        $jumlah = max(1, count($poin));
        $aksen = $warna === '#ffffff' ? '#ffffff' : '#1f2937';
        $angkaW = $warna === '#ffffff' ? '#1f2937' : '#ffffff';
        $el = [$teks('j', $judul, 50, $tegak ? 13 : 16, 88, $tegak ? 58 : 54, 'geser-atas', 0.1)];
        $el[] = $tegak
            ? ['id' => "a{$n}g", 'tipe' => 'bentuk', 'isi' => 'kotak', 'x' => 20, 'y' => 30 + ($jumlah - 1) * 9, 'w' => 1.2, 'h' => max(2, ($jumlah - 1) * 18), 'rot' => 0, 'gerak' => 'tidak',
                'gaya' => ['warna' => $aksen, 'buram' => 0.5, 'sudut' => 50], 'masuk' => ['preset' => 'sapu', 'mulai' => 0.3, 'durasi' => 1.2]]
            : ['id' => "a{$n}g", 'tipe' => 'bentuk', 'isi' => 'garis', 'x' => 50, 'y' => 48, 'w' => 60, 'h' => 6, 'rot' => 0, 'gerak' => 'tidak',
                'gaya' => ['warna' => $aksen, 'buram' => 0.5], 'masuk' => ['preset' => 'sapu', 'mulai' => 0.3, 'durasi' => 1.2]];
        foreach ($poin as $i => $p) {
            $mulai = 0.5 + $i * 0.6;
            [$x, $y] = $tegak ? [20, 30 + $i * 18] : [$jumlah === 1 ? 50 : 20 + $i * (60 / ($jumlah - 1)), 48];
            $bulat = $tegak ? 9 : 7;
            // Lingkaran: tinggi (persen) = lebar (persen) × lebar/tinggi bingkai
            $el[] = ['id' => "a{$n}b{$i}", 'tipe' => 'bentuk', 'isi' => 'bulat', 'x' => $x, 'y' => $y, 'w' => $tegak ? $bulat / self::$aspek : $bulat, 'h' => $tegak ? $bulat : $bulat * self::$aspek, 'rot' => 0, 'gerak' => 'tidak',
                'gaya' => ['warna' => $aksen], 'masuk' => ['preset' => 'pop', 'mulai' => $mulai, 'durasi' => 0.5]];
            $el[] = $teks("n{$i}", (string) ($i + 1), $x, $y, 10, $tegak ? 44 : 42, 'pudar', $mulai + 0.1, ['warna' => $angkaW, 'bayangan' => false]);
            $el[] = $tegak
                ? $teks("t{$i}", self::teks($p['teks'], 60), 62, $y, 62, 44, 'geser-kanan', $mulai + 0.15, ['rata' => 'kiri'])
                : $teks("t{$i}", self::teks($p['teks'], 60), $x, 66, $jumlah === 3 ? 24 : 30, 36, 'geser-bawah', $mulai + 0.15);
        }
        return $el;
    }

    /** Daftar gaya visual untuk pilihan di Studio. */
    public static function daftarGaya(): array
    {
        return array_map(fn($k, $d) => ['kode' => $k, 'nama' => $d['nama'], 'huruf' => [$d['judul'], $d['isi']], 'palet' => $d['palet'][0]], array_keys(self::GAYA), self::GAYA);
    }

    /** Warna teks paling terbaca di atas latar (putih atau abu tua). */
    private static function kontras(string $hex): string
    {
        [$r, $g, $b] = sscanf($hex, '#%02x%02x%02x');
        return (0.299 * $r + 0.587 * $g + 0.114 * $b) > 160 ? '#1f2937' : '#ffffff';
    }

    private static function terangkan(string $hex): string
    {
        [$r, $g, $b] = sscanf($hex, '#%02x%02x%02x');
        return sprintf('#%02x%02x%02x', (int) ($r + (255 - $r) * 0.35), (int) ($g + (255 - $g) * 0.35), (int) ($b + (255 - $b) * 0.35));
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

<?php

namespace App\Services;

use App\Models\TempatPeta;
use Illuminate\Validation\ValidationException;

/**
 * Adegan peta untuk API render: (1) gerbang verifikasi, yaitu semua tempat harus ada di tabel tempat_peta;
 * (2) bingkai peta dihitung dari bbox wilayah, penanda, dan rute; (3) garis pantai Natural Earth 10m (ubin 10°,
 * resources/peta/ne10m) dipotong ke bingkai dan disederhanakan. Hasilnya elemen naskah `peta` berkoordinat
 * bujur/lintang; proyeksi Mercator dikerjakan penggambar (gerakRakitan.js) agar Remotion & Revideo sama persis.
 */
class PetaService
{
    private const UBIN = 10;
    private const MAKS_TITIK = 40000;
    // Wilayah seluas ini (derajat²) terlalu besar untuk masuk bingkai; dipakai sebagai arah rute saja (mis. samudra)
    private const WILAYAH_ARAH = 400;

    /**
     * @param array $scene adegan bertipe map dari payload (bbox, places, markers, route)
     * @param float $rasio lebar/tinggi kotak peta dalam piksel
     * @return array{0: array, 1: array} [data peta untuk elemen, peringatan]
     */
    public function susun(array $scene, float $rasio): array
    {
        $nama = array_filter(array_merge(
            [$scene['bbox'] ?? null],
            (array) ($scene['places'] ?? []),
            array_map(fn($m) => is_array($m) ? ($m['place'] ?? null) : $m, (array) ($scene['markers'] ?? [])),
            (array) ($scene['route'] ?? []),
        ), fn($x) => is_string($x) && trim($x) !== '');
        $tempat = [];
        $hilang = [];
        foreach (array_unique($nama) as $n) {
            $t = TempatPeta::cari($n);
            $t ? $tempat[$n] = $t : $hilang[] = $n;
        }
        if ($hilang) {
            throw ValidationException::withMessages(['scenes' => 'Tempat belum terverifikasi di tabel koordinat (gerbang verifikasi peta): '
                . implode(', ', $hilang) . '. Tambahkan dulu di menu API Render → Tempat Peta, atau pakai nama/kode dari GET /api/v1/places.']);
        }

        // Bingkai: bbox wilayah utama + semua titik + wilayah yang tidak terlalu luas
        $kotak = null;
        $ambil = function (array $b) use (&$kotak) {
            $kotak = $kotak ? [min($kotak[0], $b[0]), min($kotak[1], $b[1]), max($kotak[2], $b[2]), max($kotak[3], $b[3])] : $b;
        };
        foreach ($tempat as $t) {
            if ($t->jenis === 'titik') $ambil([$t->lon, $t->lat, $t->lon, $t->lat]);
            elseif ($t->bbox && $this->luas($t->bbox) < self::WILAYAH_ARAH) $ambil($t->bbox);
        }
        if (!$kotak) { // hanya wilayah luas: pakai titik labelnya
            foreach ($tempat as $t) $ambil([$t->lon - 5, $t->lat - 5, $t->lon + 5, $t->lat + 5]);
        }
        $kotak = $this->sesuaikan($kotak, $rasio);

        $titik = [];
        foreach ((array) ($scene['markers'] ?? []) as $m) {
            $n = is_array($m) ? ($m['place'] ?? null) : $m;
            if (!$n || !isset($tempat[$n])) continue;
            $t = $tempat[$n];
            $titik[] = ['nama' => $t->nama, 'lon' => $t->lon, 'lat' => $t->lat, 'ikon' => preg_replace('/[^a-z-]/', '', strtolower((string) ($m['icon'] ?? 'titik'))) ?: 'titik'];
        }
        // Label wilayah (selat, laut) yang disebut di places dan muat di bingkai
        $label = [];
        foreach ((array) ($scene['places'] ?? []) as $n) {
            $t = $tempat[$n] ?? null;
            if ($t && $t->jenis === 'wilayah' && $this->dalam($kotak, $t->lon, $t->lat)) $label[] = ['nama' => $t->nama, 'lon' => $t->lon, 'lat' => $t->lat];
            elseif ($t && $t->jenis === 'titik' && !collect($titik)->contains('nama', $t->nama)) $titik[] = ['nama' => $t->nama, 'lon' => $t->lon, 'lat' => $t->lat, 'ikon' => 'titik'];
        }
        $daratan = $this->daratan($kotak);
        // Rute lewat laut (tidak memotong daratan); tempat di luar bingkai (mis. samudra) menjadi arah ke tepi bingkai
        $titikRute = [];
        foreach ((array) ($scene['route'] ?? []) as $n) {
            if ($t = $tempat[$n] ?? null) $titikRute[] = [$t->lon, $t->lat];
        }
        $rute = count($titikRute) >= 2 ? (new RuteLaut($kotak, $daratan))->cari($titikRute) : [];

        return [[
            'bbox' => array_map(fn($v) => round($v, 4), $kotak),
            'daratan' => $daratan,
            'titik' => $titik,
            'label' => $label,
            'rute' => count($rute) >= 2 ? $rute : [],
        ], []];
    }

    private function luas(array $b): float { return abs(($b[2] - $b[0]) * ($b[3] - $b[1])); }
    private function dalam(array $k, float $x, float $y): bool { return $x >= $k[0] && $x <= $k[2] && $y >= $k[1] && $y <= $k[3]; }
    public static function merc(float $lat): float { return log(tan(M_PI / 4 + deg2rad(max(-85, min(85, $lat))) / 2)); }
    public static function lintang(float $y): float { return rad2deg(2 * atan(exp($y)) - M_PI / 2); }

    /** Tambah tepi 12% lalu lebarkan sisi pendek agar perbandingan bingkai (Mercator) sama dengan kotak peta. */
    private function sesuaikan(array $k, float $rasio): array
    {
        [$x0, $y0, $x1, $y1] = $k;
        $lebar = max(0.5, $x1 - $x0);
        $m0 = self::merc($y0); $m1 = self::merc($y1);
        $tinggi = max(deg2rad(0.5), $m1 - $m0);
        $cx = ($x0 + $x1) / 2; $cm = ($m0 + $m1) / 2;
        $lebarRad = deg2rad($lebar) * 1.24; $tinggi *= 1.24;
        if ($lebarRad / $tinggi > $rasio) $tinggi = $lebarRad / $rasio; else $lebarRad = $tinggi * $rasio;
        $setengah = rad2deg($lebarRad) / 2;
        return [$cx - $setengah, self::lintang($cm - $tinggi / 2), $cx + $setengah, self::lintang($cm + $tinggi / 2)];
    }

    /** Daratan di dalam bingkai: cincin datar [lon, lat, lon, lat, …], dipotong dan disederhanakan. */
    public function daratan(array $k): array
    {
        $tepi = 0.02 * ($k[2] - $k[0]);
        $kk = [$k[0] - $tepi, $k[1] - $tepi, $k[2] + $tepi, $k[3] + $tepi];
        $toleransi = ($k[2] - $k[0]) / 1400;
        $hasil = [];
        $jumlah = 0;
        for ($tx = (int) floor($kk[0] / self::UBIN); $tx <= (int) floor($kk[2] / self::UBIN); $tx++) {
            for ($ty = (int) floor($kk[1] / self::UBIN); $ty <= (int) floor($kk[3] / self::UBIN); $ty++) {
                $berkas = resource_path('peta/ne10m/' . ($tx * self::UBIN) . '_' . ($ty * self::UBIN) . '.json');
                if (!is_file($berkas)) continue;
                foreach (json_decode(file_get_contents($berkas), true) as $datar) {
                    $ring = [];
                    for ($i = 0; $i + 1 < count($datar); $i += 2) $ring[] = [$datar[$i], $datar[$i + 1]];
                    $ring = $this->potong($ring, $kk);
                    if (count($ring) < 3) continue;
                    $ring = $this->sederhana($ring, $toleransi);
                    if (count($ring) < 3) continue;
                    $jumlah += count($ring);
                    $hasil[] = array_merge(...array_map(fn($p) => [round($p[0], 4), round($p[1], 4)], $ring));
                }
            }
        }
        // Batas ukuran naskah: cincin terkecil dibuang lebih dulu
        if ($jumlah > self::MAKS_TITIK) {
            usort($hasil, fn($a, $b) => count($b) <=> count($a));
            $n = 0;
            $hasil = array_values(array_filter($hasil, function ($r) use (&$n) { $n += count($r) / 2; return $n <= self::MAKS_TITIK; }));
        }
        return $hasil;
    }

    /** Sutherland–Hodgman terhadap persegi panjang. */
    private function potong(array $t, array $k): array
    {
        $sisi = [
            [fn($p) => $p[0] >= $k[0], fn($a, $b) => [$k[0], $a[1] + ($b[1] - $a[1]) * ($k[0] - $a[0]) / ($b[0] - $a[0])]],
            [fn($p) => $p[0] <= $k[2], fn($a, $b) => [$k[2], $a[1] + ($b[1] - $a[1]) * ($k[2] - $a[0]) / ($b[0] - $a[0])]],
            [fn($p) => $p[1] >= $k[1], fn($a, $b) => [$a[0] + ($b[0] - $a[0]) * ($k[1] - $a[1]) / ($b[1] - $a[1]), $k[1]]],
            [fn($p) => $p[1] <= $k[3], fn($a, $b) => [$a[0] + ($b[0] - $a[0]) * ($k[3] - $a[1]) / ($b[1] - $a[1]), $k[3]]],
        ];
        foreach ($sisi as [$dalam, $iris]) {
            if (!$t) break;
            $baru = [];
            $n = count($t);
            for ($i = 0; $i < $n; $i++) {
                $a = $t[($i - 1 + $n) % $n]; $b = $t[$i];
                $da = $dalam($a); $db = $dalam($b);
                if ($db) { if (!$da) $baru[] = $iris($a, $b); $baru[] = $b; }
                elseif ($da) $baru[] = $iris($a, $b);
            }
            $t = $baru;
        }
        return $t;
    }

    /** Douglas–Peucker (iteratif). */
    private function sederhana(array $p, float $tol): array
    {
        $n = count($p);
        if ($n < 5 || $tol <= 0) return $p;
        $simpan = array_fill(0, $n, false);
        $simpan[0] = $simpan[$n - 1] = true;
        $tumpuk = [[0, $n - 1]];
        $tol2 = $tol * $tol;
        while ($tumpuk) {
            [$a, $b] = array_pop($tumpuk);
            $maks = 0; $idx = -1;
            [$ax, $ay] = $p[$a]; [$bx, $by] = $p[$b];
            $dx = $bx - $ax; $dy = $by - $ay; $pj = $dx * $dx + $dy * $dy;
            for ($i = $a + 1; $i < $b; $i++) {
                [$x, $y] = $p[$i];
                if ($pj == 0) $d = ($x - $ax) ** 2 + ($y - $ay) ** 2;
                else {
                    $u = max(0, min(1, (($x - $ax) * $dx + ($y - $ay) * $dy) / $pj));
                    $d = ($x - $ax - $u * $dx) ** 2 + ($y - $ay - $u * $dy) ** 2;
                }
                if ($d > $maks) { $maks = $d; $idx = $i; }
            }
            if ($maks > $tol2) { $simpan[$idx] = true; $tumpuk[] = [$a, $idx]; $tumpuk[] = [$idx, $b]; }
        }
        $hasil = [];
        foreach ($p as $i => $q) if ($simpan[$i]) $hasil[] = $q;
        return $hasil;
    }
}

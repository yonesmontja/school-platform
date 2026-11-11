<?php

namespace App\Services;

use SplPriorityQueue;

/**
 * Rute kapal di adegan peta tanpa memotong daratan: daratan dalam bingkai dirasterisasi ke kisi (proyeksi Mercator),
 * jalur dicari dengan Dijkstra 8 arah lewat sel laut (sel dekat pantai lebih mahal agar jalur di tengah selat),
 * lalu dihaluskan dengan "tarik tali" (titik dibuang selama garis penggantinya tetap di laut).
 * Titik di darat (mis. pangkalan di tepi pantai) digeser ke sel laut terdekat. Tujuan di luar bingkai (mis. samudra)
 * menjadi sel tepi bingkai yang terjangkau lewat laut dengan jumlah jarak tempuh + jarak lurus ke tujuan terkecil.
 */
class RuteLaut
{
    private const SISI = 220; // jumlah sel pada sisi terpanjang
    private int $w;
    private int $h;
    private float $x0;
    private float $m1;
    private float $dx;
    private float $dm;
    /** @var string kisi daratan: "1" darat, "0" laut */
    private string $darat;
    /** @var array<int,int> biaya tambahan sel dekat pantai */
    private array $dekat = [];

    public function __construct(private array $kotak, array $daratan)
    {
        [$x0, $y0, $x1, $y1] = $kotak;
        $m0 = PetaService::merc($y0); $m1 = PetaService::merc($y1);
        $lebar = $x1 - $x0; $tinggi = rad2deg($m1 - $m0);
        if ($lebar >= $tinggi) { $this->w = self::SISI; $this->h = max(20, (int) round(self::SISI * $tinggi / $lebar)); }
        else { $this->h = self::SISI; $this->w = max(20, (int) round(self::SISI * $lebar / $tinggi)); }
        $this->x0 = $x0; $this->m1 = $m1;
        $this->dx = $lebar / $this->w;
        $this->dm = ($m1 - $m0) / $this->h;
        $this->rasterisasi($daratan);
        $this->hitungDekatPantai();
    }

    /**
     * @param array<array{0: float, 1: float}> $titik [lon, lat] berurutan
     * @return array<array{0: float, 1: float}> rute [lon, lat]
     */
    public function cari(array $titik): array
    {
        $sel = [];
        $n = count($titik);
        foreach ($titik as $i => [$lon, $lat]) {
            $c = $this->keSel($lon, $lat);
            $dalam = $c !== null;
            if (!$dalam && $i === $n - 1 && $sel) { $sel[] = ['arah' => [$lon, $lat]]; continue; }
            if (!$dalam) $c = $this->keSelTerjepit($lon, $lat);
            $sel[] = ['sel' => $this->lautTerdekat($c)];
        }
        $jalur = [];
        for ($i = 1; $i < count($sel); $i++) {
            $dari = $sel[$i - 1]['sel'];
            $bagian = isset($sel[$i]['arah']) ? $this->keArah($dari, $sel[$i]['arah']) : $this->dijkstra($dari, fn($c) => $c === $sel[$i]['sel']);
            if (!$bagian) $bagian = [$dari, $sel[$i]['sel'] ?? $dari]; // tidak terjangkau lewat laut: garis lurus
            if ($jalur) array_shift($bagian);
            $jalur = array_merge($jalur, $bagian);
        }
        $jalur = $this->tarikTali($jalur);
        return array_map(fn($c) => $this->keLonLat($c), $jalur);
    }

    // ===== Kisi =====

    private function keSel(float $lon, float $lat): ?int
    {
        $gx = (int) floor(($lon - $this->x0) / $this->dx);
        $gy = (int) floor(($this->m1 - PetaService::merc($lat)) / $this->dm);
        return $gx >= 0 && $gx < $this->w && $gy >= 0 && $gy < $this->h ? $gy * $this->w + $gx : null;
    }

    private function keSelTerjepit(float $lon, float $lat): int
    {
        $gx = max(0, min($this->w - 1, (int) floor(($lon - $this->x0) / $this->dx)));
        $gy = max(0, min($this->h - 1, (int) floor(($this->m1 - PetaService::merc($lat)) / $this->dm)));
        return $gy * $this->w + $gx;
    }

    private function keLonLat(int $c): array
    {
        $gx = $c % $this->w; $gy = intdiv($c, $this->w);
        return [round($this->x0 + ($gx + 0.5) * $this->dx, 4), round(PetaService::lintang($this->m1 - ($gy + 0.5) * $this->dm), 4)];
    }

    /** Isi poligon daratan (aturan genap-ganjil, semua cincin sekaligus) per baris kisi. */
    private function rasterisasi(array $daratan): void
    {
        $this->darat = str_repeat('0', $this->w * $this->h);
        $ruas = [];
        foreach ($daratan as $datar) {
            $p = [];
            for ($i = 0; $i + 1 < count($datar); $i += 2) {
                $p[] = [($datar[$i] - $this->x0) / $this->dx, ($this->m1 - PetaService::merc($datar[$i + 1])) / $this->dm];
            }
            $n = count($p);
            for ($i = 0; $i < $n; $i++) {
                $a = $p[$i]; $b = $p[($i + 1) % $n];
                if ($a[1] != $b[1]) $ruas[] = $a[1] < $b[1] ? [$a, $b] : [$b, $a];
            }
        }
        $perBaris = array_fill(0, $this->h, []);
        foreach ($ruas as [$a, $b]) {
            $r0 = max(0, (int) ceil($a[1] - 0.5)); $r1 = min($this->h - 1, (int) floor($b[1] - 0.5));
            for ($r = $r0; $r <= $r1; $r++) {
                $y = $r + 0.5;
                if ($y < $a[1] || $y >= $b[1]) continue;
                $perBaris[$r][] = $a[0] + ($b[0] - $a[0]) * ($y - $a[1]) / ($b[1] - $a[1]);
            }
        }
        foreach ($perBaris as $r => $xs) {
            sort($xs);
            for ($k = 0; $k + 1 < count($xs); $k += 2) {
                $c0 = max(0, (int) ceil($xs[$k] - 0.5)); $c1 = min($this->w - 1, (int) floor($xs[$k + 1] - 0.5));
                for ($c = $c0; $c <= $c1; $c++) $this->darat[$r * $this->w + $c] = '1';
            }
        }
    }

    /** Sel laut berjarak ≤ 3 sel dari daratan diberi biaya tambahan (makin dekat makin mahal). */
    private function hitungDekatPantai(): void
    {
        $jarak = [];
        $antre = [];
        for ($c = 0; $c < $this->w * $this->h; $c++) if ($this->darat[$c] === '1') { $jarak[$c] = 0; $antre[] = $c; }
        for ($k = 0; $k < count($antre); $k++) {
            $c = $antre[$k];
            if ($jarak[$c] >= 3) continue;
            foreach ($this->tetangga($c) as [$t]) {
                if (!isset($jarak[$t])) { $jarak[$t] = $jarak[$c] + 1; $antre[] = $t; }
            }
        }
        foreach ($jarak as $c => $d) if ($d > 0) $this->dekat[$c] = [1 => 3.0, 2 => 1.2, 3 => 0.4][$d];
    }

    /** @return array<array{0: int, 1: float}> [sel, jarak langkah] */
    private function tetangga(int $c): array
    {
        $gx = $c % $this->w; $gy = intdiv($c, $this->w);
        $hasil = [];
        foreach ([[-1, 0, 1], [1, 0, 1], [0, -1, 1], [0, 1, 1], [-1, -1, M_SQRT2], [1, -1, M_SQRT2], [-1, 1, M_SQRT2], [1, 1, M_SQRT2]] as [$ax, $ay, $d]) {
            $x = $gx + $ax; $y = $gy + $ay;
            if ($x >= 0 && $x < $this->w && $y >= 0 && $y < $this->h) $hasil[] = [$y * $this->w + $x, $d];
        }
        return $hasil;
    }

    private function lautTerdekat(int $c): int
    {
        if ($this->darat[$c] === '0') return $c;
        $lihat = [$c => true];
        $antre = [$c];
        for ($k = 0; $k < count($antre) && $k < 40000; $k++) {
            foreach ($this->tetangga($antre[$k]) as [$t]) {
                if (isset($lihat[$t])) continue;
                if ($this->darat[$t] === '0') return $t;
                $lihat[$t] = true;
                $antre[] = $t;
            }
        }
        return $c;
    }

    /**
     * Dijkstra lewat sel laut dari $awal sampai $selesai($sel) bernilai true.
     * $tambahan($sel) memberi biaya akhir (dipakai untuk memilih sel tepi menuju tujuan di luar bingkai).
     * @return int[]|null
     */
    private function dijkstra(int $awal, callable $selesai, ?callable $tambahan = null): ?array
    {
        $jarak = [$awal => 0.0];
        $asal = [];
        $q = new SplPriorityQueue();
        $q->setExtractFlags(SplPriorityQueue::EXTR_BOTH);
        $q->insert($awal, 0);
        $terbaik = null; $nilaiTerbaik = INF;
        while (!$q->isEmpty()) {
            ['data' => $c, 'priority' => $pr] = $q->extract();
            $d = -$pr;
            if ($d > ($jarak[$c] ?? INF) + 1e-9) continue;
            if ($tambahan === null && $selesai($c)) { $terbaik = $c; break; }
            if ($tambahan !== null && $selesai($c)) {
                $nilai = $d + $tambahan($c);
                if ($nilai < $nilaiTerbaik) { $nilaiTerbaik = $nilai; $terbaik = $c; }
            }
            if ($d > $nilaiTerbaik) break;
            foreach ($this->tetangga($c) as [$t, $langkah]) {
                if ($this->darat[$t] === '1') continue;
                $nd = $d + $langkah + ($this->dekat[$t] ?? 0);
                if ($nd < ($jarak[$t] ?? INF)) { $jarak[$t] = $nd; $asal[$t] = $c; $q->insert($t, -$nd); }
            }
        }
        if ($terbaik === null) return null;
        $jalur = [$terbaik];
        while (isset($asal[$jalur[0]])) array_unshift($jalur, $asal[$jalur[0]]);
        return $jalur;
    }

    /** Menuju tempat di luar bingkai: sel laut di tepi bingkai dengan jarak tempuh + jarak lurus ke tujuan terkecil. */
    private function keArah(int $dari, array $tujuan): ?array
    {
        $tx = ($tujuan[0] - $this->x0) / $this->dx;
        $ty = ($this->m1 - PetaService::merc($tujuan[1])) / $this->dm;
        $tepi = fn($c) => ($x = $c % $this->w) <= 1 || $x >= $this->w - 2 || ($y = intdiv($c, $this->w)) <= 1 || $y >= $this->h - 2;
        return $this->dijkstra($dari, $tepi, fn($c) => hypot(($c % $this->w) + 0.5 - $tx, intdiv($c, $this->w) + 0.5 - $ty));
    }

    /** Buang titik antara selama garis penggantinya tidak melewati sel darat. */
    private function tarikTali(array $jalur): array
    {
        if (count($jalur) < 3) return $jalur;
        $hasil = [$jalur[0]];
        $i = 0;
        while ($i < count($jalur) - 1) {
            $j = count($jalur) - 1;
            while ($j > $i + 1 && !$this->garisLaut($jalur[$i], $jalur[$j])) $j--;
            $hasil[] = $jalur[$j];
            $i = $j;
        }
        return $hasil;
    }

    private function garisLaut(int $a, int $b): bool
    {
        $x0 = $a % $this->w; $y0 = intdiv($a, $this->w); $x1 = $b % $this->w; $y1 = intdiv($b, $this->w);
        $n = max(abs($x1 - $x0), abs($y1 - $y0)) * 2;
        for ($k = 1; $k < $n; $k++) {
            $x = (int) round($x0 + ($x1 - $x0) * $k / $n); $y = (int) round($y0 + ($y1 - $y0) * $k / $n);
            $c = $y * $this->w + $x;
            if ($this->darat[$c] === '1' || ($this->dekat[$c] ?? 0) >= 3.0) return false;
        }
        return true;
    }
}

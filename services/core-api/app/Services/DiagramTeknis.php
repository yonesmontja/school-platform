<?php

namespace App\Services;

/**
 * Penyaji diagram Dokumen Teknis: blok ```diagram berisi JSON di berkas Markdown diubah menjadi SVG sebaris,
 * sehingga diagram ikut berubah setiap kali teksnya di repo diubah (tanpa pustaka gambar di browser).
 *
 * Jenis yang didukung:
 * - usecase : aktor kiri/kanan, kasus penggunaan di dalam batas sistem, relasi «include»/«extend».
 * - urutan  : diagram urutan (sequence): peserta, pesan, balasan, catatan, fragmen alt/opt/loop.
 * - alir    : simpul berposisi grid (kotak, bulat, mulai, akhir, keputusan, db, aktor, entitas, catatan,
 *             awan) dan panah antar simpul; dipakai untuk arsitektur, deployment, ERD, activity, dan state.
 *
 * Warna memakai kelas CSS (d-*) agar mengikuti tema terang/gelap halaman.
 */
class DiagramTeknis
{
    private const HURUF = 13;
    private static int $urut = 0;
    private string $id = 'd';

    public static function render(string $json): string
    {
        $spek = json_decode($json, true);
        if (!is_array($spek)) {
            return '<pre class="dt-galat">Diagram tidak valid: ' . e(json_last_error_msg()) . '</pre>';
        }
        $d = new self();
        $d->id = 'dg' . (++self::$urut);
        try {
            [$isi, $w, $h] = match ($spek['jenis'] ?? '') {
                'usecase' => $d->usecase($spek),
                'urutan' => $d->urutan($spek),
                'alir' => $d->alir($spek),
                default => throw new \InvalidArgumentException('jenis diagram tidak dikenal: ' . ($spek['jenis'] ?? '-')),
            };
        } catch (\Throwable $e) {
            return '<pre class="dt-galat">Diagram tidak valid: ' . e($e->getMessage()) . '</pre>';
        }
        $judul = trim(($spek['nomor'] ?? '') !== '' ? 'Gambar ' . $spek['nomor'] . '. ' . ($spek['judul'] ?? '') : ($spek['judul'] ?? ''));
        $idGambar = isset($spek['nomor']) ? ' id="gambar-' . e(str_replace('.', '-', $spek['nomor'])) . '"' : '';
        $svg = sprintf(
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 %d %d" width="%d" role="img" aria-label="%s" class="dt-svg-isi">%s%s</svg>',
            $w, $h, $w, e($judul), $d->defs(), $isi
        );
        return '<figure class="dt-gambar"' . $idGambar . '><div class="dt-svg">' . $svg . '</div>'
            . ($judul !== '' ? '<figcaption>' . e($judul) . '</figcaption>' : '') . '</figure>';
    }

    // ------------------------------------------------------------------ dasar

    private function defs(): string
    {
        $i = $this->id;
        return "<defs>"
            . "<marker id=\"{$i}-p\" viewBox=\"0 0 10 10\" refX=\"9.5\" refY=\"5\" markerWidth=\"8\" markerHeight=\"8\" orient=\"auto-start-reverse\"><path d=\"M0,0 L10,5 L0,10 z\" class=\"d-ujung\"/></marker>"
            . "<marker id=\"{$i}-t\" viewBox=\"0 0 10 10\" refX=\"9.5\" refY=\"5\" markerWidth=\"8\" markerHeight=\"8\" orient=\"auto-start-reverse\"><path d=\"M0,0 L10,5 L0,10\" class=\"d-ujung-terbuka\"/></marker>"
            . "</defs>";
    }

    private static function x(string $s): string
    {
        return htmlspecialchars($s, ENT_QUOTES | ENT_XML1, 'UTF-8');
    }

    /** Pecah teks per kata agar muat sekitar $maks huruf per baris; "\n" memaksa baris baru. */
    private static function baris(string $teks, int $maks): array
    {
        $hasil = [];
        foreach (explode("\n", $teks) as $paragraf) {
            $sekarang = '';
            foreach (preg_split('/\s+/u', trim($paragraf)) as $kata) {
                if ($kata === '') continue;
                $calon = $sekarang === '' ? $kata : "$sekarang $kata";
                if (mb_strlen($calon) > $maks && $sekarang !== '') {
                    $hasil[] = $sekarang;
                    $sekarang = $kata;
                } else {
                    $sekarang = $calon;
                }
            }
            $hasil[] = $sekarang;
        }
        return $hasil;
    }

    private static function maksHuruf(float $lebar, int $ukuran = self::HURUF): int
    {
        return max(6, (int) floor($lebar / ($ukuran * 0.56)));
    }

    /** Teks beberapa baris yang titik tengahnya di ($cx,$cy). */
    private function teks(float $cx, float $cy, array $baris, string $kelas = 'd-teks', int $ukuran = self::HURUF, string $jangkar = 'middle'): string
    {
        $tinggi = $ukuran * 1.25;
        $y0 = $cy - ($tinggi * (count($baris) - 1)) / 2 + $ukuran * 0.35;
        $out = sprintf('<text class="%s" x="%.1f" y="%.1f" font-size="%d" text-anchor="%s">', $kelas, $cx, $y0, $ukuran, $jangkar);
        foreach ($baris as $n => $b) {
            $out .= sprintf('<tspan x="%.1f" dy="%s">%s</tspan>', $cx, $n === 0 ? '0' : number_format($tinggi, 1, '.', ''), self::x($b));
        }
        return $out . '</text>';
    }

    private function garis(array $titik, bool $putus = false, string $panah = 'satu', bool $terbuka = false, string $kelas = 'd-garis'): string
    {
        $d = '';
        foreach ($titik as $n => [$px, $py]) $d .= ($n ? ' L' : 'M') . sprintf('%.1f,%.1f', $px, $py);
        $m = $terbuka ? 't' : 'p';
        $akhir = in_array($panah, ['satu', 'dua'], true) ? " marker-end=\"url(#{$this->id}-{$m})\"" : '';
        $awal = $panah === 'dua' ? " marker-start=\"url(#{$this->id}-{$m})\"" : '';
        return sprintf('<path d="%s" class="%s%s" fill="none"%s%s/>', $d, $kelas, $putus ? ' d-putus' : '', $akhir, $awal);
    }

    /** Label kecil berlatar agar terbaca di atas garis. */
    private function label(float $cx, float $cy, string $teks, int $ukuran = 11): string
    {
        $baris = self::baris($teks, 26);
        $lebar = max(array_map('mb_strlen', $baris)) * $ukuran * 0.58 + 10;
        $tinggi = count($baris) * $ukuran * 1.25 + 4;
        return sprintf('<rect x="%.1f" y="%.1f" width="%.1f" height="%.1f" rx="3" class="d-label-bg"/>', $cx - $lebar / 2, $cy - $tinggi / 2, $lebar, $tinggi)
            . $this->teks($cx, $cy, $baris, 'd-teks-kecil', $ukuran);
    }

    private function aktor(float $cx, float $atas, string $nama): string
    {
        $out = sprintf('<g class="d-aktor"><circle cx="%.1f" cy="%.1f" r="9"/>', $cx, $atas + 9)
            . sprintf('<path d="M%1$.1f,%2$.1f L%1$.1f,%3$.1f M%4$.1f,%5$.1f L%6$.1f,%5$.1f M%1$.1f,%3$.1f L%4$.1f,%7$.1f M%1$.1f,%3$.1f L%6$.1f,%7$.1f"/></g>',
                $cx, $atas + 18, $atas + 40, $cx - 15, $atas + 26, $cx + 15, $atas + 58);
        return $out . $this->teks($cx, $atas + 72 + (count(self::baris($nama, 14)) - 1) * 8, self::baris($nama, 14), 'd-teks d-tebal', 12);
    }

    // ------------------------------------------------------------------ use case

    private function usecase(array $s): array
    {
        $kiri = $s['aktor_kiri'] ?? [];
        $kanan = $s['aktor_kanan'] ?? [];
        $kasus = $s['kasus'] ?? [];
        $idKanan = array_column($kanan, 'id');
        $lebarKasus = $s['lebar_kasus'] ?? 230;
        $tinggiKasus = 44;
        $jarak = 58;

        // Kasus yang hanya dipakai aktor kanan diletakkan di kolom kanan bila ada dua kolom
        $duaKolom = ($s['kolom'] ?? (count($kasus) > 9 ? 2 : 1)) == 2;
        $kol = [[], []];
        foreach ($kasus as $k) {
            $hanyaKanan = $k['aktor'] ?? [] ? !array_diff($k['aktor'], $idKanan) : false;
            $c = $k['kolom'] ?? ($duaKolom ? ($hanyaKanan ? 2 : (count($kol[0]) > count($kol[1]) + 1 ? 2 : 1)) : 1);
            $kol[$c == 2 && $duaKolom ? 1 : 0][] = $k;
        }
        $xBatas1 = 170;
        $lebarBatas = $duaKolom ? $lebarKasus * 2 + 90 : $lebarKasus + 70;
        $xBatas2 = $xBatas1 + $lebarBatas;
        $W = $xBatas2 + ($kanan ? 170 : 40);
        $atas = 50;
        $posisi = [];
        foreach ($kol as $c => $daftar) {
            $cx = $duaKolom ? ($c === 0 ? $xBatas1 + 30 + $lebarKasus / 2 : $xBatas2 - 30 - $lebarKasus / 2) : ($xBatas1 + $xBatas2) / 2;
            foreach ($daftar as $n => $k) $posisi[$k['id']] = [$cx, $atas + 20 + $n * $jarak + $tinggiKasus / 2, $k];
        }
        $bawah = $atas + 20 + max(count($kol[0]), count($kol[1]), 1) * $jarak;
        $H = $bawah + 30;

        $out = sprintf('<rect x="%d" y="%d" width="%d" height="%d" rx="10" class="d-batas"/>', $xBatas1, $atas - 26, $lebarBatas, $bawah - $atas + 26);
        $out .= $this->teks(($xBatas1 + $xBatas2) / 2, $atas - 10, [$s['sistem'] ?? 'Sistem'], 'd-teks d-tebal', 13);

        // Aktor: tinggi rata-rata kasusnya, lalu dijauhkan agar tidak bertumpuk
        $tempatAktor = function (array $daftar, float $x) use ($posisi, $H) {
            $ys = [];
            foreach ($daftar as $a) {
                $terkait = array_filter($posisi, fn($p) => in_array($a['id'], $p[2]['aktor'] ?? [], true));
                $ys[$a['id']] = $terkait ? array_sum(array_map(fn($p) => $p[1], $terkait)) / count($terkait) - 40 : 60;
            }
            asort($ys);
            $hasil = [];
            $min = 20;
            foreach ($ys as $id => $y) {
                $y = max($y, $min);
                $hasil[$id] = [$x, $y];
                $min = $y + 100;
            }
            return $hasil;
        };
        $ak = $tempatAktor($kiri, 80) + $tempatAktor($kanan, $W - 80);
        $semua = array_merge($kiri, $kanan);
        foreach ($ak as [$x, $y]) $H = max($H, $y + 100);

        // Garis aktor → kasus
        $garis = '';
        foreach ($posisi as [$cx, $cy, $k]) {
            foreach ($k['aktor'] ?? [] as $idA) {
                if (!isset($ak[$idA])) continue;
                [$ax, $ay] = $ak[$idA];
                $dari = [$ax + ($ax < $cx ? 18 : -18), $ay + 30];
                // Ke ujung kiri/kanan elips agar garis tidak melintasi kasus lain
                $ke = [$cx + ($ax < $cx ? -1 : 1) * ($lebarKasus / 2 - 1), $cy];
                $garis .= $this->garis([$dari, $ke], false, 'tanpa', false, 'd-garis d-tipis');
            }
        }
        // Relasi include/extend antarkasus (label sekali per tujuan & jenis agar tidak bertumpuk)
        $berlabel = [];
        foreach ($s['relasi'] ?? [] as $r) {
            if (!isset($posisi[$r['dari']], $posisi[$r['ke']])) continue;
            [$x1, $y1] = $posisi[$r['dari']];
            [$x2, $y2] = $posisi[$r['ke']];
            $kunciLabel = $r['ke'] . '|' . ($r['jenis'] ?? 'include');
            $label = isset($berlabel[$kunciLabel]) ? '' : '«' . ($r['jenis'] ?? 'include') . '»';
            $berlabel[$kunciLabel] = true;
            if (abs($x1 - $x2) < 1) {
                // satu kolom: lengkung di sisi kanan
                $sx = $x1 + $lebarKasus / 2;
                $tengah = ($y1 + $y2) / 2;
                $tonjol = $sx + 36 + abs($y2 - $y1) * 0.08;
                $garis .= sprintf('<path d="M%.1f,%.1f Q%.1f,%.1f %.1f,%.1f" class="d-garis d-putus" fill="none" marker-end="url(#%s-t)"/>', $sx - 6, $y1 + 8, $tonjol, $tengah, $sx - 6, $y2 - 8, $this->id);
                if ($label !== '') $garis .= $this->label($tonjol - 10, $tengah, $label, 10);
            } else {
                $a = $this->tepiElips($x1, $y1, $lebarKasus / 2, $tinggiKasus / 2, $x2, $y2);
                $b = $this->tepiElips($x2, $y2, $lebarKasus / 2, $tinggiKasus / 2, $x1, $y1);
                $garis .= $this->garis([$a, $b], true, 'satu', true);
                if ($label !== '') $garis .= $this->label(($a[0] + $b[0]) / 2, ($a[1] + $b[1]) / 2, $label, 10);
            }
        }
        $out .= $garis;
        foreach ($posisi as [$cx, $cy, $k]) {
            $out .= sprintf('<ellipse cx="%.1f" cy="%.1f" rx="%.1f" ry="%.1f" class="d-kasus%s"/>', $cx, $cy, $lebarKasus / 2, $tinggiKasus / 2, !empty($k['utama']) ? ' d-utama' : '');
            $out .= $this->teks($cx, $cy, self::baris($k['nama'], self::maksHuruf($lebarKasus - 34, 12)), 'd-teks', 12);
        }
        foreach ($semua as $a) {
            if (!isset($ak[$a['id']])) continue;
            [$x, $y] = $ak[$a['id']];
            $out .= $this->aktor($x, $y, $a['nama']);
        }
        return [$out, (int) $W, (int) $H];
    }

    private function tepiElips(float $cx, float $cy, float $a, float $b, float $tx, float $ty): array
    {
        $dx = $tx - $cx;
        $dy = $ty - $cy;
        if (abs($dx) < 0.01 && abs($dy) < 0.01) return [$cx, $cy];
        $t = 1 / sqrt(($dx / $a) ** 2 + ($dy / $b) ** 2);
        return [$cx + $dx * $t, $cy + $dy * $t];
    }

    // ------------------------------------------------------------------ urutan (sequence)

    private function urutan(array $s): array
    {
        $peserta = $s['peserta'] ?? [];
        $jarak = $s['jarak'] ?? 175;
        $kiri = 30 + $jarak / 2;
        $xs = [];
        foreach ($peserta as $i => $p) $xs[$i] = $kiri + $i * $jarak;
        $W = (int) ($kiri + (count($peserta) - 1) * $jarak + $jarak / 2 + 30);
        $out = '';
        $y = 80;
        $isi = '';
        $tumpukan = [];

        foreach ($s['pesan'] ?? [] as $p) {
            if (isset($p['mulai'])) {
                $tumpukan[] = ['y' => $y, 'jenis' => $p['mulai'], 'teks' => $p['teks'] ?? '', 'lain' => []];
                $y += 34;
                continue;
            }
            if (isset($p['lain'])) {
                if ($tumpukan) $tumpukan[count($tumpukan) - 1]['lain'][] = ['y' => $y, 'teks' => $p['lain']];
                $y += 30;
                continue;
            }
            if (!empty($p['selesai'])) {
                $f = array_pop($tumpukan);
                if (!$f) continue;
                $ind = count($tumpukan) * 8;
                $x1 = 14 + $ind;
                $x2 = $W - 14 - $ind;
                $kotak = sprintf('<rect x="%.1f" y="%.1f" width="%.1f" height="%.1f" class="d-fragmen"/>', $x1, $f['y'], $x2 - $x1, $y - $f['y'] + 6);
                $tab = mb_strlen($f['jenis']) * 7.5 + 16;
                $kotak .= sprintf('<path d="M%.1f,%.1f h%.1f v14 l-7,7 h%.1f z" class="d-fragmen-tab"/>', $x1, $f['y'], $tab, -$tab + 7);
                $kotak .= $this->teks($x1 + 8, $f['y'] + 11, [$f['jenis']], 'd-teks d-tebal', 11, 'start');
                if ($f['teks'] !== '') $kotak .= $this->teks($x1 + $tab + 8, $f['y'] + 11, ['[' . $f['teks'] . ']'], 'd-teks-kecil', 11, 'start');
                foreach ($f['lain'] as $l) {
                    $kotak .= sprintf('<line x1="%.1f" y1="%.1f" x2="%.1f" y2="%.1f" class="d-garis d-putus d-tipis"/>', $x1, $l['y'], $x2, $l['y']);
                    $kotak .= $this->teks($x1 + 8, $l['y'] + 12, ['[' . $l['teks'] . ']'], 'd-teks-kecil', 11, 'start');
                }
                $isi = $kotak . $isi;
                $y += 16;
                continue;
            }
            if (isset($p['catatan'])) {
                $di = (array) ($p['di'] ?? [0]);
                $xa = $xs[min($di)] - 60;
                $xb = $xs[max($di)] + 60;
                $baris = self::baris($p['catatan'], self::maksHuruf($xb - $xa - 16, 11));
                $t = count($baris) * 14 + 12;
                $isi .= sprintf('<rect x="%.1f" y="%.1f" width="%.1f" height="%.1f" class="d-catatan"/>', $xa, $y, $xb - $xa, $t);
                $isi .= $this->teks(($xa + $xb) / 2, $y + $t / 2, $baris, 'd-teks-kecil', 11);
                $y += $t + 14;
                continue;
            }
            $a = $p['dari'];
            $b = $p['ke'];
            $balas = !empty($p['balas']);
            if ($a === $b) {
                $x = $xs[$a];
                $baris = self::baris($p['teks'] ?? '', 30);
                $y += (count($baris) - 1) * 13;
                $isi .= $this->teks($x + 10, $y - 6 - (count($baris) - 1) * 6.5, $baris, 'd-teks-kecil', 11, 'start');
                $isi .= sprintf('<path d="M%.1f,%.1f h34 v20 h-32" class="d-garis" fill="none" marker-end="url(#%s-p)"/>', $x, $y + 2, $this->id);
                $y += 40;
                continue;
            }
            $x1 = $xs[$a];
            $x2 = $xs[$b];
            $baris = self::baris($p['teks'] ?? '', self::maksHuruf(max(abs($x2 - $x1) - 16, 140), 11));
            $y += 8 + (count($baris) - 1) * 13;
            $isi .= $this->teks(($x1 + $x2) / 2, $y - 9 - (count($baris) - 1) * 6.5, $baris, 'd-teks-kecil', 11);
            $isi .= $this->garis([[$x1, $y], [$x2 + ($x2 > $x1 ? -2 : 2), $y]], $balas, 'satu', $balas);
            $y += 36;
        }
        $H = (int) $y + 20;
        foreach ($peserta as $i => $nama) {
            $x = $xs[$i];
            $out .= sprintf('<line x1="%.1f" y1="56" x2="%.1f" y2="%.1f" class="d-garis d-putus d-tipis"/>', $x, $x, $H - 10);
            $baris = self::baris($nama, self::maksHuruf($jarak - 30, 12));
            $tb = max(38, count($baris) * 15 + 10);
            $out .= sprintf('<rect x="%.1f" y="%.1f" width="%.1f" height="%.1f" rx="6" class="d-kotak d-utama"/>', $x - $jarak / 2 + 12, 56 - $tb, $jarak - 24, $tb);
            $out .= $this->teks($x, 56 - $tb / 2, $baris, 'd-teks d-tebal', 12);
        }
        $offset = 0;
        foreach ($peserta as $i => $nama) $offset = max($offset, count(self::baris($nama, self::maksHuruf($jarak - 30, 12))) * 15 + 10 - 38);
        return ['<g transform="translate(0,' . (int) $offset . ')">' . $out . $isi . '</g>', $W, $H + (int) $offset];
    }

    // ------------------------------------------------------------------ alir (arsitektur, ERD, activity, state)

    private function alir(array $s): array
    {
        $kw = $s['kolom_lebar'] ?? 180;
        $bh = $s['baris_tinggi'] ?? 96;
        $pad = 24;
        $simpul = [];
        foreach ($s['simpul'] ?? [] as $n) {
            $bentuk = $n['bentuk'] ?? 'kotak';
            [$w, $h] = match ($bentuk) {
                'mulai' => [22, 22],
                'akhir' => [26, 26],
                'keputusan' => [$n['w'] ?? 120, $n['h'] ?? 64],
                'aktor' => [40, 84],
                'entitas' => [$n['w'] ?? 170, 36 + 17 * count($n['kolom'] ?? [])],
                default => [$n['w'] ?? 150, $n['h'] ?? 0],
            };
            if ($h === 0) {
                $baris = self::baris($n['teks'] ?? '', self::maksHuruf($w - 20, 12));
                $sub = isset($n['sub']) ? count(self::baris($n['sub'], self::maksHuruf($w - 20, 10))) * 12.5 + 2 : 0;
                $h = (int) max(46, count($baris) * 15 + 16 + $sub);
            }
            $cx = $pad + $n['x'] * $kw + $kw / 2;
            $cy = $pad + $n['y'] * $bh + $bh / 2;
            $simpul[$n['id']] = ['cx' => $cx, 'cy' => $cy, 'w' => $w, 'h' => $h, 'n' => $n, 'bentuk' => $bentuk];
        }
        $maxX = 0;
        $maxY = 0;
        $out = '';
        foreach ($s['kelompok'] ?? [] as $g) {
            $x1 = $pad + $g['x1'] * $kw + 6;
            $y1 = $pad + $g['y1'] * $bh + 4;
            $x2 = $pad + ($g['x2'] + 1) * $kw - 6;
            $y2 = $pad + ($g['y2'] + 1) * $bh - 4;
            $maxX = max($maxX, $x2);
            $maxY = max($maxY, $y2);
            $out .= sprintf('<rect x="%.1f" y="%.1f" width="%.1f" height="%.1f" rx="10" class="d-kelompok%s"/>', $x1, $y1, $x2 - $x1, $y2 - $y1, !empty($g['gaya']) ? ' d-' . $g['gaya'] : '');
            $out .= $this->teks($x1 + 10, $y1 + 14, [$g['teks'] ?? ''], 'd-teks-kelompok', 11, 'start');
        }
        foreach ($simpul as $p) {
            $maxX = max($maxX, $p['cx'] + $p['w'] / 2);
            $maxY = max($maxY, $p['cy'] + $p['h'] / 2 + ($p['bentuk'] === 'aktor' ? 10 : 0));
        }

        $garis = '';
        $label = '';
        foreach ($s['panah'] ?? [] as $e) {
            if (!isset($simpul[$e['dari']], $simpul[$e['ke']])) continue;
            $A = $simpul[$e['dari']];
            $B = $simpul[$e['ke']];
            $tengah = [];
            foreach ($e['lewat'] ?? [] as [$gx, $gy]) $tengah[] = [$pad + $gx * $kw + $kw / 2, $pad + $gy * $bh + $bh / 2];
            if (!$tengah && !empty($e['siku'])) {
                $tengah[] = $e['siku'] === 'v' ? [$A['cx'], $B['cy']] : [$B['cx'], $A['cy']];
            }
            $titik = [[$A['cx'], $A['cy']], ...$tengah, [$B['cx'], $B['cy']]];
            $titik[0] = $this->tepi($A, $titik[1][0], $titik[1][1]);
            $k = count($titik) - 1;
            $titik[$k] = $this->tepi($B, $titik[$k - 1][0], $titik[$k - 1][1]);
            foreach ($titik as [$tx, $ty]) {
                $maxX = max($maxX, $tx + 12);
                $maxY = max($maxY, $ty + 12);
            }
            $garis .= $this->garis($titik, !empty($e['putus']), $e['panah'] ?? 'satu', !empty($e['putus']));
            if (!empty($e['teks'])) {
                $i = intdiv(count($titik) - 1, 2);
                [$lx, $ly] = count($titik) % 2 === 1 && count($titik) > 2 ? $titik[$i] : [($titik[$i][0] + $titik[$i + 1][0]) / 2, ($titik[$i][1] + $titik[$i + 1][1]) / 2];
                $label .= $this->label($lx, $ly, $e['teks']);
            }
            if (!empty($e['kardinal'])) {
                [$ka, $kb] = $e['kardinal'];
                $label .= $this->kardinal($titik[0], $titik[1], $ka) . $this->kardinal($titik[$k], $titik[$k - 1], $kb);
            }
        }
        $out .= $garis;
        foreach ($simpul as $p) $out .= $this->simpul($p);
        $out .= $label;
        return [$out, (int) ($maxX + $pad), (int) ($maxY + $pad)];
    }

    private function kardinal(array $ujung, array $arah, string $teks): string
    {
        $dx = $arah[0] - $ujung[0];
        $dy = $arah[1] - $ujung[1];
        $p = max(sqrt($dx * $dx + $dy * $dy), 1);
        $x = $ujung[0] + $dx / $p * 14 + ($dy / $p) * 9;
        $y = $ujung[1] + $dy / $p * 14 - ($dx / $p) * 9;
        return $this->teks($x, $y, [$teks], 'd-teks-kecil d-tebal', 11);
    }

    /** Titik pada tepi simpul ke arah ($tx,$ty). */
    private function tepi(array $p, float $tx, float $ty): array
    {
        $dx = $tx - $p['cx'];
        $dy = $ty - $p['cy'];
        if (abs($dx) < 0.01 && abs($dy) < 0.01) return [$p['cx'], $p['cy']];
        $hw = $p['w'] / 2;
        $hh = $p['h'] / 2;
        if (in_array($p['bentuk'], ['mulai', 'akhir'], true)) {
            $r = $hw;
            $len = sqrt($dx * $dx + $dy * $dy);
            return [$p['cx'] + $dx / $len * $r, $p['cy'] + $dy / $len * $r];
        }
        if ($p['bentuk'] === 'keputusan') {
            $t = 1 / (abs($dx) / $hw + abs($dy) / $hh);
        } else {
            $t = min(abs($dx) > 0.01 ? $hw / abs($dx) : INF, abs($dy) > 0.01 ? $hh / abs($dy) : INF);
        }
        return [$p['cx'] + $dx * $t, $p['cy'] + $dy * $t];
    }

    private function simpul(array $p): string
    {
        ['cx' => $cx, 'cy' => $cy, 'w' => $w, 'h' => $h, 'n' => $n] = $p;
        $x = $cx - $w / 2;
        $y = $cy - $h / 2;
        $gaya = !empty($n['gaya']) ? ' d-' . $n['gaya'] : '';
        $teks = $n['teks'] ?? '';
        $isiTeks = function (float $lebar) use ($cx, $cy, $teks, $n) {
            $baris = self::baris($teks, self::maksHuruf($lebar, 12));
            if (!isset($n['sub'])) return $this->teks($cx, $cy, $baris, 'd-teks d-tebal', 12);
            $sub = self::baris($n['sub'], self::maksHuruf($lebar, 10));
            $tinggi = count($baris) * 15 + count($sub) * 12.5;
            $y0 = $cy - $tinggi / 2;
            return $this->teks($cx, $y0 + count($baris) * 7.5, $baris, 'd-teks d-tebal', 12)
                . $this->teks($cx, $y0 + count($baris) * 15 + count($sub) * 6.25 + 2, $sub, 'd-teks-kecil', 10);
        };
        switch ($p['bentuk']) {
            case 'mulai':
                return sprintf('<circle cx="%.1f" cy="%.1f" r="11" class="d-mulai"/>', $cx, $cy);
            case 'akhir':
                return sprintf('<circle cx="%.1f" cy="%.1f" r="13" class="d-kotak"/><circle cx="%.1f" cy="%.1f" r="8" class="d-mulai"/>', $cx, $cy, $cx, $cy);
            case 'keputusan':
                return sprintf('<path d="M%.1f,%.1f L%.1f,%.1f L%.1f,%.1f L%.1f,%.1f z" class="d-kotak d-keputusan%s"/>', $cx, $y, $x + $w, $cy, $cx, $y + $h, $x, $cy, $gaya)
                    . $this->teks($cx, $cy, self::baris($teks, self::maksHuruf($w * 0.6, 11)), 'd-teks', 11);
            case 'bulat':
                return sprintf('<rect x="%.1f" y="%.1f" width="%.1f" height="%.1f" rx="%.1f" class="d-kotak%s"/>', $x, $y, $w, $h, $h / 2, $gaya) . $isiTeks($w - 24);
            case 'db':
                $e = 9;
                return sprintf('<path d="M%1$.1f,%2$.1f a%3$.1f,%4$.1f 0 0,1 %5$.1f,0 v%6$.1f a%3$.1f,%4$.1f 0 0,1 -%5$.1f,0 z" class="d-kotak%7$s"/><path d="M%1$.1f,%2$.1f a%3$.1f,%4$.1f 0 0,0 %5$.1f,0" class="d-garis" fill="none"/>',
                    $x, $y + $e, $w / 2, $e, $w, $h - 2 * $e, $gaya) . $isiTeks($w - 20);
            case 'aktor':
                return $this->aktor($cx, $y, $teks);
            case 'catatan':
                return sprintf('<path d="M%.1f,%.1f h%.1f l12,12 v%.1f h-%.1f z" class="d-catatan"/>', $x, $y, $w - 12, $h - 12, $w)
                    . $this->teks($cx, $cy, self::baris($teks, self::maksHuruf($w - 20, 11)), 'd-teks-kecil', 11);
            case 'awan':
                return sprintf('<rect x="%.1f" y="%.1f" width="%.1f" height="%.1f" rx="22" class="d-kotak d-awan%s"/>', $x, $y, $w, $h, $gaya) . $isiTeks($w - 24);
            case 'entitas':
                $out = sprintf('<rect x="%.1f" y="%.1f" width="%.1f" height="%.1f" rx="4" class="d-kotak%s"/>', $x, $y, $w, $h, $gaya);
                $out .= sprintf('<rect x="%.1f" y="%.1f" width="%.1f" height="24" rx="4" class="d-entitas-kepala"/>', $x, $y, $w);
                $out .= $this->teks($cx, $y + 12, [$teks], 'd-teks d-tebal d-teks-kepala', 12);
                foreach ($n['kolom'] ?? [] as $i => $kolom) {
                    $out .= $this->teks($x + 8, $y + 38 + $i * 17, [$kolom], 'd-teks-kecil d-mono', 11, 'start');
                }
                return $out;
            default:
                return sprintf('<rect x="%.1f" y="%.1f" width="%.1f" height="%.1f" rx="7" class="d-kotak%s"/>', $x, $y, $w, $h, $gaya) . $isiTeks($w - 20);
        }
    }
}

<?php

namespace App\Services;

use App\Models\BankSoal;
use Illuminate\Validation\ValidationException;

/**
 * Aturan isi & kunci tiap bentuk soal, dipakai untuk soal buatan guru, draf AI, maupun hasil impor:
 * - PG           isi {pilihan: [3–5 teks]}          kunci {jawaban: indeks}
 * - PG_KOMPLEKS  isi {pilihan: [3–6 teks]}          kunci {jawaban: [indeks, ...]} (minimal 2 benar)
 * - BENAR_SALAH  isi {pernyataan: [1–8 teks]}       kunci {jawaban: [true/false, ...]}
 * - ISIAN        isi {}                             kunci {jawaban: [jawaban yang diterima, ...]}
 * - URAIAN       isi {}                             kunci {jawaban: contoh jawaban} + rubrik
 * - MENJODOHKAN  isi {pasangan: [{kiri, kanan}, ...]} (2–8 pasangan; urutan diacak saat ditampilkan)
 * - MENGURUTKAN  isi {urutan: [teks, ...]} dalam urutan benar (2–8 langkah)
 * - LENGKAPI_GAMBAR isi {bank_kata: [teks, ...]} (opsional, termasuk pengecoh)
 *                kunci {jawaban: [[jawaban diterima untuk bagian 1, ...], ...]} (1–10 bagian bernomor pada gambar)
 * - MEMBACA_NYARING isi {teks: bacaan}                kunci {} + rubrik (kelancaran, lafal, intonasi); dinilai guru
 *                dari rekaman suara siswa (tes online) atau langsung di kelas
 */
class BankSoalService
{
    /** @return array [isi, kunci] yang sudah dibersihkan */
    public static function normalisasi(string $bentuk, mixed $isi, mixed $kunci): array
    {
        $isi = is_array($isi) ? $isi : [];
        $kunci = is_array($kunci) ? $kunci : [];
        $teks = fn($v) => trim((string) $v);
        $daftar = fn($v) => array_values(array_filter(array_map($teks, is_array($v) ? $v : []), fn($t) => $t !== ''));

        switch ($bentuk) {
            case 'PG':
            case 'PG_KOMPLEKS':
                $pilihan = $daftar($isi['pilihan'] ?? []);
                $maks = $bentuk === 'PG' ? 5 : 6;
                if (count($pilihan) < 3 || count($pilihan) > $maks) self::gagal("Pilihan jawaban harus 3–{$maks}.");
                if ($bentuk === 'PG') {
                    $j = $kunci['jawaban'] ?? null;
                    if (!is_numeric($j) || !isset($pilihan[(int) $j])) self::gagal('Tentukan satu pilihan yang benar.');
                    return [['pilihan' => $pilihan], ['jawaban' => (int) $j]];
                }
                $j = array_values(array_unique(array_map('intval', array_filter((array) ($kunci['jawaban'] ?? []), 'is_numeric'))));
                $j = array_values(array_filter($j, fn($i) => isset($pilihan[$i])));
                sort($j);
                if (count($j) < 2) self::gagal('Pilihan ganda kompleks perlu minimal 2 jawaban benar.');
                return [['pilihan' => $pilihan], ['jawaban' => $j]];

            case 'BENAR_SALAH':
                $pernyataan = $daftar($isi['pernyataan'] ?? []);
                $j = array_values((array) ($kunci['jawaban'] ?? []));
                if (count($pernyataan) < 1 || count($pernyataan) > 8) self::gagal('Isi 1–8 pernyataan.');
                if (count($j) !== count($pernyataan)) self::gagal('Tentukan Benar/Salah untuk setiap pernyataan.');
                return [['pernyataan' => $pernyataan], ['jawaban' => array_map(fn($v) => filter_var($v, FILTER_VALIDATE_BOOLEAN), $j)]];

            case 'ISIAN':
                $j = $daftar($kunci['jawaban'] ?? []);
                if (!$j) self::gagal('Isi minimal satu jawaban yang diterima.');
                return [[], ['jawaban' => $j]];

            case 'URAIAN':
                return [[], ['jawaban' => $teks($kunci['jawaban'] ?? '')]];

            case 'MENJODOHKAN':
                $pasangan = array_values(array_filter(array_map(
                    fn($p) => ['kiri' => $teks($p['kiri'] ?? ''), 'kanan' => $teks($p['kanan'] ?? '')],
                    is_array($isi['pasangan'] ?? null) ? $isi['pasangan'] : []
                ), fn($p) => $p['kiri'] !== '' && $p['kanan'] !== ''));
                if (count($pasangan) < 2 || count($pasangan) > 8) self::gagal('Isi 2–8 pasangan.');
                return [['pasangan' => $pasangan], []];

            case 'MENGURUTKAN':
                $urutan = $daftar($isi['urutan'] ?? []);
                if (count($urutan) < 2 || count($urutan) > 8) self::gagal('Isi 2–8 langkah dalam urutan yang benar.');
                return [['urutan' => $urutan], []];

            case 'MEMBACA_NYARING':
                $bacaan = trim((string) ($isi['teks'] ?? ''));
                if (mb_strlen($bacaan) < 10) self::gagal('Isi teks bacaan yang dibaca nyaring siswa.');
                if (mb_strlen($bacaan) > 3000) self::gagal('Teks bacaan maksimal 3000 karakter.');
                return [['teks' => $bacaan], []];

            case 'LENGKAPI_GAMBAR':
                // Setiap bagian: daftar jawaban yang diterima (teks "a / b" juga diterima)
                $bagian = array_map(fn($b) => $daftar(is_array($b) ? $b : preg_split('#\s*/\s*#', (string) $b)), (array) ($kunci['jawaban'] ?? []));
                if (count($bagian) < 1 || count($bagian) > 10) self::gagal('Isi 1–10 bagian gambar yang dilengkapi.');
                if (array_filter($bagian, fn($b) => !$b)) self::gagal('Setiap bagian gambar perlu jawaban yang diterima.');
                $bank = array_slice($daftar($isi['bank_kata'] ?? []), 0, 15);
                foreach ($bagian as $b) {
                    if ($bank && !array_intersect(array_map('mb_strtolower', $b), array_map('mb_strtolower', $bank))) {
                        self::gagal('Setiap jawaban harus ada di bank kata (atau kosongkan bank kata).');
                    }
                }
                return [$bank ? ['bank_kata' => $bank] : [], ['jawaban' => $bagian]];
        }
        self::gagal('Bentuk soal tidak dikenal.');
    }

    private static function gagal(string $pesan): never
    {
        throw ValidationException::withMessages(['isi' => $pesan]);
    }

    /** Skor maksimal bawaan: banyaknya bagian yang dinilai (uraian ditentukan guru). */
    public static function skorBawaan(string $bentuk, array $isi, array $kunci = []): int
    {
        return match ($bentuk) {
            'BENAR_SALAH' => count($isi['pernyataan'] ?? []) ?: 1,
            'MENJODOHKAN' => count($isi['pasangan'] ?? []) ?: 1,
            'LENGKAPI_GAMBAR' => count($kunci['jawaban'] ?? []) ?: 1,
            'URAIAN', 'MEMBACA_NYARING' => 4,
            default => 1,
        };
    }

    private const SVG_TAG = ['svg', 'g', 'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'text', 'tspan', 'defs', 'marker', 'title', 'desc', 'pattern', 'clippath', 'use'];
    private const SVG_ATTR = [
        'viewbox', 'width', 'height', 'xmlns', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'r', 'rx', 'ry', 'd', 'points',
        'fill', 'stroke', 'stroke-width', 'stroke-dasharray', 'stroke-linecap', 'stroke-linejoin', 'opacity', 'fill-opacity',
        'transform', 'font-size', 'font-family', 'font-weight', 'text-anchor', 'dominant-baseline', 'id', 'marker-end',
        'marker-start', 'markerwidth', 'markerheight', 'refx', 'refy', 'orient', 'patternunits', 'clip-path', 'href', 'preserveaspectratio',
    ];
    private const SVG_MAKS = 60000;

    /**
     * Diagram dari AI hanya boleh memuat unsur gambar vektor dasar: tanpa skrip, tanpa event, tanpa tautan luar.
     * (Frontend juga menampilkannya sebagai <img>, sehingga skrip tidak pernah berjalan.)
     */
    public static function sanitasiSvg(?string $svg): ?string
    {
        $svg = trim((string) $svg);
        if ($svg === '' || strlen($svg) > self::SVG_MAKS || !str_contains($svg, '<svg')) return null;
        $svg = substr($svg, strpos($svg, '<svg'));
        $svg = substr($svg, 0, (strrpos($svg, '</svg>') ?: strlen($svg) - 6) + 6);

        $dom = new \DOMDocument();
        $lama = libxml_use_internal_errors(true);
        // Tanpa LIBXML_NOENT: entitas tidak diganti (aman dari XXE); NONET: tidak mengambil apa pun dari jaringan
        $ok = $dom->loadXML($svg, LIBXML_NONET);
        libxml_clear_errors();
        libxml_use_internal_errors($lama);
        if (!$ok || strtolower($dom->documentElement?->localName ?? '') !== 'svg') return null;

        self::bersihkanNode($dom->documentElement);
        if (!$dom->documentElement->hasAttribute('xmlns')) $dom->documentElement->setAttribute('xmlns', 'http://www.w3.org/2000/svg');
        return $dom->saveXML($dom->documentElement) ?: null;
    }

    private static function bersihkanNode(\DOMElement $el): void
    {
        foreach (iterator_to_array($el->attributes) as $attr) {
            $nama = strtolower($attr->localName);
            $nilai = strtolower(trim($attr->value));
            $hrefLuar = in_array($nama, ['href'], true) && !str_starts_with($nilai, '#');
            if (!in_array($nama, self::SVG_ATTR, true) || $hrefLuar || str_contains($nilai, 'javascript:') || str_contains($nilai, 'url(http')) {
                $el->removeAttributeNode($attr);
            }
        }
        foreach (iterator_to_array($el->childNodes) as $anak) {
            if ($anak instanceof \DOMElement) {
                if (!in_array(strtolower($anak->localName), self::SVG_TAG, true)) $el->removeChild($anak);
                else self::bersihkanNode($anak);
            } elseif (!($anak instanceof \DOMText)) {
                $el->removeChild($anak); // komentar, CDATA, instruksi pemrosesan
            }
        }
    }

    /** Bobot STNKM bawaan sebuah soal: dari bobot materinya, dengan dimensi dominan (bila ada) dinaikkan ke 1. */
    public static function bobotDimensi(?\App\Models\MasterMateri $materi, ?string $dominan = null): array
    {
        $bobot = [];
        foreach (BankSoal::DIMENSI as $d) $bobot["dim_{$d}"] = round((float) ($materi?->{"mat_{$d}"} ?? 0), 2);
        if ($dominan && in_array($dominan, BankSoal::DIMENSI, true)) $bobot["dim_{$dominan}"] = 1.0;
        return $bobot;
    }
}

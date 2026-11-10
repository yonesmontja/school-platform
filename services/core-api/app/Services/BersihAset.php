<?php

namespace App\Services;

use DOMDocument;
use DOMElement;
use RuntimeException;

/**
 * Pembersih aset unggahan sekolah (E2b): SVG dan animasi Lottie (JSON) diperiksa dan dibersihkan sebelum disimpan,
 * karena keduanya dibuka di peramban guru lain (pratinjau Studio) dan di peramban render.
 *  - SVG: hanya elemen & atribut gambar yang dikenal; skrip, foreignObject, event handler, dan tautan luar dibuang.
 *    Ukuran intrinsik diperbesar (sisi terpanjang 2048 px) agar tetap tajam saat dirasterisasi.
 *  - Lottie: struktur wajib dicek; expression (kode JavaScript di kunci "x") dibuang; gambar hanya boleh tertanam
 *    (data:image/png|jpeg|webp), tidak boleh memuat berkas dari luar.
 */
class BersihAset
{
    private const ELEMEN_SVG = ['svg', 'g', 'defs', 'symbol', 'use', 'title', 'desc', 'path', 'rect', 'circle', 'ellipse', 'line', 'polyline',
        'polygon', 'text', 'tspan', 'textpath', 'lineargradient', 'radialgradient', 'stop', 'clippath', 'mask', 'pattern', 'filter', 'image',
        'feblend', 'fecolormatrix', 'fecomponenttransfer', 'fecomposite', 'feflood', 'fegaussianblur', 'feimage', 'femerge', 'femergenode',
        'feoffset', 'fefunca', 'fefuncb', 'fefuncg', 'fefuncr', 'fedropshadow', 'femorphology', 'feturbulence', 'fedisplacementmap', 'style', 'marker'];

    public static function svg(string $isi): string
    {
        if (strlen($isi) > 1024 * 1024) throw new RuntimeException('SVG maksimal 1 MB.');
        if (preg_match('/<!DOCTYPE|<!ENTITY/i', $isi)) throw new RuntimeException('SVG dengan DOCTYPE/ENTITY tidak diizinkan.');
        $dok = new DOMDocument();
        $lama = libxml_use_internal_errors(true);
        $ok = $dok->loadXML($isi, LIBXML_NONET | LIBXML_NOBLANKS);
        libxml_clear_errors();
        libxml_use_internal_errors($lama);
        $akar = $dok->documentElement;
        if (!$ok || !$akar || strtolower($akar->localName) !== 'svg') throw new RuntimeException('Berkas bukan SVG yang sah.');
        self::bersihkanSimpul($akar);

        // Ukuran intrinsik dari viewBox (atau width/height), sisi terpanjang 2048 px
        $vb = preg_split('/[\s,]+/', trim($akar->getAttribute('viewBox')));
        [$w, $h] = count($vb) === 4 && (float) $vb[2] > 0 && (float) $vb[3] > 0 ? [(float) $vb[2], (float) $vb[3]]
            : [(float) $akar->getAttribute('width') ?: 0, (float) $akar->getAttribute('height') ?: 0];
        if ($w <= 0 || $h <= 0) throw new RuntimeException('SVG perlu viewBox atau ukuran lebar/tinggi.');
        if (count($vb) !== 4) $akar->setAttribute('viewBox', "0 0 {$w} {$h}");
        $s = 2048 / max($w, $h);
        $akar->setAttribute('width', (string) round($w * $s));
        $akar->setAttribute('height', (string) round($h * $s));
        if (!$akar->hasAttribute('xmlns')) $akar->setAttribute('xmlns', 'http://www.w3.org/2000/svg');
        return $dok->saveXML($akar);
    }

    private static function bersihkanSimpul(DOMElement $el): void
    {
        foreach (iterator_to_array($el->childNodes) as $anak) {
            if ($anak instanceof DOMElement) {
                if (!in_array(strtolower($anak->localName), self::ELEMEN_SVG, true)) { $el->removeChild($anak); continue; }
                self::bersihkanSimpul($anak);
            } elseif (in_array($anak->nodeType, [XML_PI_NODE, XML_COMMENT_NODE], true)) {
                $el->removeChild($anak);
            }
        }
        foreach (iterator_to_array($el->attributes) as $atr) {
            $nama = strtolower($atr->nodeName);
            $nilai = trim($atr->nodeValue);
            $tautan = in_array($nama, ['href', 'xlink:href', 'src'], true);
            if (str_starts_with($nama, 'on')
                || ($tautan && !str_starts_with($nilai, '#') && !preg_match('#^data:image/(png|jpeg|webp);base64,#i', $nilai))
                || (!$tautan && preg_match('/javascript:|url\(\s*[\'"]?(?!#)|@import|expression\(/i', $nilai))) {
                $el->removeAttributeNode($atr);
            }
        }
        if (strtolower($el->localName) === 'style') {
            $css = $el->textContent;
            if (preg_match('/@import|url\(\s*[\'"]?(?!#)|javascript:|expression\(/i', $css)) $el->parentNode?->removeChild($el);
        }
    }

    /** @return array{0: string, 1: array} JSON bersih dan ringkasan (fr, ip, op, w, h). */
    public static function lottie(string $isi): array
    {
        if (strlen($isi) > 3 * 1024 * 1024) throw new RuntimeException('Animasi Lottie maksimal 3 MB.');
        $d = json_decode($isi, true, 256);
        if (!is_array($d) || !isset($d['v'], $d['fr'], $d['ip'], $d['op'], $d['w'], $d['h'], $d['layers']) || !is_array($d['layers'])
            || (float) $d['fr'] <= 0 || (float) $d['op'] <= (float) $d['ip'] || (float) $d['w'] <= 0 || (float) $d['h'] <= 0) {
            throw new RuntimeException('Berkas bukan animasi Lottie (JSON) yang sah.');
        }
        if (((float) $d['op'] - (float) $d['ip']) / (float) $d['fr'] > 120) throw new RuntimeException('Animasi Lottie maksimal 2 menit.');
        foreach ($d['assets'] ?? [] as $i => $a) {
            if (!is_array($a) || !isset($a['p'])) continue; // precomp: tanpa berkas
            if (!is_string($a['p']) || !preg_match('#^data:image/(png|jpeg|webp);base64,#i', $a['p'])) {
                throw new RuntimeException('Gambar di dalam Lottie harus tertanam (ekspor dengan opsi "embed images"); berkas luar tidak diizinkan.');
            }
            $d['assets'][$i]['u'] = '';
            $d['assets'][$i]['e'] = 1;
        }
        $d = self::tanpaExpression($d);
        return [json_encode($d, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE),
            ['fr' => (float) $d['fr'], 'ip' => (float) $d['ip'], 'op' => (float) $d['op'], 'w' => (float) $d['w'], 'h' => (float) $d['h']]];
    }

    /** Expression Lottie tersimpan sebagai teks di kunci "x" pada properti animasi; dibuang seluruhnya. */
    private static function tanpaExpression(array $d): array
    {
        foreach ($d as $k => $v) {
            if ($k === 'x' && is_string($v)) unset($d[$k]);
            elseif (is_array($v)) $d[$k] = self::tanpaExpression($v);
        }
        return $d;
    }
}

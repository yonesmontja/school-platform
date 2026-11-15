<?php

namespace App\Support;

use DOMDocument;
use DOMElement;
use DOMNode;

/**
 * Pembersih HTML dari editor catatan (daftar putih). Hanya format dasar, daftar, daftar centang (ul.cek > li[data-cek]),
 * tabel data, tautan http(s), serta gambar/video dari unggahan aplikasi sendiri (/storage/lampiran/...).
 * Semua atribut lain, skrip, gaya, dan peristiwa dibuang.
 */
class HtmlAman
{
    private const TAG = [
        'p' => [], 'br' => [], 'strong' => [], 'b' => [], 'em' => [], 'i' => [], 'u' => [], 's' => [], 'h3' => [], 'h4' => [],
        'ul' => ['class'], 'ol' => [], 'li' => ['data-cek'], 'blockquote' => [], 'hr' => [], 'span' => [], 'div' => ['data-sumber'],
        'a' => ['href'], 'img' => ['src', 'alt'], 'video' => ['src'], 'figure' => [], 'figcaption' => [],
        'table' => ['data-sumber'], 'thead' => [], 'tbody' => [], 'tr' => [], 'th' => [], 'td' => [],
    ];
    // Isi tag ini dibuang seluruhnya (bukan hanya tagnya)
    private const BUANG = ['script', 'style', 'iframe', 'object', 'embed', 'template', 'svg', 'math', 'form', 'input', 'button', 'select', 'textarea', 'head', 'title', 'meta', 'link'];
    private const MEDIA = '#^/storage/(lampiran|jurnal)/[\w./-]+$#';

    public static function bersihkan(?string $html): ?string
    {
        $html = trim((string) $html);
        if ($html === '') return null;
        // Teks lama tanpa tag → paragraf
        if (!preg_match('/<[a-z][^>]*>/i', $html)) {
            return collect(preg_split('/\R{2,}/', $html))->map(fn($p) => '<p>' . preg_replace('/\R/', '<br>', e(trim($p))) . '</p>')->implode('');
        }
        $doc = new DOMDocument();
        libxml_use_internal_errors(true);
        $doc->loadHTML('<?xml encoding="UTF-8"><div id="akar">' . $html . '</div>', LIBXML_HTML_NOIMPLIED | LIBXML_HTML_NODEFDTD | LIBXML_NONET);
        libxml_clear_errors();
        $akar = $doc->getElementById('akar');
        if (!$akar) return null;
        self::rapikan($akar);
        $hasil = '';
        foreach ($akar->childNodes as $n) $hasil .= $doc->saveHTML($n);
        $hasil = trim($hasil);
        return self::teks($hasil) === '' && !preg_match('/<(img|video)\b/', $hasil) ? null : $hasil;
    }

    private static function rapikan(DOMNode $induk): void
    {
        foreach (iterator_to_array($induk->childNodes) as $n) {
            if ($n->nodeType === XML_COMMENT_NODE || $n->nodeType === XML_PI_NODE) { $induk->removeChild($n); continue; }
            if (!$n instanceof DOMElement) continue;
            $tag = strtolower($n->tagName);
            if (in_array($tag, self::BUANG, true)) { $induk->removeChild($n); continue; }
            if (!array_key_exists($tag, self::TAG)) {
                // Tag tak dikenal: buka bungkusnya, pertahankan isinya
                self::rapikan($n);
                while ($n->firstChild) $induk->insertBefore($n->firstChild, $n);
                $induk->removeChild($n);
                continue;
            }
            foreach (iterator_to_array($n->attributes) as $atr) {
                if (!in_array(strtolower($atr->name), self::TAG[$tag], true)) $n->removeAttribute($atr->name);
            }
            if ($tag === 'a') {
                $href = trim($n->getAttribute('href'));
                if (!preg_match('#^(https?://|mailto:|/)#i', $href)) $n->removeAttribute('href');
                else { $n->setAttribute('rel', 'noopener noreferrer'); $n->setAttribute('target', '_blank'); }
            }
            if ($tag === 'img' || $tag === 'video') {
                if (!preg_match(self::MEDIA, $n->getAttribute('src'))) { $induk->removeChild($n); continue; }
                if ($tag === 'video') { $n->setAttribute('controls', ''); $n->setAttribute('preload', 'metadata'); }
            }
            if ($tag === 'ul' && $n->getAttribute('class') !== 'cek') $n->removeAttribute('class');
            if ($tag === 'li' && $n->hasAttribute('data-cek')) $n->setAttribute('data-cek', $n->getAttribute('data-cek') === '1' ? '1' : '0');
            self::rapikan($n);
            // Butir daftar kosong (sisa tombol Enter di editor) dibuang; daftar yang jadi kosong ikut dibuang
            $kosong = fn(DOMElement $e) => trim($e->textContent) === '' && $e->getElementsByTagName('img')->length === 0 && $e->getElementsByTagName('video')->length === 0;
            if (in_array($tag, ['li', 'ul', 'ol'], true) && $kosong($n)) $induk->removeChild($n);
        }
    }

    /** Teks polos (untuk jurnal, notifikasi, Excel, AI): daftar centang menjadi [x]/[ ], daftar menjadi "- ". */
    public static function teks(?string $html): string
    {
        $html = (string) $html;
        if ($html === '') return '';
        $html = preg_replace('#<li[^>]*data-cek="1"[^>]*>#i', "\n[x] ", $html);
        $html = preg_replace('#<li[^>]*data-cek="0"[^>]*>#i', "\n[ ] ", $html);
        $html = preg_replace('#<li[^>]*>#i', "\n- ", $html);
        $html = preg_replace('#<img[^>]*>#i', ' [foto] ', $html);
        $html = preg_replace('#<video[^>]*>.*?</video>|<video[^>]*/?>#is', ' [video] ', $html);
        $html = preg_replace('#<(br|/p|/h3|/h4|/tr|/blockquote|/div|/ul|/ol|/table)[^>]*>#i', "\n", $html);
        $html = preg_replace('#</t[dh]>#i', ' | ', $html);
        $teks = html_entity_decode(strip_tags($html), ENT_QUOTES | ENT_HTML5, 'UTF-8');
        $teks = preg_replace("/[ \t]+/", ' ', $teks);
        $teks = preg_replace("/ *\n */", "\n", $teks);
        return trim(preg_replace("/\n{2,}/", "\n", $teks));
    }

    /** Path berkas lampiran yang dirujuk HTML (untuk menautkan lampiran ke objeknya). */
    public static function mediaDirujuk(?string $html): array
    {
        preg_match_all('#\s(?:src)="/storage/(lampiran/[\w./-]+)"#', (string) $html, $m);
        return array_values(array_unique($m[1]));
    }
}

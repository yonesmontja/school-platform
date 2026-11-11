<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use RuntimeException;

/**
 * Unduh berkas audio dari URL kiriman aplikasi luar (API render v1) dengan pelindung SSRF: hanya https, host harus
 * berupa alamat publik (bukan IP privat/loopback/link-local/cadangan), tanpa pengalihan, ukuran dibatasi, dan isi
 * harus benar-benar audio. Disimpan di storage publik render-api/aset/ dengan nama acak agar bisa dibaca layanan render.
 */
class UnduhAset
{
    /** @return string jalur /storage/render-api/aset/… */
    public function audio(string $url, int $maksMb): string
    {
        // Alamat yang sudah dicek dipaku ke koneksi (CURLOPT_RESOLVE) agar DNS tidak bisa diganti di antara cek dan unduh
        [$host, $port, $ip] = $this->cekUrl($url);
        try {
            $res = Http::timeout(60)->withOptions(['allow_redirects' => false, 'curl' => [CURLOPT_RESOLVE => ["{$host}:{$port}:" . (str_contains($ip, ':') ? "[{$ip}]" : $ip)]]])->withHeaders(['User-Agent' => 'EduRapor-RenderAPI'])->get($url);
        } catch (\Exception) {
            throw new RuntimeException("Berkas tidak bisa diunduh: {$url}");
        }
        if ($res->redirect()) throw new RuntimeException("URL dialihkan ke alamat lain; kirim URL langsung ke berkasnya: {$url}");
        if (!$res->successful()) throw new RuntimeException("Berkas tidak bisa diunduh (HTTP {$res->status()}): {$url}");
        $isi = $res->body();
        if (strlen($isi) > $maksMb * 1024 * 1024) throw new RuntimeException("Berkas melebihi {$maksMb} MB: {$url}");
        $ext = $this->jenisAudio($isi);
        if (!$ext) throw new RuntimeException("Berkas bukan audio MP3/WAV/M4A/OGG: {$url}");
        $path = 'render-api/aset/' . Str::lower(Str::random(32)) . '.' . $ext;
        Storage::disk('public')->put($path, $isi);
        return '/storage/' . $path;
    }

    /**
     * Hanya https ke host publik; setiap alamat IP hasil DNS dicek.
     * @return array{0: string, 1: int, 2: string} host, port, alamat IP yang dipakai
     */
    public function cekUrl(string $url): array
    {
        $u = parse_url($url);
        if (($u['scheme'] ?? '') !== 'https' || empty($u['host']) || isset($u['user']) || isset($u['pass'])) {
            throw new RuntimeException("Hanya URL https yang diterima: {$url}");
        }
        if (isset($u['port']) && !in_array((int) $u['port'], [443, 8443], true)) throw new RuntimeException("Port URL tidak diizinkan: {$url}");
        $host = trim($u['host'], '[]');
        $ip = filter_var($host, FILTER_VALIDATE_IP) ? [$host] : array_merge(
            array_column(@dns_get_record($host, DNS_A) ?: [], 'ip'),
            array_column(@dns_get_record($host, DNS_AAAA) ?: [], 'ipv6'),
        );
        if (!$ip) throw new RuntimeException("Nama host tidak ditemukan: {$host}");
        foreach ($ip as $a) {
            if (!filter_var($a, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE)) {
                throw new RuntimeException("Alamat jaringan internal tidak diizinkan: {$host}");
            }
        }
        return [$host, (int) ($u['port'] ?? 443), $ip[0]];
    }

    /** Kenali audio dari tanda tangan berkas, bukan dari Content-Type kiriman server. */
    private function jenisAudio(string $b): ?string
    {
        if (str_starts_with($b, 'ID3') || (strlen($b) > 2 && ord($b[0]) === 0xFF && (ord($b[1]) & 0xE0) === 0xE0)) return 'mp3';
        if (str_starts_with($b, 'RIFF') && substr($b, 8, 4) === 'WAVE') return 'wav';
        if (substr($b, 4, 4) === 'ftyp') return 'm4a';
        if (str_starts_with($b, 'OggS')) return 'ogg';
        return null;
    }
}

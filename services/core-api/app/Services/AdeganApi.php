<?php

namespace App\Services;

use App\Models\SchoolSetting;
use RuntimeException;

/**
 * Ubah payload Scene JSON API render v1 (Bab 8 spesifikasi Muse: hook / map / fact / twist / closing) menjadi naskah
 * Rakitan yang dirender layanan video-render. Tata letak tetap per jenis adegan; ukuran huruf mengikuti panjang teks.
 */
class AdeganApi
{
    public const TEMPLAT = [
        'maritime-50s' => ['nama' => 'Maritim tegak 50 detik', 'durasi_saran' => 50],
        'maritime-60s' => ['nama' => 'Maritim tegak 60 detik', 'durasi_saran' => 60],
    ];
    public const JENIS = ['hook', 'map', 'fact', 'twist', 'closing'];
    public const FORMAT = ['1080x1920' => '9:16', '1920x1080' => '16:9', '1080x1080' => '1:1'];

    private const LAUT = '#04121f';
    private const LAUT2 = '#0b3a5b';
    private const AKSEN = '#38bdf8';
    private const KUNING = '#fbbf24';

    /** Ukuran bingkai dasar (sisi pendek 720 px), satuan ukuran huruf naskah Rakitan. */
    private array $bingkai = [720, 1280];

    public function __construct(private PetaService $peta, private UnduhAset $unduh) {}

    /** @return array{props: array, suara: string, peringatan: string[], aset: string[]} */
    public function susun(array $p): array
    {
        $peringatan = [];
        $aset = [];
        $rasio = self::FORMAT[($p['format']['width'] ?? 1080) . 'x' . ($p['format']['height'] ?? 1920)];
        [$lebar, $tinggi] = array_map('intval', explode(':', $rasio));
        $tegak = $tinggi > $lebar;
        $this->bingkai = [720 * max(1, $lebar / $tinggi), 720 * max(1, $tinggi / $lebar)];
        $scenes = $p['scenes'];
        $closing = collect($scenes)->firstWhere('type', 'closing');
        $seri = trim((string) ($closing['series'] ?? ''));

        // Narasi: berkas utuh dari URL, atau suara Azure per adegan, atau Piper lokal bila kunci Azure belum diisi
        $audio = $p['audio'] ?? [];
        $narasiUtuh = null;
        $suara = 'TANPA';
        if (is_string($audio['narration'] ?? null) && str_starts_with($audio['narration'], 'https://')) {
            try {
                $narasiUtuh = $this->unduh->audio($audio['narration'], 30);
                $aset[] = $narasiUtuh;
            } catch (RuntimeException $e) {
                throw new RuntimeException('Narasi: ' . $e->getMessage());
            }
        } else {
            if (!empty($audio['narration'])) $peringatan[] = 'audio.narration bukan URL https (mis. asset://), jadi tidak bisa diambil server; narasi dibuat dari teks adegan.';
            // Urutan suara: Azure (bila kunci ada) → Gemini (kunci Gemini sekolah) → Piper lokal
            $s = SchoolSetting::first();
            $azure = !empty($s?->getAttributes()['azure_speech_key']) && $s?->azure_speech_region;
            $gemini = !empty($s?->getAttributes()['api_key_gemini']) || config('services.ai_services.gemini_key');
            $minta = (string) ($p['voice'] ?? 'id-ID-ArdiNeural');
            $suara = $azure ? 'AZURE' : ($gemini ? 'GEMINI' : 'LOKAL');
            if ($suara === 'GEMINI') {
                $suaraGemini = in_array($minta, SuaraService::SUARA_GEMINI, true) ? $minta : 'Charon';
                if ($minta !== $suaraGemini) $peringatan[] = "Kunci Azure Speech belum diisi; narasi memakai suara Gemini {$suaraGemini} (gaya narator berita), bukan {$minta}.";
            } elseif ($suara === 'LOKAL') {
                $peringatan[] = 'Kunci Azure Speech dan Gemini belum diisi di Pengaturan; narasi memakai suara lokal Piper, bukan ' . $minta . '.';
            }
        }

        $musik = null;
        if (is_string($audio['music'] ?? null) && str_starts_with($audio['music'], 'https://')) {
            try {
                $src = $this->unduh->audio($audio['music'], 15);
                $aset[] = $src;
                $musik = ['src' => $src, 'volume' => max(0, min(1, (float) ($audio['musicVolume'] ?? 0.15))), 'redam' => true];
            } catch (RuntimeException $e) {
                throw new RuntimeException('Musik: ' . $e->getMessage());
            }
        } elseif (!empty($audio['music'])) {
            $peringatan[] = 'audio.music bukan URL https (mis. asset://), jadi video dibuat tanpa musik latar.';
        }
        if (!empty($p['subtitles'])) $peringatan[] = 'Berkas subtitles diabaikan: teks setiap adegan sudah tampil di layar.';

        $adegan = [];
        foreach ($scenes as $i => $sc) {
            $durasi = round((float) $sc['endSec'] - (float) $sc['startSec'], 2);
            $adegan[] = match ($sc['type']) {
                'hook' => $this->hook($sc, $durasi, $seri, $tegak),
                'map' => $this->petaAdegan($sc, $durasi, $lebar / $tinggi),
                'fact' => $this->fakta($sc, $durasi, $tegak),
                'twist' => $this->twist($sc, $durasi, $tegak),
                'closing' => $this->penutup($sc, $durasi, $seri, $p['sources'] ?? [], $tegak),
            };
            if ($suara !== 'TANPA') {
                $teks = trim((string) ($sc['type'] === 'closing' ? ($sc['question'] ?? '') : ($sc['text'] ?? '')));
                $adegan[$i]['narasi'] = $teks;
                // Perkiraan ±2,5 kata/detik; bila tidak muat, bacaan dipercepat (maks. 25%) agar durasi payload terjaga
                $kata = str_word_count($teks, 0, 'ÀÁÂÃÄÅàáâãäåÈÉÊËèéêëÌÍÎÏìíîïÒÓÔÕÖòóôõöÙÚÛÜùúûü0123456789');
                $perlu = $kata / 2.5;
                $adegan[$i]['laju'] = $teks !== '' && $perlu > $durasi - 0.8 ? round(min(1.25, $perlu / max(1, $durasi - 0.8)), 2) : 1;
                if ($teks !== '' && $perlu / 1.25 > $durasi - 0.8) $peringatan[] = "Narasi adegan " . ($i + 1) . " ({$sc['type']}) kemungkinan lebih panjang dari {$durasi} detik; adegan akan diperpanjang mengikuti narasi.";
            }
        }

        $props = [
            'rasio' => $rasio, 'resolusi' => '1080p', 'judul' => mb_substr((string) ($p['episode'] ?? 'Render API'), 0, 120),
            'subtitle' => false, 'gaya' => null, 'musik' => $musik,
            'merek' => ['logo' => null, 'posisi_logo' => 'tidak', 'huruf' => 'Poppins', 'warna' => [self::LAUT, self::AKSEN]],
            'adegan' => $adegan,
            'voice' => $p['voice'] ?? 'id-ID-ArdiNeural',
            'voice_gemini' => $suaraGemini ?? 'Charon',
        ];
        if ($narasiUtuh) $props['narasi_utuh'] = ['src' => $narasiUtuh];
        return ['props' => $props, 'suara' => $suara, 'peringatan' => $peringatan, 'aset' => $aset];
    }

    // ===== Tata letak per jenis adegan =====

    private function dasar(float $durasi, string $kamera = 'zoom-masuk', string $hias = 'gelombang'): array
    {
        return [
            'narasi' => '', 'durasi' => max(2, min(40, $durasi)), 'transisi' => 'pudar', 'kamera' => $kamera,
            'latar' => ['tipe' => 'gradien', 'warna' => self::LAUT, 'warna2' => self::LAUT2, 'gambar' => null, 'redup' => 0, 'hias' => $hias, 'warna_hias' => self::AKSEN],
            'elemen' => [],
        ];
    }

    /** Ukuran huruf (piksel pada bingkai dasar 720) agar teks sepanjang $n karakter muat di kotak w×h persen. */
    private function ukuran(string $teks, float $w, float $h, bool $tegak, int $min, int $maks): int
    {
        $n = max(1, mb_strlen($teks));
        $lebarPx = $w / 100 * $this->bingkai[0];
        $tinggiPx = $h / 100 * $this->bingkai[1];
        return (int) max($min, min($maks, floor(sqrt($lebarPx * $tinggiPx / (0.56 * 1.3 * $n)) * 0.9)));
    }

    private function teks(string $id, string $isi, float $x, float $y, float $w, float $h, int $ukuran, array $gaya = [], array $masuk = ['preset' => 'pudar', 'mulai' => 0.2, 'durasi' => 0.6]): array
    {
        return [
            'id' => $id, 'tipe' => 'teks', 'isi' => $isi, 'x' => $x, 'y' => $y, 'w' => $w, 'h' => $h, 'rot' => 0, 'gerak' => 'tidak',
            'gaya' => array_merge(['ukuran' => $ukuran, 'warna' => '#ffffff', 'latar' => null, 'garis' => null, 'tebal' => true, 'miring' => false,
                'rata' => 'tengah', 'sudut' => 0, 'bayangan' => true, 'buram' => 1, 'huruf' => 'Poppins', 'kaca' => false, 'emoji' => '3d'], $gaya),
            'masuk' => $masuk, 'keluar' => ['preset' => 'tidak', 'pada' => null],
        ];
    }

    private function label(string $id, string $isi, float $y, string $latar = self::AKSEN, float $mulai = 0): array
    {
        return $this->teks($id, mb_strtoupper($isi), 50, $y, 70, 5, 26, ['warna' => '#04121f', 'latar' => $latar, 'sudut' => 30, 'bayangan' => false],
            ['preset' => 'pop', 'mulai' => $mulai, 'durasi' => 0.5]);
    }

    private function masukDari(?string $motion, string $bawaan): string
    {
        return match ($motion) {
            'fade-slide-up' => 'geser-bawah',
            'twist-marker' => 'sapu',
            'fade' => 'pudar',
            'pop' => 'pop',
            'words', 'word-by-word' => 'kata',
            default => $bawaan,
        };
    }

    private function hook(array $sc, float $durasi, string $seri, bool $tegak): array
    {
        $a = $this->dasar($durasi, 'zoom-masuk', 'gelombang');
        $isi = (string) ($sc['text'] ?? '');
        if ($seri !== '') $a['elemen'][] = $this->label('seri', $seri, $tegak ? 24 : 16);
        $a['elemen'][] = $this->teks('kait', $isi, 50, 50, 86, $tegak ? 36 : 50, $this->ukuran($isi, 86, $tegak ? 36 : 50, $tegak, 36, 86),
            [], ['preset' => $this->masukDari($sc['motion'] ?? null, 'geser-bawah'), 'mulai' => 0.15, 'durasi' => 0.7]);
        return $a;
    }

    private function petaAdegan(array $sc, float $durasi, float $rasio): array
    {
        // Tanpa zoom kamera: penanda di tepi bingkai tetap terlihat
        $a = $this->dasar($durasi, 'tidak', 'tidak');
        [$peta] = $this->peta->susun($sc, $rasio);
        $a['elemen'][] = [
            'id' => 'peta', 'tipe' => 'peta', 'isi' => null, 'x' => 50, 'y' => 50, 'w' => 100, 'h' => 100, 'rot' => 0, 'gerak' => 'tidak',
            'peta' => $peta,
            'gaya' => ['warna' => '#1f4e5f', 'latar' => '#06223a', 'garis' => self::AKSEN, 'aksen' => self::KUNING, 'ukuran' => 30, 'huruf' => 'Poppins'],
            'masuk' => ['preset' => 'pudar', 'mulai' => 0, 'durasi' => 0.6], 'keluar' => ['preset' => 'tidak', 'pada' => null],
        ];
        $nama = array_values(array_filter(array_map(fn($n) => is_string($n) ? $n : null, (array) ($sc['route'] ?? []))));
        if ($nama) {
            $judul = implode(' → ', $nama);
            $a['elemen'][] = $this->teks('rute', $judul, 50, 90, 90, 6, $this->ukuran($judul, 90, 6, true, 22, 34),
                ['latar' => '#04121fcc', 'sudut' => 20, 'bayangan' => false], ['preset' => 'geser-bawah', 'mulai' => 0.6, 'durasi' => 0.6]);
        }
        return $a;
    }

    private function fakta(array $sc, float $durasi, bool $tegak): array
    {
        $a = $this->dasar($durasi, 'zoom-keluar', 'titik');
        $isi = (string) ($sc['text'] ?? '');
        $a['elemen'][] = $this->label('fakta', 'Fakta', $tegak ? 20 : 12);
        $a['elemen'][] = $this->teks('isi', $isi, 50, 54, 86, $tegak ? 56 : 66, $this->ukuran($isi, 80, $tegak ? 52 : 60, $tegak, 24, 52),
            ['rata' => 'kiri', 'tebal' => false, 'kaca' => true, 'latar' => '#0b3a5b', 'sudut' => 6], ['preset' => 'pudar', 'mulai' => 0.3, 'durasi' => 0.8]);
        return $a;
    }

    private function twist(array $sc, float $durasi, bool $tegak): array
    {
        $a = $this->dasar($durasi, 'zoom-masuk', 'gumpalan');
        $isi = (string) ($sc['text'] ?? '');
        $a['elemen'][] = $this->label('tapi', 'Tapi…', $tegak ? 22 : 14, self::KUNING);
        $a['elemen'][] = [
            'id' => 'garis', 'tipe' => 'bentuk', 'isi' => 'garis', 'x' => 50, 'y' => $tegak ? 27 : 20, 'w' => 30, 'h' => 1, 'rot' => 0, 'gerak' => 'tidak',
            'gaya' => ['ukuran' => 60, 'warna' => self::KUNING, 'latar' => null, 'garis' => null, 'tebal' => true, 'miring' => false, 'rata' => 'tengah', 'sudut' => 50, 'bayangan' => false, 'buram' => 1, 'huruf' => null, 'kaca' => false, 'emoji' => '3d'],
            'masuk' => ['preset' => 'sapu', 'mulai' => 0.3, 'durasi' => 0.8], 'keluar' => ['preset' => 'tidak', 'pada' => null],
        ];
        $a['elemen'][] = $this->teks('isi', $isi, 50, 55, 86, $tegak ? 48 : 60, $this->ukuran($isi, 86, $tegak ? 48 : 60, $tegak, 28, 64),
            [], ['preset' => $this->masukDari($sc['motion'] ?? null, 'kata'), 'mulai' => 0.4, 'durasi' => 1.2]);
        return $a;
    }

    private function penutup(array $sc, float $durasi, string $seri, array $sumber, bool $tegak): array
    {
        $a = $this->dasar($durasi, 'zoom-keluar', 'bokeh');
        $tanya = (string) ($sc['question'] ?? $sc['text'] ?? '');
        $a['elemen'][] = $this->teks('ikon', '💬', 50, $tegak ? 24 : 18, 20, 10, 110, ['bayangan' => false], ['preset' => 'pop', 'mulai' => 0.1, 'durasi' => 0.5]);
        $a['elemen'][] = $this->teks('tanya', $tanya, 50, 48, 86, $tegak ? 34 : 44, $this->ukuran($tanya, 80, $tegak ? 30 : 40, $tegak, 28, 60),
            ['kaca' => true, 'latar' => '#0b3a5b', 'sudut' => 8], ['preset' => 'geser-bawah', 'mulai' => 0.3, 'durasi' => 0.7]);
        if ($seri !== '') $a['elemen'][] = $this->label('seri', $seri, $tegak ? 72 : 78, self::AKSEN, 0.8);
        $penerbit = array_values(array_unique(array_filter(array_map(fn($s) => is_array($s) ? trim((string) ($s['publisher'] ?? '')) : '', $sumber))));
        if ($penerbit) {
            $teks = 'Sumber: ' . implode(', ', array_slice($penerbit, 0, 3));
            $a['elemen'][] = $this->teks('sumber', $teks, 50, $tegak ? 92 : 92, 86, 4, 20, ['tebal' => false, 'warna' => '#cbd5e1', 'bayangan' => false],
                ['preset' => 'pudar', 'mulai' => 1, 'durasi' => 0.6]);
        }
        return $a;
    }
}

<?php

namespace App\Services;

use App\Models\SchoolSetting;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * Suara narasi video belajar (Fase 19 Tahap B). LOKAL (Piper) dijalankan di layanan video-render tanpa API key;
 * ElevenLabs (suara netral & klon suara guru) dan Gemini dipanggil dari sini agar API key tetap di core-api.
 * Semua hasil dikembalikan sebagai WAV mono 16-bit agar durasinya mudah dihitung untuk menyusun video.
 */
class SuaraService
{
    public const PILIHAN = ['LOKAL', 'ELEVENLABS_NETRAL', 'ELEVENLABS_KLON', 'GEMINI', 'TANPA'];
    public const LABEL = [
        'LOKAL' => 'Suara AI lokal (Piper, gratis)',
        'ELEVENLABS_NETRAL' => 'ElevenLabs: suara netral bersemangat',
        'ELEVENLABS_KLON' => 'ElevenLabs: klon suara guru',
        'GEMINI' => 'Gemini: suara bersemangat',
        'TANPA' => 'Tanpa suara',
    ];
    // Suara bawaan ElevenLabs bila sekolah belum memilih (multibahasa, termasuk bahasa Indonesia)
    private const ELEVENLABS_BAWAAN = 'EXAVITQu4vr4xnSDxMaL';
    private const MODEL_GEMINI_TTS = 'gemini-2.5-flash-preview-tts';

    private ?string $galat = null;

    public function galat(): ?string { return $this->galat; }

    /** Pilihan suara beserta ketersediaannya (API key & ID suara sudah diisi atau belum). */
    public static function tersedia(): array
    {
        $s = SchoolSetting::first();
        $eleven = !empty($s?->getAttributes()['api_key_elevenlabs']);
        $gemini = !empty($s?->getAttributes()['api_key_gemini']) || config('services.ai_services.gemini_key');
        return collect(self::PILIHAN)->map(fn($p) => [
            'kode' => $p, 'label' => self::LABEL[$p],
            'aktif' => match ($p) {
                'ELEVENLABS_NETRAL' => $eleven,
                'ELEVENLABS_KLON' => $eleven && !empty($s?->elevenlabs_voice_klon),
                'GEMINI' => (bool) $gemini,
                default => true,
            },
            'catatan' => match ($p) {
                'ELEVENLABS_NETRAL' => $eleven ? null : 'Isi API key ElevenLabs di Pengaturan Sekolah.',
                'ELEVENLABS_KLON' => !$eleven ? 'Isi API key ElevenLabs di Pengaturan Sekolah.' : (empty($s?->elevenlabs_voice_klon) ? 'Isi ID suara klon ElevenLabs di Pengaturan Sekolah.' : null),
                'GEMINI' => $gemini ? null : 'Isi API key Gemini di Pengaturan Sekolah.',
                default => null,
            },
        ])->all();
    }

    /** Ubah teks menjadi WAV dengan penyedia berbayar. LOKAL & TANPA tidak lewat sini. */
    public function buat(string $suara, string $teks): ?string
    {
        $this->galat = null;
        $s = SchoolSetting::first();
        return match ($suara) {
            'ELEVENLABS_NETRAL', 'ELEVENLABS_KLON' => $this->elevenlabs($s, $teks, $suara === 'ELEVENLABS_KLON' ? $s?->elevenlabs_voice_klon : ($s?->elevenlabs_voice_netral ?: self::ELEVENLABS_BAWAAN)),
            'GEMINI' => $this->gemini($s, $teks),
            default => $this->gagal("Suara {$suara} tidak dibuat di core-api."),
        };
    }

    private function elevenlabs(?SchoolSetting $s, string $teks, ?string $voice): ?string
    {
        $key = $s?->api_key_elevenlabs;
        if (!$key) return $this->gagal('API key ElevenLabs belum diisi di Pengaturan Sekolah.');
        if (!$voice) return $this->gagal('ID suara klon ElevenLabs belum diisi di Pengaturan Sekolah.');
        try {
            $res = Http::timeout(120)->withHeaders(['xi-api-key' => $key, 'Accept' => 'audio/*'])
                ->post("https://api.elevenlabs.io/v1/text-to-speech/{$voice}?output_format=pcm_22050", [
                    'text' => $teks,
                    'model_id' => 'eleven_multilingual_v2',
                    'voice_settings' => ['stability' => 0.45, 'similarity_boost' => 0.8, 'style' => 0.35],
                ]);
            if (!$res->successful()) return $this->gagal('ElevenLabs menolak: HTTP ' . $res->status() . ' ' . mb_substr($res->json('detail.message') ?? $res->body(), 0, 200));
            return self::wav($res->body(), 22050);
        } catch (\Exception $e) {
            Log::error('Suara ElevenLabs: ' . $e->getMessage());
            return $this->gagal('ElevenLabs tidak bisa dihubungi.');
        }
    }

    private function gemini(?SchoolSetting $s, string $teks): ?string
    {
        $key = $s?->api_key_gemini ?: config('services.ai_services.gemini_key');
        if (!$key) return $this->gagal('API key Gemini belum diisi di Pengaturan Sekolah.');
        try {
            $res = Http::timeout(120)->withHeaders(['x-goog-api-key' => $key])
                ->post('https://generativelanguage.googleapis.com/v1beta/models/' . self::MODEL_GEMINI_TTS . ':generateContent', [
                    'contents' => [['parts' => [['text' => "Bacakan dengan suara ceria, jelas, dan bersemangat untuk anak SD, dalam bahasa Indonesia: {$teks}"]]]],
                    'generationConfig' => [
                        'responseModalities' => ['AUDIO'],
                        'speechConfig' => ['voiceConfig' => ['prebuiltVoiceConfig' => ['voiceName' => $s?->gemini_tts_voice ?: 'Kore']]],
                    ],
                ]);
            if (!$res->successful()) return $this->gagal('Gemini menolak: HTTP ' . $res->status() . ' ' . mb_substr($res->json('error.message') ?? '', 0, 200));
            $data = $res->json('candidates.0.content.parts.0.inlineData.data');
            if (!$data) return $this->gagal('Gemini tidak mengembalikan suara.');
            return self::wav(base64_decode($data), 24000);
        } catch (\Exception $e) {
            Log::error('Suara Gemini: ' . $e->getMessage());
            return $this->gagal('Gemini tidak bisa dihubungi.');
        }
    }

    /** Bungkus PCM 16-bit mono menjadi WAV. */
    public static function wav(string $pcm, int $rate): string
    {
        $len = strlen($pcm);
        return 'RIFF' . pack('V', 36 + $len) . 'WAVEfmt ' . pack('VvvVVvv', 16, 1, 1, $rate, $rate * 2, 2, 16) . 'data' . pack('V', $len) . $pcm;
    }

    private function gagal(string $pesan): null
    {
        $this->galat = $pesan;
        return null;
    }
}

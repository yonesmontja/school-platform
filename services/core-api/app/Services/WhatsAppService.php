<?php

namespace App\Services;

use App\Models\SchoolSetting;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * Pengiriman pesan WhatsApp otomatis lewat gateway Fonnte.
 * Aktif hanya jika status_wa_api dinyalakan dan token diisi di Pengaturan Sekolah.
 */
class WhatsAppService
{
    private const FONNTE_URL = 'https://api.fonnte.com/send';

    /**
     * Normalisasi nomor HP ke format 628xxx; ID grup WhatsApp dibiarkan apa adanya.
     */
    public static function formatNomor(?string $nomor): string
    {
        $str = trim((string) $nomor);
        if ($str === '' || str_contains($str, '@g.us')) return $str;

        $clean = preg_replace('/\D/', '', $str);
        if (str_starts_with($clean, '08')) return '62' . substr($clean, 1);
        if (str_starts_with($clean, '8')) return '62' . $clean;
        return $clean;
    }

    /**
     * @param array $daftarPesan daftar ['target' => string, 'message' => string]
     * @return array ['sent' => bool, 'count' => int, 'reason' => ?string]
     */
    public function kirim(array $daftarPesan): array
    {
        $settings = SchoolSetting::first();
        $token = $settings?->wa_api_token;

        if (!$settings?->status_wa_api || !$token) {
            return ['sent' => false, 'count' => 0, 'reason' => 'WhatsApp API belum aktif atau token belum diisi di Pengaturan Sekolah. Gunakan tombol WA manual.'];
        }

        $payload = collect($daftarPesan)
            ->map(fn($p) => ['target' => self::formatNomor($p['target'] ?? ''), 'message' => (string) ($p['message'] ?? '')])
            ->filter(fn($p) => $p['target'] !== '' && $p['message'] !== '')
            // Jeda 2 detik antar pesan agar nomor pengirim aman dari blokir
            ->map(fn($p) => $p + ['delay' => '2'])
            ->values();

        if ($payload->isEmpty()) {
            return ['sent' => false, 'count' => 0, 'reason' => 'Tidak ada nomor tujuan yang valid.'];
        }

        try {
            $response = Http::timeout(30)
                ->withHeaders(['Authorization' => trim($token)])
                ->asForm()
                ->post(self::FONNTE_URL, ['data' => $payload->toJson()]);

            $ok = $response->successful() && (bool) $response->json('status');
            if (!$ok) {
                Log::warning('Fonnte gagal: ' . $response->status() . ' ' . $response->body());
            }

            return [
                'sent' => $ok,
                'count' => $ok ? $payload->count() : 0,
                'reason' => $ok ? null : ($response->json('reason') ?: 'Gateway WhatsApp menolak permintaan.'),
            ];
        } catch (\Exception $e) {
            Log::error('Fonnte exception: ' . $e->getMessage());
            return ['sent' => false, 'count' => 0, 'reason' => 'Tidak dapat terhubung ke gateway WhatsApp.'];
        }
    }
}

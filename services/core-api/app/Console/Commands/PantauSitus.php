<?php

namespace App\Console\Commands;

use App\Models\SchoolSetting;
use App\Services\AuditTrail;
use App\Services\WhatsAppService;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;

/**
 * Pemantau uptime sederhana (Fase 11): tiap 5 menit membuka situs lewat alamat publiknya (jadi tunnel Cloudflare ikut teruji),
 * yaitu beranda (layanan web) dan /api/health (API + database). Bila gagal 2 kali berturut-turut, admin dikirimi WA lewat Fonnte;
 * saat pulih, dikirimi WA lagi beserta lama gangguan. Mati dan pulih dicatat di Log Aktivitas.
 *
 * Keterbatasan: berjalan di server yang sama (container scheduler). Bila laptop/listrik/internet sekolah mati, pesan juga tidak terkirim;
 * yang tertangkap adalah layanan web, API, database, atau tunnel yang macet.
 */
class PantauSitus extends Command
{
    protected $signature = 'situs:pantau {--uji : kirim pesan WA uji ke admin tanpa memeriksa situs}';
    protected $description = 'Periksa situs publik dan kirim WA ke admin bila tidak bisa dibuka atau sudah pulih';

    public const AMBANG = 2; // gagal berturut-turut sebelum admin diberi tahu (± 10 menit)
    private const KUNCI = 'pantau-situs';

    public function handle(): int
    {
        if ($this->option('uji')) {
            $hasil = $this->kirim("✅ *Pesan uji pemantau SAPrapor*\n\nPemantau situs aktif. Anda akan menerima WA bila " . self::alamat() . ' tidak bisa dibuka lebih dari 10 menit.');
            $this->line($hasil['sent'] ? 'Pesan uji terkirim.' : "Pesan uji tidak terkirim: {$hasil['reason']}");
            return $hasil['sent'] ? self::SUCCESS : self::FAILURE;
        }

        $masalah = self::periksa();
        $status = Cache::get(self::KUNCI, ['gagal' => 0, 'sejak' => null, 'diumumkan' => false]);

        if (!$masalah) {
            if ($status['diumumkan']) {
                $menit = max(1, (int) round(now()->diffInMinutes($status['sejak'], true)));
                $hasil = $this->kirim("✅ *SAPrapor sudah bisa dibuka lagi*\n\n" . self::alamat() . " pulih pukul " . self::jam(now())
                    . " setelah sekitar {$menit} menit tidak bisa dibuka.");
                $this->catat(true, "Situs pulih setelah sekitar {$menit} menit" . self::akhiran($hasil));
            }
            Cache::forget(self::KUNCI);
            $this->line('Situs normal.');
            return self::SUCCESS;
        }

        $status['gagal']++;
        $status['sejak'] ??= now()->toIso8601String();
        $ringkas = implode('; ', $masalah);
        if ($status['gagal'] >= self::AMBANG && !$status['diumumkan']) {
            $hasil = $this->kirim("⚠️ *SAPrapor tidak bisa dibuka*\n\n" . self::alamat() . " gagal diperiksa {$status['gagal']} kali berturut-turut sejak pukul "
                . self::jam(\Carbon\Carbon::parse($status['sejak'])) . ".\nMasalah: {$ringkas}\n\n"
                . 'Periksa laptop server: Docker Desktop berjalan, container school_web / school_core_api / school_cloudflared hidup, dan internet tersambung.');
            $status['diumumkan'] = true;
            $this->catat(false, "Situs tidak bisa dibuka ({$ringkas})" . self::akhiran($hasil));
        }
        Cache::put(self::KUNCI, $status, now()->addDays(2));
        $this->warn("Situs bermasalah ({$status['gagal']}x): {$ringkas}");
        return self::SUCCESS;
    }

    public static function alamat(): string
    {
        return rtrim((string) config('app.url_publik'), '/');
    }

    /** @return string[] daftar masalah; kosong bila semua normal */
    public static function periksa(): array
    {
        $masalah = [];
        foreach (['Beranda' => '/', 'API & database' => '/api/health'] as $nama => $jalur) {
            try {
                $r = Http::timeout(20)->withHeaders(['User-Agent' => 'SAPrapor-Pemantau'])->get(self::alamat() . $jalur);
                if ($r->status() >= 500 || ($jalur === '/api/health' && $r->json('status') !== 'ok')) $masalah[] = "{$nama} menjawab {$r->status()}";
            } catch (\Throwable $e) {
                $masalah[] = "{$nama} tidak menjawab";
            }
        }
        return $masalah;
    }

    private static function jam($waktu): string
    {
        return $waktu->copy()->timezone(config('app.zona_sekolah'))->format('H:i');
    }

    private static function akhiran(array $hasil): string
    {
        return $hasil['sent'] ? '; WA terkirim ke admin' : "; WA tidak terkirim: {$hasil['reason']}";
    }

    /** @return array{sent: bool, reason: string} */
    private function kirim(string $pesan): array
    {
        $nomor = SchoolSetting::first()?->no_wa_admin;
        if (!$nomor) return ['sent' => false, 'reason' => 'nomor WA admin belum diisi di Pengaturan'];
        $hasil = app(WhatsAppService::class)->kirim([['target' => $nomor, 'message' => $pesan]]);
        return ['sent' => (bool) ($hasil['sent'] ?? false), 'reason' => (string) ($hasil['reason'] ?? '')];
    }

    private function catat(bool $pulih, string $deskripsi): void
    {
        AuditTrail::catat([
            'user' => null, 'kategori' => 'SISTEM', 'aksi' => $pulih ? 'SITUS_PULIH' : 'SITUS_MATI', 'modul' => 'Sistem', 'berhasil' => $pulih,
            'deskripsi' => $deskripsi, 'meta' => ['alamat' => self::alamat()],
        ], []);
    }
}

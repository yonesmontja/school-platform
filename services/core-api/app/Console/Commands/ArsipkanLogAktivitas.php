<?php

namespace App\Console\Commands;

use App\Services\AuditTrail;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\File;

/**
 * Retensi Log Aktivitas: entri yang lebih tua dari batas simpan dipindah ke file arsip
 * (storage/app/arsip-log/*.jsonl.gz, ikut backup harian) lalu dihapus dari database.
 * Dijalankan harian oleh scheduler (routes/console.php).
 */
class ArsipkanLogAktivitas extends Command
{
    protected $signature = 'log:arsipkan {--bulan= : Simpan log di database selama N bulan (bawaan LOG_AKTIVITAS_SIMPAN_BULAN)}';

    protected $description = 'Pindahkan Log Aktivitas lama ke file arsip terkompresi';

    public function handle(): int
    {
        $bulan = (int) ($this->option('bulan') ?: config('app.log_aktivitas_simpan_bulan'));
        if ($bulan < 1) {
            $this->error('Batas simpan minimal 1 bulan.');
            return self::FAILURE;
        }

        $batas = now(config('app.zona_sekolah'))->subMonths($bulan)->startOfDay();
        $maksId = DB::table('log_aktivitas')->where('waktu', '<', $batas)->max('id');
        if (!$maksId) {
            $this->info("Tidak ada log sebelum {$batas->toDateString()}.");
            return self::SUCCESS;
        }

        $dir = storage_path('app/arsip-log');
        File::ensureDirectoryExists($dir);
        $file = $dir . '/log_aktivitas_sebelum_' . $batas->format('Y-m-d') . '_' . now()->format('YmdHis') . '.jsonl.gz';

        // Ditulis ke file sementara dulu: log baru dihapus setelah arsipnya utuh
        $gz = gzopen("{$file}.tmp", 'wb6');
        $jumlah = 0;
        DB::table('log_aktivitas')->where('waktu', '<', $batas)->where('id', '<=', $maksId)
            ->chunkById(500, function ($logs) use ($gz, &$jumlah) {
                $perubahan = DB::table('log_perubahan')->whereIn('id_log', $logs->pluck('id'))->orderBy('id')->get()->groupBy('id_log');
                foreach ($logs as $log) {
                    $baris = (array) $log;
                    $baris['meta'] = $log->meta ? json_decode($log->meta, true) : null;
                    $baris['perubahan'] = $perubahan->get($log->id, collect())->values();
                    gzwrite($gz, json_encode($baris, JSON_UNESCAPED_UNICODE) . "\n");
                    $jumlah++;
                }
            });
        gzclose($gz);
        rename("{$file}.tmp", $file);

        // log_perubahan ikut terhapus (cascade). Lewat query builder karena model LogAktivitas menolak hapus.
        DB::table('log_aktivitas')->where('waktu', '<', $batas)->where('id', '<=', $maksId)->delete();

        AuditTrail::catat([
            'user' => null, 'kategori' => 'SISTEM', 'aksi' => 'ARSIP', 'modul' => 'Log Aktivitas',
            'deskripsi' => "Arsip otomatis: {$jumlah} log sebelum {$batas->toDateString()} dipindah ke " . basename($file),
            'meta' => ['file' => basename($file), 'jumlah' => $jumlah, 'simpan_bulan' => $bulan],
        ], []);

        $this->info("{$jumlah} log diarsipkan ke {$file}");
        return self::SUCCESS;
    }
}

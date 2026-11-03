<?php

namespace App\Http\Middleware;

use App\Services\AuditTrail;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Mencatat setiap permintaan yang mengubah data (POST/PUT/PATCH/DELETE) oleh pengguna yang login,
 * beserta perubahan record yang terjadi selama permintaan itu. Permintaan yang gagal (ditolak/validasi)
 * juga dicatat sebagai percobaan gagal. Tindakan yang sudah dicatat sendiri oleh controller (login, logout,
 * event dari frontend) tidak dicatat dua kali.
 */
class CatatAktivitas
{
    private const MENGUBAH = ['POST', 'PUT', 'PATCH', 'DELETE'];

    public function handle(Request $request, Closure $next): Response
    {
        AuditTrail::mulaiPermintaan();
        $mulai = microtime(true);

        try {
            $response = $next($request);
        } catch (\Throwable $e) {
            AuditTrail::selesaiPermintaan();
            throw $e;
        }

        $status = $response->getStatusCode();
        $user = $request->user();
        if ($status >= 400) AuditTrail::buangAntrean(); // transaksinya dibatalkan, perubahan tidak terjadi

        if (!AuditTrail::sudahDicatat() && $user && in_array($request->method(), self::MENGUBAH, true) && !$request->is('api/log-aktivitas/*')) {
            $rute = AuditTrail::uraikanRute($request);
            AuditTrail::catat([
                'user' => $user,
                'kategori' => $rute['kategori'],
                'aksi' => $rute['aksi'],
                'modul' => $rute['modul'],
                'deskripsi' => $rute['teks'] . ($status >= 400 ? ' — gagal: ' . $this->alasan($response) : ''),
                'berhasil' => $status < 400,
                'metode' => $request->method(),
                'rute' => '/' . $request->path(),
                'status_http' => $status,
                'durasi_ms' => (int) round((microtime(true) - $mulai) * 1000),
                'meta' => ['isian' => AuditTrail::sensor($request->except(['_token']))],
            ]);
        } elseif (!AuditTrail::sudahDicatat() && $user && $sisa = AuditTrail::selesaiPermintaan()) {
            // Permintaan baca yang ternyata mengubah data (mis. membuat pengaturan bawaan)
            AuditTrail::catat([
                'user' => $user, 'kategori' => 'SISTEM', 'aksi' => 'OTOMATIS', 'modul' => $sisa[0]['modul'],
                'deskripsi' => 'Data dibuat otomatis saat membuka ' . $request->path(),
                'metode' => $request->method(), 'rute' => '/' . $request->path(), 'status_http' => $status,
            ], $sisa);
        }

        AuditTrail::selesaiPermintaan();
        return $response;
    }

    private function alasan(Response $response): string
    {
        $data = json_decode((string) $response->getContent(), true);
        $pesan = $data['message'] ?? null;
        if (!empty($data['errors']) && is_array($data['errors'])) $pesan = collect($data['errors'])->flatten()->first() ?? $pesan;
        return mb_substr((string) ($pesan ?: "HTTP {$response->getStatusCode()}"), 0, 300);
    }
}

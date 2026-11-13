<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Batasi rute ke peran tertentu, mis. ->middleware('role:admin,kepsek').
 * Akun nonaktif selalu ditolak meski token masih berlaku.
 *
 * Akun peninjau (wakakur, wakasis, yayasan) hanya membaca: boleh membuka rute baca milik admin/kepala sekolah,
 * sedangkan setiap permintaan yang mengubah data ditolak, kecuali urusan akunnya sendiri di bawah ini.
 */
class EnsureRole
{
    private const BOLEH_PENINJAU = ['api/akun/password', 'api/logout', 'api/log-aktivitas/event', 'api/notifikasi/baca',
        // Pencarian pustaka dokumen memakai POST tetapi hanya membaca
        'api/dokumen-rujukan/cari'];

    public function handle(Request $request, Closure $next, string ...$roles): Response
    {
        $user = $request->user();

        if (!$user || !$user->aktif) {
            $user?->currentAccessToken()?->delete();
            return response()->json(['message' => 'Akun tidak aktif. Hubungi admin sekolah.'], 401);
        }

        if ($user->isPeninjau()) {
            if (!$request->isMethodSafe() && !in_array($request->route()?->uri(), self::BOLEH_PENINJAU, true)) {
                return response()->json(['message' => 'Akun peninjau hanya dapat melihat data. Perubahan tidak disimpan.'], 403);
            }
            if ($roles && !in_array($user->role, $roles, true) && !array_intersect(['admin', 'kepsek'], $roles)) {
                return response()->json(['message' => 'Anda tidak memiliki akses untuk tindakan ini.'], 403);
            }
            return $next($request);
        }

        if ($roles && !in_array($user->role, $roles, true)) {
            return response()->json(['message' => 'Anda tidak memiliki akses untuk tindakan ini.'], 403);
        }

        return $next($request);
    }
}

<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Batasi rute ke peran tertentu, mis. ->middleware('role:admin,kepsek').
 * Akun nonaktif selalu ditolak meski token masih berlaku.
 */
class EnsureRole
{
    public function handle(Request $request, Closure $next, string ...$roles): Response
    {
        $user = $request->user();

        if (!$user || !$user->aktif) {
            $user?->currentAccessToken()?->delete();
            return response()->json(['message' => 'Akun tidak aktif. Hubungi admin sekolah.'], 401);
        }

        if ($roles && !in_array($user->role, $roles, true)) {
            return response()->json(['message' => 'Anda tidak memiliki akses untuk tindakan ini.'], 403);
        }

        return $next($request);
    }
}

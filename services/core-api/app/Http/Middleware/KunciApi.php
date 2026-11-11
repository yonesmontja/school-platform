<?php

namespace App\Http\Middleware;

use App\Models\ApiKlien;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/** Autentikasi API render v1 dengan kunci API (Authorization: Bearer srk_… atau X-API-Key: srk_…). */
class KunciApi
{
    public function handle(Request $request, Closure $next): Response
    {
        $kunci = $request->bearerToken() ?: $request->header('X-API-Key');
        $klien = ApiKlien::dariKunci($kunci);
        if (!$klien) {
            return response()->json(['error' => ['code' => 'unauthorized', 'message' => 'Kunci API tidak valid atau sudah dicabut.']], 401);
        }
        if (!$klien->terakhir_dipakai || $klien->terakhir_dipakai->lt(now()->subMinute())) {
            $klien->forceFill(['terakhir_dipakai' => now()])->saveQuietly();
        }
        $request->attributes->set('klien', $klien);
        return $next($request);
    }
}

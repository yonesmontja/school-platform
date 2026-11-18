<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Batasi rute Administrasi Sekolah ke akun yang diberi submodulnya:
 * `administrasi` = punya minimal satu submodul, `administrasi:SURAT` = punya submodul SURAT.
 * Pasang setelah middleware `role` (akun nonaktif & perubahan oleh peninjau sudah ditolak di sana).
 */
class AksesAdministrasi
{
    public function handle(Request $request, Closure $next, ?string $kode = null): Response
    {
        if (!$request->user()?->bolehAdministrasi($kode)) {
            return response()->json(['message' => 'Submodul administrasi ini belum diberikan kepada akun Anda. Hubungi kepala sekolah.'], 403);
        }
        return $next($request);
    }
}

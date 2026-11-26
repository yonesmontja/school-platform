<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\BerkasTtd;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

/** Gambar tanda tangan untuk dokumen cetak staf; akun siswa/orang tua dan pengunjung tanpa login ditolak. */
class TandaTanganController extends Controller
{
    private const PORTAL = ['siswa', 'ortu'];

    public function tampil(Request $request, string $filename)
    {
        $path = BerkasTtd::path($filename);
        if ($path) {
            $user = auth('sanctum')->user();
            abort_unless($user, 401, 'Masuk dulu untuk memuat tanda tangan.');
            abort_if(!$user->aktif || in_array($user->role, self::PORTAL, true), 403, 'Tanda tangan hanya dimuat untuk dokumen cetak staf sekolah.');
            return response()->file($path, ['Cache-Control' => 'private, no-store', 'X-Content-Type-Options' => 'nosniff']);
        }
        // Peralihan: berkas lama yang belum dipindahkan (php artisan ttd:amankan) masih di disk publik
        $lama = BerkasTtd::MAP . '/' . basename($filename);
        abort_unless(preg_match('/^[A-Za-z0-9_.-]+\.(png|jpe?g)$/i', basename($filename)) && Storage::disk('public')->exists($lama), 404, 'File tanda tangan tidak ditemukan di server.');
        return response()->file(Storage::disk('public')->path($lama));
    }
}

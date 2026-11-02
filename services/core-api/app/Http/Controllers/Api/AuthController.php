<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Str;
use Illuminate\Validation\Rules\Password;
use Illuminate\Validation\ValidationException;

class AuthController extends Controller
{
    // Pendaftaran publik ditiadakan: akun dibuat Admin lewat Manajemen Pengguna

    /**
     * Login dengan email atau username (siswa memakai NISN sebagai username).
     */
    public function login(Request $request)
    {
        $request->validate([
            'login' => 'required_without:email|nullable|string|max:255',
            'email' => 'required_without:login|nullable|string|max:255',
            'password' => 'required|string',
        ]);

        $identitas = trim((string) ($request->login ?? $request->email));
        // Dua lapis: 5 gagal/menit per akun+IP (salah ketik biasa), dan 20 gagal/15 menit per akun
        // dari IP mana pun (menebak sandi dari banyak alamat sekaligus).
        $kunciLimit = 'login:' . Str::lower($identitas) . '|' . $request->ip();
        $kunciAkun = 'login-akun:' . Str::lower($identitas);
        foreach ([$kunciLimit => 5, $kunciAkun => 20] as $kunci => $maks) {
            if (RateLimiter::tooManyAttempts($kunci, $maks)) {
                $menit = (int) ceil(RateLimiter::availableIn($kunci) / 60);
                throw ValidationException::withMessages(['login' => ["Terlalu banyak percobaan login. Coba lagi dalam {$menit} menit."]]);
            }
        }

        $user = User::where('email', $identitas)->orWhere('username', $identitas)->first();
        if (!$user || !Hash::check($request->password, $user->password)) {
            RateLimiter::hit($kunciLimit, 60);
            RateLimiter::hit($kunciAkun, 15 * 60);
            throw ValidationException::withMessages(['login' => ['Email/username atau kata sandi salah.']]);
        }
        if (!$user->aktif) {
            throw ValidationException::withMessages(['login' => ['Akun Anda dinonaktifkan. Hubungi admin sekolah.']]);
        }

        RateLimiter::clear($kunciLimit);
        RateLimiter::clear($kunciAkun);
        // Token yang sudah kedaluwarsa (lihat sanctum.expiration) dibersihkan agar tabel tidak menumpuk
        if ($menit = config('sanctum.expiration')) {
            $user->tokens()->where('created_at', '<', now()->subMinutes($menit))->delete();
        }
        $user->forceFill(['login_terakhir' => now()])->save();
        $token = $user->createToken('auth_token')->plainTextToken;

        return response()->json([
            'status' => 'success',
            'message' => 'Login berhasil',
            'data' => $user->profilAkses(),
            'access_token' => $token,
            'token_type' => 'Bearer',
        ]);
    }

    /**
     * Profil & cakupan akses akun yang sedang login (kelas binaan, mapel diampu, siswa terjangkau).
     */
    public function me(Request $request)
    {
        return response()->json(['data' => $request->user()->profilAkses()]);
    }

    public function gantiPassword(Request $request)
    {
        $request->validate([
            'password_lama' => 'required|string',
            'password_baru' => ['required', 'string', 'confirmed', 'different:password_lama', Password::min(8)->letters()->numbers()],
        ], [
            'password_baru.different' => 'Kata sandi baru harus berbeda dari yang lama.',
            'password_baru.confirmed' => 'Konfirmasi kata sandi baru tidak cocok.',
        ]);

        $user = $request->user();
        if (!Hash::check($request->password_lama, $user->password)) {
            throw ValidationException::withMessages(['password_lama' => ['Kata sandi lama salah.']]);
        }

        $user->forceFill(['password' => $request->password_baru, 'wajib_ganti_password' => false])->save();
        // Keluarkan sesi lain; sesi saat ini tetap berlaku
        $user->tokens()->where('id', '!=', $user->currentAccessToken()->id)->delete();

        return response()->json(['success' => true, 'message' => 'Kata sandi berhasil diganti.', 'data' => $user->profilAkses()]);
    }

    public function logout(Request $request)
    {
        $request->user()->currentAccessToken()->delete();

        return response()->json(['status' => 'success', 'message' => 'Logged out successfully']);
    }
}

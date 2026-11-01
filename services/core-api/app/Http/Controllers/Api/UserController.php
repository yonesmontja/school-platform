<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\MasterOrtu;
use App\Models\MasterWali;
use App\Models\Student;
use App\Models\Teacher;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/**
 * Manajemen akun pengguna (khusus Admin).
 */
class UserController extends Controller
{
    private const RELASI = ['guru:id_guru,nama_guru', 'siswa:id_siswa,nisn,nama_siswa,id_kelas', 'ortu:id_ortu,nama_ayah,nama_ibu', 'wali:id_wali,nama_wali'];

    public function index()
    {
        return response()->json([
            'data' => User::with(self::RELASI)->orderByRaw("CASE role WHEN 'admin' THEN 1 WHEN 'kepsek' THEN 2 WHEN 'guru' THEN 3 WHEN 'ortu' THEN 4 ELSE 5 END")->orderBy('name')->get(),
            'referensi' => [
                'teachers' => Teacher::orderBy('nama_guru')->get(['id_guru', 'nama_guru', 'nip_nik']),
                'students' => Student::with('kelas:id_kelas,nama_kelas')->orderBy('nama_siswa')->get(['id_siswa', 'nisn', 'nama_siswa', 'id_kelas']),
                'ortu' => MasterOrtu::orderBy('nama_ayah')->get(['id_ortu', 'nama_ayah', 'nama_ibu']),
                'wali' => MasterWali::orderBy('nama_wali')->get(['id_wali', 'nama_wali']),
            ],
        ]);
    }

    private function rules(?User $user = null): array
    {
        $id = $user?->id;
        return [
            'name' => 'required|string|max:255',
            'role' => ['required', Rule::in(User::ROLES)],
            'email' => ['nullable', 'email', 'max:255', Rule::unique('users', 'email')->ignore($id), 'required_without:username'],
            'username' => ['nullable', 'string', 'max:50', 'regex:/^[A-Za-z0-9._-]+$/', Rule::unique('users', 'username')->ignore($id), 'required_without:email'],
            'password' => 'nullable|string|min:8|max:100',
            'id_guru' => ['nullable', 'exists:teachers,id_guru', Rule::unique('users', 'id_guru')->ignore($id)],
            'id_siswa' => ['nullable', 'required_if:role,siswa', 'exists:students,id_siswa', Rule::unique('users', 'id_siswa')->ignore($id)],
            'id_ortu' => 'nullable|exists:master_ortu,id_ortu',
            'id_wali' => 'nullable|exists:master_wali,id_wali',
            'aktif' => 'nullable|boolean',
            'wajib_ganti_password' => 'nullable|boolean',
        ];
    }

    private function pesan(): array
    {
        return [
            'email.required_without' => 'Isi email atau username untuk login.',
            'username.required_without' => 'Isi username atau email untuk login.',
            'username.regex' => 'Username hanya boleh huruf, angka, titik, minus, dan garis bawah.',
            'id_siswa.required_if' => 'Akun siswa harus dikaitkan dengan data siswa.',
            'id_guru.unique' => 'Guru ini sudah memiliki akun.',
            'id_siswa.unique' => 'Siswa ini sudah memiliki akun.',
        ];
    }

    // Kaitan data hanya disimpan sesuai peran agar akses tidak bocor (mis. akun guru tidak membawa id_siswa)
    private function dataAkun(Request $request): array
    {
        $role = $request->role;
        if ($role === 'ortu' && !$request->id_ortu && !$request->id_wali) {
            throw ValidationException::withMessages(['id_ortu' => 'Akun orang tua harus dikaitkan dengan data orang tua atau wali.']);
        }
        return [
            'name' => trim($request->name),
            'role' => $role,
            'email' => $request->email ?: null,
            'username' => $request->username ?: null,
            'id_guru' => in_array($role, ['guru', 'kepsek', 'admin'], true) ? ($request->id_guru ?: null) : null,
            'id_siswa' => $role === 'siswa' ? $request->id_siswa : null,
            'id_ortu' => $role === 'ortu' ? ($request->id_ortu ?: null) : null,
            'id_wali' => $role === 'ortu' ? ($request->id_wali ?: null) : null,
            'aktif' => $request->boolean('aktif', true),
        ];
    }

    public function store(Request $request)
    {
        $request->validate($this->rules(), $this->pesan());
        $password = $request->password ?: self::passwordAcak();
        $user = User::create([
            ...$this->dataAkun($request),
            'password' => $password,
            'wajib_ganti_password' => $request->boolean('wajib_ganti_password', true),
        ]);

        return response()->json([
            'success' => true,
            'message' => 'Akun dibuat.',
            'data' => $user->load(self::RELASI),
            'kredensial' => ['nama' => $user->name, 'login' => $user->username ?: $user->email, 'password' => $password],
        ], 201);
    }

    public function update(Request $request, $id)
    {
        $user = User::findOrFail($id);
        $request->validate($this->rules($user), $this->pesan());
        $data = $this->dataAkun($request);

        if ($user->id === $request->user()->id && ($data['role'] !== 'admin' || !$data['aktif'])) {
            throw ValidationException::withMessages(['role' => 'Anda tidak dapat menurunkan peran atau menonaktifkan akun sendiri.']);
        }
        if ($user->isAdmin() && ($data['role'] !== 'admin' || !$data['aktif'])) $this->pastikanAdminLain($user);

        if ($request->filled('password')) {
            $data['password'] = $request->password;
            $data['wajib_ganti_password'] = $request->boolean('wajib_ganti_password', true);
        } elseif ($request->has('wajib_ganti_password')) {
            $data['wajib_ganti_password'] = $request->boolean('wajib_ganti_password');
        }

        $user->update($data);
        // Perubahan peran/status langsung berlaku: token lama dicabut
        if ($user->wasChanged(['role', 'aktif', 'password', 'id_guru', 'id_siswa', 'id_ortu', 'id_wali']) && $user->id !== $request->user()->id) {
            $user->tokens()->delete();
        }

        return response()->json(['success' => true, 'message' => 'Akun diperbarui.', 'data' => $user->load(self::RELASI)]);
    }

    public function destroy(Request $request, $id)
    {
        $user = User::findOrFail($id);
        if ($user->id === $request->user()->id) {
            return response()->json(['message' => 'Anda tidak dapat menghapus akun sendiri.'], 422);
        }
        if ($user->isAdmin()) $this->pastikanAdminLain($user);

        $user->tokens()->delete();
        $user->delete();

        return response()->json(['success' => true, 'message' => 'Akun dihapus.']);
    }

    public function resetPassword($id)
    {
        $user = User::findOrFail($id);
        $password = self::passwordAcak();
        $user->forceFill(['password' => $password, 'wajib_ganti_password' => true])->save();
        $user->tokens()->delete();

        return response()->json([
            'success' => true,
            'message' => 'Kata sandi direset. Berikan kata sandi sementara ini kepada pemilik akun.',
            'kredensial' => ['nama' => $user->name, 'login' => $user->username ?: $user->email, 'password' => $password],
        ]);
    }

    /**
     * Buat akun massal untuk guru / siswa / orang tua yang belum punya akun.
     * Kata sandi sementara acak ditampilkan sekali dan wajib diganti saat login pertama.
     */
    public function generate(Request $request)
    {
        $request->validate(['jenis' => ['required', Rule::in(['guru', 'siswa', 'ortu'])]]);
        $dipakai = User::whereNotNull('username')->pluck('username')->map(fn($u) => Str::lower($u))->flip()->all();
        $usernameUnik = function (string $dasar) use (&$dipakai) {
            $dasar = Str::lower(preg_replace('/[^A-Za-z0-9._-]/', '', $dasar)) ?: 'akun';
            $u = $dasar; $i = 2;
            while (isset($dipakai[$u])) $u = $dasar . $i++;
            $dipakai[$u] = true;
            return $u;
        };

        $calon = match ($request->jenis) {
            'guru' => Teacher::whereNotIn('id_guru', User::whereNotNull('id_guru')->pluck('id_guru'))->orderBy('nama_guru')->get()
                ->map(fn($t) => ['name' => $t->nama_guru, 'role' => 'guru', 'id_guru' => $t->id_guru, 'username' => $usernameUnik($t->nip_nik ?: 'guru.' . $t->id_guru)]),
            'siswa' => Student::whereNotIn('id_siswa', User::whereNotNull('id_siswa')->pluck('id_siswa'))->orderBy('nama_siswa')->get()
                ->map(fn($s) => ['name' => $s->nama_siswa, 'role' => 'siswa', 'id_siswa' => $s->id_siswa, 'username' => $usernameUnik($s->nisn ?: $s->id_siswa)]),
            'ortu' => $this->calonOrtu($usernameUnik),
        };

        $hasil = DB::transaction(function () use ($calon) {
            return $calon->map(function ($c) {
                $password = self::passwordAcak();
                User::create([...$c, 'password' => $password, 'aktif' => true, 'wajib_ganti_password' => true]);
                return ['nama' => $c['name'], 'role' => $c['role'], 'login' => $c['username'], 'password' => $password];
            })->values();
        });

        return response()->json([
            'success' => true,
            'message' => $hasil->isEmpty() ? 'Semua sudah memiliki akun.' : "{$hasil->count()} akun dibuat.",
            'kredensial' => $hasil,
        ]);
    }

    // Satu akun per data orang tua/wali yang memiliki anak terdaftar
    private function calonOrtu(callable $usernameUnik)
    {
        $sudahOrtu = User::whereNotNull('id_ortu')->pluck('id_ortu')->all();
        $sudahWali = User::whereNotNull('id_wali')->pluck('id_wali')->all();
        $anak = Student::orderBy('nama_siswa')->get(['id_siswa', 'nisn', 'nama_siswa', 'id_ortu', 'id_wali']);

        $ortu = MasterOrtu::whereIn('id_ortu', $anak->pluck('id_ortu')->filter())->whereNotIn('id_ortu', $sudahOrtu)->get()->map(function ($o) use ($anak, $usernameUnik) {
            $a = $anak->firstWhere('id_ortu', $o->id_ortu);
            return ['name' => $o->nama_ayah ?: $o->nama_ibu ?: "Orang tua {$a->nama_siswa}", 'role' => 'ortu', 'id_ortu' => $o->id_ortu, 'username' => $usernameUnik('ortu.' . ($a->nisn ?: $a->id_siswa))];
        });
        $wali = MasterWali::whereIn('id_wali', $anak->pluck('id_wali')->filter())->whereNotIn('id_wali', $sudahWali)->get()->map(function ($w) use ($anak, $usernameUnik) {
            $a = $anak->firstWhere('id_wali', $w->id_wali);
            return ['name' => $w->nama_wali, 'role' => 'ortu', 'id_wali' => $w->id_wali, 'username' => $usernameUnik('wali.' . ($a->nisn ?: $a->id_siswa))];
        });

        return $ortu->concat($wali);
    }

    private function pastikanAdminLain(User $user): void
    {
        $adminLain = User::where('role', 'admin')->where('aktif', true)->where('id', '!=', $user->id)->exists();
        if (!$adminLain) throw ValidationException::withMessages(['role' => 'Harus ada minimal satu admin aktif.']);
    }

    // Kata sandi sementara mudah dibaca (tanpa karakter mirip seperti 0/O, 1/l), selalu berisi huruf & angka
    public static function passwordAcak(int $panjang = 10): string
    {
        $huruf = 'abcdefghjkmnpqrstuvwxyz';
        $angka = '23456789';
        $semua = $huruf . strtoupper($huruf) . $angka;
        $p = $huruf[random_int(0, strlen($huruf) - 1)] . $angka[random_int(0, strlen($angka) - 1)];
        for ($i = 2; $i < $panjang; $i++) $p .= $semua[random_int(0, strlen($semua) - 1)];
        return str_shuffle($p);
    }
}

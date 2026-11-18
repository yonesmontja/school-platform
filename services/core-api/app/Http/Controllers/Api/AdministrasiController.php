<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\OperatorSekolah;
use App\Models\User;
use App\Support\Administrasi;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/**
 * Administrasi Sekolah, Fase 26 Tahap A: ringkasan submodul untuk akun yang berhak, dan penunjukan operator
 * oleh kepala sekolah. Admin & peninjau hanya melihat daftar operator; menunjuk, mengubah, mencabut = kepala sekolah.
 */
class AdministrasiController extends Controller
{
    /** Peran yang boleh ditunjuk: guru (merangkap) dan operator (staf TU). Admin/kepsek/peninjau sudah melihat semua. */
    private const BOLEH_DITUNJUK = ['guru', User::OPERATOR];

    public function ringkasan(Request $request)
    {
        $u = $request->user();
        $milik = $u->submodulAdministrasi();
        $submodul = collect(Administrasi::SUBMODUL)->map(fn($s, $kode) => $s + [
            'kode' => $kode,
            'boleh' => in_array($kode, $milik, true),
            'tersedia' => in_array($kode, Administrasi::TERSEDIA, true),
        ])->values();

        return response()->json(['data' => [
            'submodul' => $submodul,
            'kelola_operator' => $u->isKepsek(),
            'lihat_operator' => $u->isPengelola(),
            'jumlah_operator' => $u->isPengelola() ? OperatorSekolah::count() : null,
            'penunjukan' => $u->isPengelola() ? null : $u->penunjukanOperator()->with('penunjuk:id,name')->first(['id', 'id_user', 'submodul', 'catatan', 'ditunjuk_oleh', 'updated_at']),
        ]]);
    }

    public function operator()
    {
        $data = OperatorSekolah::with(['user:id,name,username,email,role,aktif,id_guru', 'penunjuk:id,name'])
            ->get()
            ->sortBy(fn($o) => $o->user?->name)
            ->values()
            ->map(fn($o) => [
                'id' => $o->id,
                'id_user' => $o->id_user,
                'submodul' => Administrasi::rapikan((array) $o->submodul),
                'catatan' => $o->catatan,
                'user' => $o->user,
                'penunjuk' => $o->penunjuk?->name,
                'diperbarui' => $o->updated_at,
            ]);
        return response()->json(['data' => $data]);
    }

    /** Akun staf aktif yang bisa ditunjuk dan belum menjadi operator. */
    public function kandidat()
    {
        $sudah = OperatorSekolah::pluck('id_user');
        $data = User::whereIn('role', self::BOLEH_DITUNJUK)->where('aktif', true)->whereNotIn('id', $sudah)
            ->orderBy('name')->get(['id', 'name', 'username', 'email', 'role']);
        return response()->json(['data' => $data]);
    }

    public function tunjuk(Request $request)
    {
        $data = $this->validasi($request, true);
        $user = User::findOrFail($data['id_user']);
        if (!$user->aktif || !in_array($user->role, self::BOLEH_DITUNJUK, true)) {
            throw ValidationException::withMessages(['id_user' => 'Hanya akun guru atau operator yang aktif yang bisa ditunjuk.']);
        }
        $op = OperatorSekolah::create([
            'id_user' => $user->id,
            'submodul' => $data['submodul'],
            'catatan' => $data['catatan'] ?? null,
            'ditunjuk_oleh' => $request->user()->id,
        ]);
        return response()->json(['message' => "{$user->name} ditunjuk sebagai operator administrasi.", 'data' => $op], 201);
    }

    public function ubah(Request $request, int $id)
    {
        $op = OperatorSekolah::findOrFail($id);
        $data = $this->validasi($request, false);
        $op->update(['submodul' => $data['submodul'], 'catatan' => $data['catatan'] ?? null, 'ditunjuk_oleh' => $request->user()->id]);
        return response()->json(['message' => 'Submodul operator diperbarui.', 'data' => $op->fresh()]);
    }

    public function cabut(int $id)
    {
        $op = OperatorSekolah::with('user:id,name')->findOrFail($id);
        $nama = $op->user?->name;
        $op->delete();
        return response()->json(['message' => "Penunjukan {$nama} sebagai operator dicabut."]);
    }

    private function validasi(Request $request, bool $baru): array
    {
        $data = $request->validate([
            'id_user' => $baru ? ['required', 'integer', 'exists:users,id', Rule::unique('operator_sekolah', 'id_user')] : ['nullable'],
            'submodul' => ['required', 'array', 'min:1'],
            'submodul.*' => ['string', Rule::in(Administrasi::kode())],
            'catatan' => ['nullable', 'string', 'max:500'],
        ], [
            'id_user.unique' => 'Akun ini sudah menjadi operator; ubah submodulnya dari daftar.',
            'submodul.required' => 'Pilih minimal satu submodul.',
            'submodul.min' => 'Pilih minimal satu submodul.',
        ]);
        $data['submodul'] = Administrasi::rapikan($data['submodul']);
        return $data;
    }
}

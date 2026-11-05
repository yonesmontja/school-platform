<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\MasterOrtu;
use App\Models\MasterPekerjaan;
use App\Models\MasterWali;
use App\Models\Student;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/**
 * Master Orang Tua & Wali: data keluarga siswa beserta anak yang terhubung.
 * {jenis} = ortu (ayah & ibu kandung) atau wali. Data ini dipakai untuk akun portal orang tua
 * dan nomor WhatsApp kabar remedial/presensi.
 */
class KeluargaController extends Controller
{
    private const JENIS = [
        'ortu' => ['model' => MasterOrtu::class, 'kunci' => 'id_ortu', 'awalan' => 'ORT-'],
        'wali' => ['model' => MasterWali::class, 'kunci' => 'id_wali', 'awalan' => 'WLI-'],
    ];

    public function index()
    {
        $anak = fn($q) => $q->select('id_siswa', 'nisn', 'nama_siswa', 'id_kelas', 'id_ortu', 'id_wali')->with('kelas:id_kelas,nama_kelas')->orderBy('nama_siswa');
        $akun = fn($q) => $q->select('id', 'username', 'aktif', 'id_ortu', 'id_wali');

        return response()->json([
            'ortu' => MasterOrtu::with(['anak' => $anak, 'akun' => $akun])->orderBy('nama_ayah')->orderBy('nama_ibu')->get(),
            'wali' => MasterWali::with(['anak' => $anak, 'akun' => $akun])->orderBy('nama_wali')->get(),
            'pekerjaan' => MasterPekerjaan::orderBy('id_pekerjaan')->get(['id_pekerjaan', 'nama_pekerjaan']),
            'siswa' => Student::with('kelas:id_kelas,nama_kelas')->orderBy('nama_siswa')
                ->get(['id_siswa', 'nisn', 'nama_siswa', 'id_kelas', 'id_ortu', 'id_wali']),
        ]);
    }

    public function store(Request $request, string $jenis)
    {
        $cfg = $this->cfg($jenis);
        $data = $this->validasi($request, $jenis);

        $baris = DB::transaction(function () use ($cfg, $data) {
            $baris = $cfg['model']::create([...$data['isian'], $cfg['kunci'] => $cfg['awalan'] . Str::upper(Str::random(8))]);
            $this->hubungkanAnak($cfg['kunci'], $baris->getKey(), $data['anak']);
            return $baris;
        });

        return response()->json(['message' => 'Data keluarga ditambahkan', 'data' => $baris], 201);
    }

    public function update(Request $request, string $jenis, string $id)
    {
        $cfg = $this->cfg($jenis);
        $baris = $cfg['model']::findOrFail($id);
        $data = $this->validasi($request, $jenis);

        DB::transaction(function () use ($cfg, $baris, $data) {
            $baris->update($data['isian']);
            $this->hubungkanAnak($cfg['kunci'], $baris->getKey(), $data['anak']);
        });

        return response()->json(['message' => 'Data keluarga diperbarui', 'data' => $baris->fresh()]);
    }

    public function destroy(string $jenis, string $id)
    {
        $cfg = $this->cfg($jenis);
        $baris = $cfg['model']::findOrFail($id);
        if ($baris->akun()->exists()) {
            throw ValidationException::withMessages(['akun' => 'Data ini terhubung ke akun portal. Hapus atau ubah akunnya dulu di Manajemen Pengguna.']);
        }

        DB::transaction(function () use ($cfg, $baris) {
            // Lepas lewat model agar perubahan relasi siswa ikut tercatat di Log Aktivitas
            $this->hubungkanAnak($cfg['kunci'], $baris->getKey(), []);
            $baris->delete();
        });

        return response()->json(['message' => 'Data keluarga dihapus']);
    }

    private function cfg(string $jenis): array
    {
        abort_unless(isset(self::JENIS[$jenis]), 404);
        return self::JENIS[$jenis];
    }

    private function validasi(Request $request, string $jenis): array
    {
        $pekerjaan = ['nullable', 'string', Rule::exists('master_pekerjaan', 'id_pekerjaan')];
        $wa = ['nullable', 'string', 'max:20', 'regex:/^\+?[0-9 \-]{8,20}$/'];
        $aturan = $jenis === 'ortu' ? [
            'nama_ayah' => 'nullable|string|max:150|required_without:nama_ibu',
            'nama_ibu' => 'nullable|string|max:150|required_without:nama_ayah',
            'id_pekerjaan_ayah' => $pekerjaan,
            'id_pekerjaan_ibu' => $pekerjaan,
            'jalan_ortu' => 'nullable|string|max:255',
        ] : [
            'nama_wali' => 'required|string|max:150',
            'id_pekerjaan_wali' => $pekerjaan,
            'jalan_wali' => 'nullable|string|max:255',
        ];
        $valid = $request->validate([...$aturan, 'no_wa' => $wa, 'anak' => 'array', 'anak.*' => ['string', Rule::exists('students', 'id_siswa')]], [
            'nama_ayah.required_without' => 'Isi nama ayah atau nama ibu.',
            'nama_ibu.required_without' => 'Isi nama ayah atau nama ibu.',
            'no_wa.regex' => 'Nomor WhatsApp hanya boleh angka (boleh diawali +), 8–20 digit.',
        ]);

        $isian = collect($valid)->except('anak')->map(fn($v) => is_string($v) ? (trim($v) === '' ? null : trim($v)) : $v)->all();
        if (!empty($isian['no_wa'])) $isian['no_wa'] = preg_replace('/[ \-]/', '', $isian['no_wa']);

        return ['isian' => $isian, 'anak' => array_values(array_unique($valid['anak'] ?? []))];
    }

    // Samakan daftar anak: yang dicentang dihubungkan (pindah dari keluarga lain bila perlu), sisanya dilepas
    private function hubungkanAnak(string $kunci, string $id, array $anak): void
    {
        Student::where($kunci, $id)->whereNotIn('id_siswa', $anak)->get()->each(fn($s) => $s->update([$kunci => null]));
        Student::whereIn('id_siswa', $anak)->where(fn($q) => $q->whereNull($kunci)->orWhere($kunci, '!=', $id))
            ->get()->each(fn($s) => $s->update([$kunci => $id]));
    }
}

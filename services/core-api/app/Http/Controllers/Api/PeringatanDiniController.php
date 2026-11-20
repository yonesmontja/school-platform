<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Student;
use App\Models\TransPeringatanTindak;
use App\Services\AuditTrail;
use App\Services\PeringatanDiniService;
use Illuminate\Http\Request;

/**
 * Peringatan dini siswa untuk admin, kepala sekolah, peninjau (baca saja), dan wali kelas (kelas binaannya).
 */
class PeringatanDiniController extends Controller
{
    public function index(Request $request)
    {
        $request->validate(['id_kelas' => 'nullable|string|max:50', 'id_siswa' => 'nullable|string|max:50']);
        $u = $request->user();
        abort_unless($u->isPengelola() || $u->kelasBinaan(), 403, 'Peringatan dini hanya untuk pengelola sekolah dan wali kelas.');

        $layanan = new PeringatanDiniService();
        $semua = PeringatanDiniService::siswaUntuk($u);
        $siswa = $request->filled('id_kelas') ? $semua->where('id_kelas', $request->id_kelas)->values() : $semua;
        if ($request->filled('id_siswa')) {
            $siswa = $siswa->where('id_siswa', $request->id_siswa)->values();
            abort_if($siswa->isEmpty(), 403, 'Siswa ini di luar jangkauan akun Anda.');
        }
        $data = $layanan->hitung($siswa);

        $ringkas = collect(['TINGGI', 'SEDANG', 'PERHATIAN', 'AMAN'])->mapWithKeys(fn($t) => [$t => $data->where('tingkat', $t)->count()]);
        $kelas = $semua->map(fn($s) => ['id_kelas' => $s->id_kelas, 'nama_kelas' => $s->kelas?->nama_kelas])->unique('id_kelas')->sortBy('nama_kelas')->values();

        return response()->json([
            'data' => $data,
            'ringkas' => $ringkas,
            'kelas' => $kelas,
            'periode' => $layanan->periode(),
            'hari_presensi' => PeringatanDiniService::HARI_PRESENSI,
        ]);
    }

    /** Catat tindak lanjut untuk kumpulan alasan saat ini. */
    public function tindak(Request $request, string $id)
    {
        $request->validate(['catatan' => 'required|string|min:3|max:2000']);
        $u = $request->user();
        $siswa = PeringatanDiniService::siswaUntuk($u)->where('id_siswa', $id)->values();
        abort_if($siswa->isEmpty(), 403, 'Siswa ini di luar jangkauan akun Anda.');

        $layanan = new PeringatanDiniService();
        $hasil = $layanan->hitung($siswa)->first();
        $tindak = TransPeringatanTindak::create([
            'id_siswa' => $id,
            'id_periode' => $layanan->periode(),
            'kunci_alasan' => $hasil['kunci'],
            'alasan' => array_map(fn($a) => ['kode' => $a['kode'], 'label' => $a['label'], 'bobot' => $a['bobot']], $hasil['alasan']),
            'skor' => $hasil['skor'],
            'catatan' => trim($request->catatan),
            'dibuat_oleh' => $u->id,
        ]);
        AuditTrail::catat([
            'aksi' => 'TINDAK_PERINGATAN',
            'kategori' => 'DATA',
            'modul' => 'Peringatan Dini',
            'deskripsi' => "Mencatat tindak lanjut peringatan dini {$siswa->first()->nama_siswa} (skor {$hasil['skor']})",
            'meta' => ['id_siswa' => $id, 'id' => $tindak->id],
        ]);

        return response()->json(['success' => true, 'message' => 'Tindak lanjut tercatat.', 'data' => $layanan->hitung($siswa)->first()]);
    }

    /** Riwayat tindak lanjut seorang siswa. */
    public function riwayat(Request $request, string $id)
    {
        $u = $request->user();
        abort_if(PeringatanDiniService::siswaUntuk($u)->where('id_siswa', $id)->isEmpty(), 403, 'Siswa ini di luar jangkauan akun Anda.');
        return response()->json(['data' => TransPeringatanTindak::with('pembuat:id,name')->where('id_siswa', $id)->orderByDesc('created_at')->limit(50)->get()
            ->map(fn($t) => ['id' => $t->id, 'catatan' => $t->catatan, 'skor' => $t->skor, 'alasan' => $t->alasan, 'oleh' => $t->pembuat?->name, 'pada' => $t->created_at?->toIso8601String()])]);
    }
}

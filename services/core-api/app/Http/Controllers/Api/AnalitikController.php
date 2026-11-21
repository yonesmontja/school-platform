<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Classes;
use App\Models\Subject;
use App\Services\AnalitikAIService;
use App\Services\AnalitikLintasSemester;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * Analitik lintas semester: tren nilai, TP yang lemah lintas angkatan, perbandingan rombel, siswa yang menurun,
 * dan saran pengajaran ulang dari AI.
 * Akses: pengelola (semua mapel & siswa); guru: mapel yang diampunya, dan daftar siswa menurun untuk kelas binaannya.
 */
class AnalitikController extends Controller
{
    private function batas(Request $request): array
    {
        $u = $request->user();
        if ($u->isPengelola()) return ['mapel_boleh' => null, 'kelas_siswa' => null];
        abort_unless($u->isGuru() && ($u->mapelDiampu() || $u->kelasBinaan()), 403, 'Analitik hanya untuk pengelola sekolah dan guru.');
        return ['mapel_boleh' => $u->mapelDiampu(), 'kelas_siswa' => $u->kelasBinaan()];
    }

    public function index(Request $request, AnalitikLintasSemester $analitik)
    {
        $request->validate(['id_mapel' => 'nullable|string|max:50', 'tingkat' => 'nullable|integer|min:1|max:12']);
        $batas = $this->batas($request);
        $hasil = $analitik->hitung($batas + $request->only(['id_mapel', 'tingkat']));

        $mapel = Subject::when($batas['mapel_boleh'] !== null, fn($q) => $q->whereIn('id_mapel', $batas['mapel_boleh'] ?: ['-']))
            ->orderBy('nama_mapel')->get(['id_mapel', 'nama_mapel']);
        $tingkat = Classes::whereNotNull('tingkat')->distinct()->orderBy('tingkat')->pluck('tingkat');
        return response()->json($hasil + ['pilihan' => ['mapel' => $mapel, 'tingkat' => $tingkat]]);
    }

    /** Saran pengajaran ulang untuk satu TP (kunci dari daftar `tp`). */
    public function saranTp(Request $request, AnalitikLintasSemester $analitik, AnalitikAIService $ai)
    {
        $request->validate([
            'kunci' => 'required|string|max:600',
            'ai_mode' => ['required', Rule::in([...AnalitikAIService::MODES, AnalitikAIService::MODE_LOKAL])],
        ]);
        $batas = $this->batas($request);
        $idMapel = explode('|', $request->kunci)[0];
        abort_if($batas['mapel_boleh'] !== null && !in_array($idMapel, $batas['mapel_boleh'], true), 403, 'Mapel ini di luar jangkauan akun Anda.');

        $tp = collect($analitik->hitung($batas + ['id_mapel' => $idMapel])['tp'])->firstWhere('kunci', $request->kunci);
        abort_unless($tp, 404, 'TP tidak ditemukan. Muat ulang halaman analitik.');
        $hasil = $ai->saranTp($tp, $request->ai_mode);
        if (!$hasil) return response()->json(['message' => $ai->galat() ?? 'AI belum berhasil menyusun saran.'], 422);
        return response()->json(['data' => $hasil]);
    }
}

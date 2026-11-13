<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Classes;
use App\Models\MasterPeriode;
use App\Models\SchoolSetting;
use App\Models\Subject;
use App\Services\ProgramAjarService;
use Illuminate\Http\Request;

/**
 * Prota & Promes (Fase 20): dokumen program yang hidup. Rencana dari ATP, realisasi dari jadwal, kalender minggu efektif
 * dari rentang semester dan hari libur. Hanya membaca, jadi terbuka untuk semua staf dan akun peninjau.
 */
class ProgramAjarController extends Controller
{
    public function __construct(private ProgramAjarService $program) {}

    public function referensi(Request $request)
    {
        $user = $request->user();
        $periode = MasterPeriode::orderByDesc('tahun_ajaran')->orderBy('semester')->get();
        return response()->json([
            'subjects' => Subject::orderBy('nama_mapel')->get(['id_mapel', 'nama_mapel', 'id_guru']),
            'classes' => Classes::orderBy('nama_kelas')->get(['id_kelas', 'nama_kelas']),
            'periode' => $periode->map(function ($p) {
                [$a, $z, $bawaan] = $p->rentang();
                return $p->only(['id_periode', 'tahun_ajaran', 'semester', 'status_aktif', 'minggu_tidak_efektif']) + ['tanggal_mulai' => $a->format('Y-m-d'), 'tanggal_selesai' => $z->format('Y-m-d'), 'rentang_bawaan' => $bawaan];
            })->values(),
            'tahun_ajaran' => $periode->pluck('tahun_ajaran')->unique()->values(),
            'mapel_diampu' => $user->isGuru() ? $user->mapelDiampu() : [],
            'settings' => SchoolSetting::first(),
        ]);
    }

    /** Kalender semester (admin & kepala sekolah): rentang tanggal dan minggu tidak efektif beserta keterangannya. */
    public function simpanKalender(Request $request, string $id)
    {
        $periode = MasterPeriode::findOrFail($id);
        $data = $request->validate([
            'tanggal_mulai' => 'required|date_format:Y-m-d',
            'tanggal_selesai' => 'required|date_format:Y-m-d|after:tanggal_mulai',
            'minggu_tidak_efektif' => 'nullable|array|max:30',
            'minggu_tidak_efektif.*.mulai' => 'required|date_format:Y-m-d',
            'minggu_tidak_efektif.*.keterangan' => 'required|string|max:120',
        ], ['minggu_tidak_efektif.*.keterangan.required' => 'Isi keterangan setiap minggu tidak efektif (mis. MPLS, Asesmen Sumatif).']);
        abort_if(\Carbon\Carbon::parse($data['tanggal_mulai'])->diffInDays($data['tanggal_selesai']) > 220, 422, 'Satu semester paling lama sekitar 7 bulan.');
        $tanda = collect($data['minggu_tidak_efektif'] ?? [])
            ->map(fn($m) => ['mulai' => \Carbon\Carbon::parse($m['mulai'])->startOfWeek()->format('Y-m-d'), 'keterangan' => trim($m['keterangan'])])
            ->unique('mulai')->sortBy('mulai')->values()->all();
        $periode->update(['tanggal_mulai' => $data['tanggal_mulai'], 'tanggal_selesai' => $data['tanggal_selesai'], 'minggu_tidak_efektif' => $tanda ?: null]);
        return response()->json(['success' => true, 'message' => 'Kalender semester disimpan.']);
    }

    public function promes(Request $request)
    {
        $data = $request->validate([
            'id_mapel' => 'required|exists:subjects,id_mapel',
            'id_kelas' => 'nullable|exists:classes,id_kelas',
            'id_periode' => 'required|exists:master_periode,id_periode',
        ]);
        return response()->json($this->program->promes(MasterPeriode::findOrFail($data['id_periode']), $data['id_mapel'], $data['id_kelas'] ?? null));
    }

    public function prota(Request $request)
    {
        $data = $request->validate([
            'id_mapel' => 'required|exists:subjects,id_mapel',
            'id_kelas' => 'nullable|exists:classes,id_kelas',
            'tahun_ajaran' => 'required|exists:master_periode,tahun_ajaran',
        ]);
        return response()->json($this->program->prota($data['tahun_ajaran'], $data['id_mapel'], $data['id_kelas'] ?? null));
    }
}

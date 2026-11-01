<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\MasterPeriode;
use App\Models\Student;
use Illuminate\Http\Request;

/**
 * Portal baca untuk siswa dan orang tua/wali: hanya data milik siswa yang terkait akun.
 */
class PortalController extends Controller
{
    public function anak(Request $request)
    {
        return response()->json([
            'siswa' => Student::with('kelas:id_kelas,nama_kelas')
                ->whereIn('id_siswa', $request->user()->siswaTerjangkau())
                ->orderBy('nama_siswa')
                ->get(['id_siswa', 'nisn', 'nama_siswa', 'id_kelas', 'jenis_kelamin']),
            'periodes' => MasterPeriode::orderByDesc('tahun_ajaran')->orderBy('semester')->get(),
        ]);
    }

    /**
     * Data rapor satu siswa (bentuk sama dengan /rapor/data agar perhitungan di frontend identik).
     * Narasi jurnal negatif tidak ditampilkan; skornya tetap dikirim agar nilai akhir sama dengan rapor guru.
     */
    public function rapor(Request $request)
    {
        $request->validate([
            'id_siswa' => 'required|string',
            'id_periode' => 'required|exists:master_periode,id_periode',
        ]);
        abort_unless(in_array($request->id_siswa, $request->user()->siswaTerjangkau(), true), 403, 'Data siswa ini tidak dapat diakses dari akun Anda.');

        $siswa = Student::find($request->id_siswa);
        if (!$siswa?->id_kelas) {
            return response()->json(['message' => 'Siswa belum terdaftar di kelas mana pun.'], 422);
        }

        $data = RaporController::kumpulkanData($siswa->id_kelas, $request->id_periode, [$siswa->id_siswa]);
        $data['jurnal'] = $data['jurnal']->map(function ($j) {
            $total = $j->val_S + $j->val_T + $j->val_N + $j->val_K + $j->val_M;
            $item = $j->toArray();
            $item['positif'] = $total >= 0;
            if ($total < 0) $item['narasi_kejadian'] = null;
            return $item;
        })->values();

        return response()->json($data);
    }
}

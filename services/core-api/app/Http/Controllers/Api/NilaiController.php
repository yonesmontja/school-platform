<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Classes;
use App\Models\MasterMBK;
use App\Models\MasterMateri;
use App\Models\MasterPeriode;
use App\Models\Student;
use App\Models\Subject;
use App\Models\TransNilai;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class NilaiController extends Controller
{
    public function getFilters()
    {
        return response()->json([
            'periodes' => MasterPeriode::orderByDesc('tahun_ajaran')->get(),
            'classes' => Classes::orderBy('nama_kelas')->get(),
            'subjects' => Subject::orderBy('nama_mapel')->get(),
            'mbks' => MasterMBK::orderBy('kategori_penilaian')->get(),
        ]);
    }

    public function getMateriByContext(Request $request)
    {
        $query = MasterMateri::with('kategori');
        
        if ($request->filled('id_kelas')) $query->where('id_kelas', $request->id_kelas);
        if ($request->filled('id_mapel')) $query->where('id_mapel', $request->id_mapel);
        if ($request->filled('id_periode')) $query->where('id_periode', $request->id_periode);
        
        return response()->json(['data' => $query->orderBy('nama_materi')->get()]);
    }

    public function getStudentsWithNilai(Request $request)
    {
        $request->validate([
            'id_kelas' => 'required|exists:classes,id_kelas',
            'id_materi' => 'required|exists:master_materi,id_materi',
            'id_periode' => 'required|exists:master_periode,id_periode',
            'tanggal' => 'required|date',
        ]);

        $students = Student::where('id_kelas', $request->id_kelas)
            ->orderBy('nama_siswa')
            ->get(['id_siswa', 'nisn', 'nama_siswa']);

        $existingNilai = TransNilai::where('id_materi', $request->id_materi)
            ->where('id_periode', $request->id_periode)
            ->where('tanggal', $request->tanggal)
            ->pluck('nilai', 'id_siswa');

        return response()->json([
            'students' => $students->map(fn($s) => [
                'id_siswa' => $s->id_siswa,
                'nisn' => $s->nisn,
                'nama_siswa' => $s->nama_siswa,
                'nilai' => isset($existingNilai[$s->id_siswa]) ? (float)$existingNilai[$s->id_siswa] : null,
            ])
        ]);
    }

    public function saveBatch(Request $request)
    {
        $request->validate([
            'records' => 'required|array',
            'records.*.id_siswa' => 'required|exists:students,id_siswa',
            'records.*.id_mapel' => 'required|exists:subjects,id_mapel',
            'records.*.id_periode' => 'required|exists:master_periode,id_periode',
            'records.*.id_jenis' => 'required|exists:master_mbk,id_jenis',
            'records.*.id_materi' => 'required|exists:master_materi,id_materi',
            'records.*.id_kelas' => 'required|exists:classes,id_kelas',
            'records.*.nilai' => 'required|numeric|between:0,100',
            'records.*.tanggal' => 'required|date',
        ]);

        $guruId = $request->user()->username ?? 'UNKNOWN';
        $saved = 0; $updated = 0;

        foreach ($request->records as $rec) {
            $mbk = MasterMBK::find($rec['id_jenis']);
            $materi = MasterMateri::find($rec['id_materi']);
            if (!$mbk || !$materi) continue;

            $nilaiMentah = (float)$rec['nilai'];

            // MESIN KALKULASI STNKM: Nilai × Matriks MBK × Matriks Materi
            $poin_S = round($nilaiMentah * $mbk->mat_S * $materi->mat_S, 2);
            $poin_T = round($nilaiMentah * $mbk->mat_T * $materi->mat_T, 2);
            $poin_N = round($nilaiMentah * $mbk->mat_N * $materi->mat_N, 2);
            $poin_K = round($nilaiMentah * $mbk->mat_K * $materi->mat_K, 2);
            $poin_M = round($nilaiMentah * $mbk->mat_M * $materi->mat_M, 2);

            $existing = TransNilai::where('id_siswa', $rec['id_siswa'])
                ->where('id_materi', $rec['id_materi'])
                ->where('id_periode', $rec['id_periode'])
                ->where('tanggal', $rec['tanggal'])
                ->first();

            if ($existing) {
                $existing->update([
                    'nilai' => $nilaiMentah,
                    'poin_S' => $poin_S, 'poin_T' => $poin_T, 'poin_N' => $poin_N,
                    'poin_K' => $poin_K, 'poin_M' => $poin_M,
                    'id_jenis' => $rec['id_jenis'],
                    'id_guru' => $guruId,
                ]);
                $updated++;
            } else {
                TransNilai::create([
                    'id_nilai' => 'NIL-' . Str::uuid(),
                    'tanggal' => $rec['tanggal'],
                    'id_siswa' => $rec['id_siswa'],
                    'id_mapel' => $rec['id_mapel'],
                    'id_guru' => $guruId,
                    'id_periode' => $rec['id_periode'],
                    'id_jenis' => $rec['id_jenis'],
                    'id_materi' => $rec['id_materi'],
                    'id_kelas' => $rec['id_kelas'],
                    'nilai' => $nilaiMentah,
                    'poin_S' => $poin_S, 'poin_T' => $poin_T, 'poin_N' => $poin_N,
                    'poin_K' => $poin_K, 'poin_M' => $poin_M,
                    'metode_stnkm' => 'OTOMATIS',
                ]);
                $saved++;
            }
        }

        return response()->json([
            'success' => true,
            'message' => "Nilai disimpan. Baru: {$saved}, Diperbarui: {$updated}.",
        ]);
    }
}
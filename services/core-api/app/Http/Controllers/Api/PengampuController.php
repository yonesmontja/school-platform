<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Classes;
use App\Models\MasterPeriode;
use App\Models\PengampuMapel;
use App\Models\Subject;
use App\Models\Teacher;
use App\Services\Pengampu;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * Pembagian mengajar per semester (rombel × mapel → guru). Sel kosong berarti guru bawaan di Mata Pelajaran.
 */
class PengampuController extends Controller
{
    public function index(Request $request)
    {
        $request->validate(['id_periode' => 'nullable|exists:master_periode,id_periode']);
        $periode = $request->filled('id_periode')
            ? MasterPeriode::find($request->id_periode)
            : MasterPeriode::where('status_aktif', 'AKTIF')->first();
        abort_unless($periode, 422, 'Belum ada semester aktif.');

        $nonaktif = Classes::idNonaktif($periode->id_periode);
        return response()->json([
            'periode' => $periode,
            'periodes' => MasterPeriode::orderByDesc('tahun_ajaran')->orderByDesc('semester')->get(['id_periode', 'tahun_ajaran', 'semester', 'status_aktif', 'terkunci']),
            'kelas' => Classes::orderBy('tingkat')->orderBy('nama_kelas')->get(['id_kelas', 'nama_kelas', 'tingkat'])
                ->each(fn($k) => $k->setAttribute('aktif_semester', !in_array($k->id_kelas, $nonaktif, true))),
            'mapel' => Subject::with('guru:id_guru,nama_guru')->orderBy('kelompok')->orderBy('nama_mapel')->get(['id_mapel', 'nama_mapel', 'kelompok', 'id_guru']),
            'guru' => Teacher::orderBy('nama_guru')->get(['id_guru', 'nama_guru']),
            'baris' => PengampuMapel::where('id_periode', $periode->id_periode)->get(['id_kelas', 'id_mapel', 'id_guru']),
        ]);
    }

    /** Simpan sel yang berubah. id_guru kosong/null = kembali ke guru bawaan mapel. */
    public function simpan(Request $request)
    {
        $data = $request->validate([
            'id_periode' => 'required|exists:master_periode,id_periode',
            'baris' => 'required|array|min:1|max:2000',
            'baris.*.id_kelas' => 'required|exists:classes,id_kelas',
            'baris.*.id_mapel' => 'required|exists:subjects,id_mapel',
            'baris.*.id_guru' => 'nullable|exists:teachers,id_guru',
        ]);
        $periode = MasterPeriode::find($data['id_periode']);
        abort_if($periode->terkunci, 423, "Semester {$periode->tahun_ajaran} {$periode->semester} sudah dikunci. Buka kuncinya dulu di menu Semester.");

        $bawaan = Subject::pluck('id_guru', 'id_mapel');
        $diubah = 0;
        DB::transaction(function () use ($data, $bawaan, &$diubah) {
            foreach ($data['baris'] as $b) {
                $kunci = ['id_periode' => $data['id_periode'], 'id_kelas' => $b['id_kelas'], 'id_mapel' => $b['id_mapel']];
                $guru = $b['id_guru'] ?? null;
                // Kosong atau sama dengan guru bawaan → tidak perlu disimpan sebagai pembagian khusus
                if (!$guru || $guru === ($bawaan[$b['id_mapel']] ?? null)) {
                    $diubah += PengampuMapel::where($kunci)->delete();
                    continue;
                }
                PengampuMapel::updateOrCreate($kunci, ['id_guru' => $guru]);
                $diubah++;
            }
        });

        return response()->json(['message' => 'Pembagian mengajar disimpan.', 'diubah' => $diubah,
            'baris' => PengampuMapel::where('id_periode', $data['id_periode'])->get(['id_kelas', 'id_mapel', 'id_guru'])]);
    }

    /** Ringkasan untuk guru: rombel & mapel yang diampunya semester ini. */
    public function saya(Request $request)
    {
        $idGuru = $request->user()->id_guru;
        if (!$idGuru) return response()->json(['data' => []]);
        $mapel = Subject::whereIn('id_mapel', Pengampu::mapelGuru($idGuru))->orderBy('nama_mapel')->get(['id_mapel', 'nama_mapel']);
        $kelas = Classes::pluck('nama_kelas', 'id_kelas');
        return response()->json(['data' => $mapel->map(fn($m) => [
            'id_mapel' => $m->id_mapel, 'nama_mapel' => $m->nama_mapel,
            'kelas' => collect(Pengampu::kelasGuru($idGuru, $m->id_mapel))->map(fn($k) => ['id_kelas' => $k, 'nama_kelas' => $kelas[$k] ?? $k])->values(),
        ])]);
    }
}

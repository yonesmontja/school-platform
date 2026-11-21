<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\MasterPeriode;
use App\Models\Student;
use App\Models\Subject;
use App\Models\TransCatatanWali;
use App\Models\TransJurnal;
use App\Models\TransKenaikan;
use App\Models\TransNilai;
use App\Models\TransNilaiP5;
use App\Models\TransPembinaanPresensi;
use App\Models\TransPresensi;
use App\Services\RemedialService;
use App\Services\RiwayatRombel;
use Illuminate\Http\Request;

/**
 * Rekam jejak (buku induk) seorang siswa: biodata dan ringkasan setiap semester sejak pertama tercatat —
 * rombel & wali kelas, nilai per mapel, kehadiran, jurnal, pembinaan, P5, catatan wali, dan keputusan kenaikan.
 * Rincian nilai harian dan jurnal per semester dimuat terpisah bila diminta.
 * Akses: admin & kepala sekolah, wali kelas siswa sekarang, serta siswa/orang tua untuk dirinya sendiri.
 */
class RekamJejakController extends Controller
{
    private function siswa(Request $request, string $id): Student
    {
        $siswa = Student::with(['kelas:id_kelas,nama_kelas,tingkat', 'agama:id_agama,nama_agama', 'ortu', 'wali', 'sekolahAsal'])->find($id);
        abort_unless($siswa && $request->user()->bolehDashboardSiswa($siswa), 403, 'Rekam jejak siswa ini tidak dapat diakses dari akun Anda.');
        return $siswa;
    }

    public function show(Request $request, string $id)
    {
        $siswa = $this->siswa($request, $id);
        $riwayat = collect(RiwayatRombel::riwayatSiswa($id));
        $periode = $riwayat->pluck('id_periode');
        $mapel = Subject::get(['id_mapel', 'nama_mapel', 'kkm', 'kelompok'])->keyBy('id_mapel');

        $nilai = RemedialService::batasiNilai(TransNilai::efektif()->where('id_siswa', $id)->whereIn('id_periode', $periode)
            ->get(['id_periode', 'id_mapel', 'tipe_nilai', 'nilai']))->groupBy('id_periode');
        $presensi = TransPresensi::where('id_siswa', $id)->whereIn('id_periode', $periode)
            ->selectRaw('id_periode, status_kehadiran, count(*) as n')->groupBy('id_periode', 'status_kehadiran')->get()->groupBy('id_periode');
        $catatan = TransCatatanWali::where('id_siswa', $id)->whereIn('id_periode', $periode)->pluck('catatan_final', 'id_periode');
        $kenaikan = TransKenaikan::where('id_siswa', $id)->whereIn('id_periode', $periode)->get(['id_periode', 'keputusan', 'ke_tingkat', 'disahkan'])->keyBy('id_periode');
        $pembinaan = TransPembinaanPresensi::where('id_siswa', $id)->whereIn('id_periode', $periode)
            ->selectRaw('id_periode, count(*) as n')->groupBy('id_periode')->pluck('n', 'id_periode');
        $p5 = TransNilaiP5::where('id_siswa', $id)->whereIn('id_periode', $periode)
            ->selectRaw('id_periode, count(distinct id_proyek) as n')->groupBy('id_periode')->pluck('n', 'id_periode');
        $jurnal = TransJurnal::where('id_siswa', $id)->get(['tanggal', 'val_S', 'val_T', 'val_N', 'val_K', 'val_M']);
        $rentang = MasterPeriode::whereIn('id_periode', $periode)->get()->mapWithKeys(fn($p) => [$p->id_periode => $p->rentang()]);

        $semester = $riwayat->map(function ($r) use ($nilai, $mapel, $presensi, $catatan, $kenaikan, $pembinaan, $p5, $jurnal, $rentang) {
            $perMapel = collect($nilai->get($r['id_periode'], []))->groupBy('id_mapel')->map(fn($g, $m) => [
                'id_mapel' => $m, 'nama_mapel' => $mapel[$m]->nama_mapel ?? $m, 'kelompok' => $mapel[$m]->kelompok ?? null,
                'kkm' => (float) ($mapel[$m]->kkm ?? 75), 'rata' => round($g->avg(fn($n) => (float) $n->nilai), 1), 'jumlah' => $g->count(),
            ])->sortBy('nama_mapel')->values();
            $hadir = collect($presensi->get($r['id_periode'], []))->pluck('n', 'status_kehadiran');
            [$mulai, $selesai] = $rentang[$r['id_periode']] ?? [null, null];
            $j = $mulai ? $jurnal->filter(fn($x) => $x->tanggal >= $mulai->copy()->startOfDay() && $x->tanggal <= $selesai) : collect();
            $total = fn($x) => $x->val_S + $x->val_T + $x->val_N + $x->val_K + $x->val_M;
            $wali = RiwayatRombel::wali($r['id_kelas'], $r['id_periode'], ['id_guru', 'nama_guru']);
            return $r + [
                'wali_kelas' => $wali?->nama_guru,
                'mapel' => $perMapel,
                'rata_rata' => $perMapel->isEmpty() ? null : round($perMapel->avg('rata'), 1),
                'di_bawah_kkm' => $perMapel->filter(fn($m) => $m['rata'] < $m['kkm'])->count(),
                'presensi' => ['hadir' => (int) ($hadir['HADIR'] ?? 0), 'sakit' => (int) ($hadir['SAKIT'] ?? 0), 'izin' => (int) ($hadir['IZIN'] ?? 0), 'alpa' => (int) ($hadir['ALPA'] ?? 0)],
                'jurnal' => ['jumlah' => $j->count(), 'positif' => $j->filter(fn($x) => $total($x) >= 0)->count(), 'perlu_perhatian' => $j->filter(fn($x) => $total($x) < 0)->count()],
                'pembinaan' => (int) ($pembinaan[$r['id_periode']] ?? 0),
                'p5' => (int) ($p5[$r['id_periode']] ?? 0),
                'catatan_wali' => $catatan[$r['id_periode']] ?? null,
                'kenaikan' => ($k = $kenaikan->get($r['id_periode'])) && $k->disahkan ? $k->only(['keputusan', 'ke_tingkat']) : null,
            ];
        })->reverse()->values();

        return response()->json([
            'siswa' => $siswa,
            'semester' => $semester,
            'lintasan' => \App\Services\AnalitikLintasSemester::lintasan($semester->all()),
            'sekolah' => \App\Models\SchoolSetting::first()?->only(['nama_sekolah', 'npsn', 'alamat_sekolah', 'kota', 'nama_kepsek', 'nip_kepsek']),
        ]);
    }

    /** Rincian nilai harian satu semester. */
    public function nilai(Request $request, string $id)
    {
        $request->validate(['id_periode' => 'required|exists:master_periode,id_periode']);
        $this->siswa($request, $id);
        $data = TransNilai::with(['mapel:id_mapel,nama_mapel', 'materi:id_materi,nama_materi', 'jenis:id_jenis,kategori_penilaian'])
            ->where('id_siswa', $id)->where('id_periode', $request->id_periode)->bukanDiagnostik()
            ->orderBy('tanggal')->get(['id_nilai', 'tanggal', 'id_mapel', 'id_materi', 'id_jenis', 'tipe_nilai', 'nilai']);
        return response()->json(['data' => $data]);
    }

    /** Jurnal satu semester; narasi bertanda sensitif tidak dikirim (sama seperti rapor & portal). */
    public function jurnal(Request $request, string $id)
    {
        $request->validate(['id_periode' => 'required|exists:master_periode,id_periode']);
        $this->siswa($request, $id);
        [$mulai, $selesai] = MasterPeriode::find($request->id_periode)->rentang();
        $data = TransJurnal::with('guru:id_guru,nama_guru')->where('id_siswa', $id)
            ->whereBetween('tanggal', [$mulai->toDateString(), $selesai->toDateString()])->orderBy('tanggal')
            ->get(['id_jurnal', 'tanggal', 'id_guru', 'narasi_kejadian', 'sensitif', 'val_S', 'val_T', 'val_N', 'val_K', 'val_M'])
            ->each(function ($j) { if ($j->sensitif) $j->narasi_kejadian = null; });
        return response()->json(['data' => $data]);
    }
}

<?php

namespace App\Services;

use App\Models\Classes;
use App\Models\MasterMateri;
use App\Models\MasterPeriode;
use App\Models\Student;
use App\Models\Subject;
use App\Models\TransNilai;
use App\Models\TransPresensi;
use Illuminate\Support\Collection;

/**
 * Analitik lintas semester untuk kepala sekolah dan guru, dari nilai efektif (remedial menggantikan nilai asal,
 * diagnostik tidak ikut, remedial dibatasi KKM bila diatur sekolah):
 *  - tren rata-rata & ketuntasan per semester dan per mapel;
 *  - TP (materi) yang dikelompokkan lintas angkatan dengan kunci mapel + tingkat + semester + nama TP, sehingga TP yang
 *    selalu rendah di setiap angkatan terlihat (tanda cara mengajarnya perlu ditinjau, bukan siswanya);
 *  - perbandingan rombel setingkat pada TP yang sama;
 *  - siswa yang rata-ratanya turun dua semester berturut-turut.
 * Satu siswa dihitung sekali per TP: nilainya dirata-rata dulu, baru dirata-rata antarsiswa.
 */
class AnalitikLintasSemester
{
    public const AMBANG_TUNTAS = 60;   // % siswa tuntas minimal agar TP tidak dianggap lemah
    public const SELISIH_ROMBEL = 10;  // selisih rata-rata antarrombel yang dianggap kesenjangan
    public const TURUN_MIN = 3;        // total penurunan minimal (poin) untuk tanda "turun berturut-turut"

    /**
     * @param array{id_mapel?: ?string, tingkat?: ?int, mapel_boleh?: ?array, kelas_siswa?: ?array} $f
     *        mapel_boleh: batas mapel (guru); kelas_siswa: batas rombel untuk daftar siswa (wali kelas); null = semua.
     */
    public function hitung(array $f): array
    {
        $periode = MasterPeriode::get(['id_periode', 'tahun_ajaran', 'semester', 'status_aktif'])
            ->sortBy(fn($p) => $p->tahun_ajaran . ($p->semester === 'Genap' ? '2' : '1'))->values();
        $urut = $periode->pluck('id_periode')->flip();
        $mapel = Subject::get(['id_mapel', 'nama_mapel', 'kkm'])->keyBy('id_mapel');
        $kelas = Classes::get(['id_kelas', 'nama_kelas', 'tingkat'])->keyBy('id_kelas');

        $q = TransNilai::efektif()->whereNotNull('id_materi');
        if (!empty($f['id_mapel'])) $q->where('id_mapel', $f['id_mapel']);
        if (isset($f['mapel_boleh'])) $q->whereIn('id_mapel', $f['mapel_boleh'] ?: ['-']);
        if (!empty($f['tingkat'])) $q->whereIn('id_kelas', $kelas->where('tingkat', (int) $f['tingkat'])->keys()->all() ?: ['-']);
        $baris = RemedialService::batasiNilai($q->toBase()->get(['id_periode', 'id_mapel', 'id_kelas', 'id_materi', 'id_siswa', 'tipe_nilai', 'nilai']));

        $materi = MasterMateri::whereIn('id_materi', $baris->pluck('id_materi')->unique()->values())
            ->get(['id_materi', 'nama_materi', 'deskripsi_kompetensi', 'id_mapel'])->keyBy('id_materi');
        $kkm = fn($m) => (float) ($mapel[$m]->kkm ?? 75);

        // Satu siswa × satu TP × satu semester = satu nilai (rata-rata penilaiannya)
        $siswaTp = $baris->groupBy(fn($b) => "{$b->id_periode}|{$b->id_materi}|{$b->id_siswa}")->map(function ($g) use ($kelas) {
            $a = $g->first();
            return (object) [
                'id_periode' => $a->id_periode, 'id_mapel' => $a->id_mapel, 'id_materi' => $a->id_materi, 'id_siswa' => $a->id_siswa,
                'id_kelas' => $g->pluck('id_kelas')->filter()->countBy()->sortDesc()->keys()->first(),
                'nilai' => $g->avg(fn($b) => (float) $b->nilai),
            ];
        })->values();
        foreach ($siswaTp as $s) $s->tingkat = $kelas[$s->id_kelas]->tingkat ?? null;

        $ringkas = function (Collection $g) use ($kkm) {
            if ($g->isEmpty()) return null;
            return [
                'rata' => round($g->avg('nilai'), 1),
                'tuntas' => (int) round(100 * $g->filter(fn($s) => $s->nilai >= $kkm($s->id_mapel))->count() / $g->count()),
                'siswa' => $g->pluck('id_siswa')->unique()->count(),
            ];
        };

        $adaData = $siswaTp->pluck('id_periode')->unique()->flip();
        $periodeData = $periode->filter(fn($p) => $adaData->has($p->id_periode))->values();
        $semester = $periodeData->map(fn($p) => [
            'id_periode' => $p->id_periode, 'tahun_ajaran' => $p->tahun_ajaran, 'semester' => $p->semester,
            'aktif' => $p->status_aktif === 'AKTIF',
        ] + $ringkas($siswaTp->where('id_periode', $p->id_periode)))->values();

        $trenMapel = $siswaTp->groupBy('id_mapel')->map(fn($g, $m) => [
            'id_mapel' => $m, 'nama_mapel' => $mapel[$m]->nama_mapel ?? $m, 'kkm' => $kkm($m),
            'per_semester' => $g->groupBy('id_periode')->map($ringkas),
        ])->sortBy('nama_mapel')->values();

        $tp = $this->kelompokTp($siswaTp, $materi, $mapel, $kelas, $periode, $urut, $ringkas, $kkm);
        $siswa = $this->siswaTurun($baris, $periodeData, $kkm, $f['kelas_siswa'] ?? null);

        return [
            'semester' => $semester,
            'tren_mapel' => $trenMapel,
            'tp' => $tp,
            'siswa_turun' => $siswa,
            'ringkasan' => [
                'tp_selalu_rendah' => collect($tp)->where('selalu_rendah', true)->count(),
                'tp_rendah_terakhir' => collect($tp)->where('rendah_terakhir', true)->count(),
                'tp_kesenjangan' => collect($tp)->where('kesenjangan', true)->count(),
                'siswa_turun' => count($siswa),
                'jumlah_semester' => $semester->count(),
            ],
            'ambang' => ['tuntas' => self::AMBANG_TUNTAS, 'selisih_rombel' => self::SELISIH_ROMBEL, 'turun_min' => self::TURUN_MIN],
        ];
    }

    /** Kunci TP lintas angkatan: mapel | tingkat | Ganjil/Genap | nama TP dinormalkan. */
    public static function kunciTp(string $idMapel, ?int $tingkat, ?string $semester, string $nama): string
    {
        $n = preg_replace('/\s+/u', ' ', mb_strtolower(trim($nama)));
        $n = preg_replace('/[^\p{L}\p{N} ]/u', '', $n);
        return implode('|', [$idMapel, $tingkat ?? '-', $semester ?? '-', $n]);
    }

    private function kelompokTp(Collection $siswaTp, Collection $materi, Collection $mapel, Collection $kelas, Collection $periode, Collection $urut, callable $ringkas, callable $kkm): array
    {
        $info = $periode->keyBy('id_periode');
        return $siswaTp->groupBy(fn($s) => self::kunciTp($s->id_mapel, $s->tingkat, $info[$s->id_periode]->semester ?? null, $materi[$s->id_materi]->nama_materi ?? $s->id_materi))
            ->map(function ($g, $kunci) use ($materi, $mapel, $kelas, $info, $urut, $ringkas, $kkm) {
                $a = $g->first();
                $perSemester = $g->groupBy('id_periode')->sortBy(fn($x, $p) => $urut[$p] ?? 0)->map(function ($gp, $p) use ($ringkas, $kelas, $info) {
                    $rombel = $gp->groupBy('id_kelas')->map(fn($gk, $k) => ['id_kelas' => $k, 'nama_kelas' => $kelas[$k]->nama_kelas ?? $k] + $ringkas($gk))
                        ->sortBy('nama_kelas')->values();
                    return ['id_periode' => $p, 'tahun_ajaran' => $info[$p]->tahun_ajaran ?? null, 'semester' => $info[$p]->semester ?? null]
                        + $ringkas($gp) + ['rombel' => $rombel, 'materi' => $gp->pluck('id_materi')->unique()->values()];
                })->values();

                $k = $kkm($a->id_mapel);
                $lemah = fn($r) => $r['rata'] < $k || $r['tuntas'] < self::AMBANG_TUNTAS;
                $terakhir = $perSemester->last();
                $selisih = $terakhir['rombel']->count() > 1 ? round($terakhir['rombel']->max('rata') - $terakhir['rombel']->min('rata'), 1) : 0;
                $m = $materi[$terakhir['materi'][0]] ?? null;
                return [
                    'kunci' => $kunci,
                    'id_mapel' => $a->id_mapel, 'nama_mapel' => $mapel[$a->id_mapel]->nama_mapel ?? $a->id_mapel, 'kkm' => $k,
                    'tingkat' => $a->tingkat, 'semester' => $terakhir['semester'],
                    'nama_tp' => $m->nama_materi ?? $a->id_materi, 'deskripsi' => $m->deskripsi_kompetensi ?? null,
                    'id_materi_terakhir' => $m->id_materi ?? null,
                    'per_semester' => $perSemester,
                    'angkatan' => $perSemester->count(),
                    'angkatan_lemah' => $perSemester->filter($lemah)->count(),
                    'selalu_rendah' => $perSemester->count() >= 2 && $perSemester->filter($lemah)->count() >= 2 && $lemah($terakhir),
                    'rendah_terakhir' => $lemah($terakhir),
                    'selisih_rombel' => $selisih,
                    'kesenjangan' => $selisih >= self::SELISIH_ROMBEL,
                    'rata_terakhir' => $terakhir['rata'], 'tuntas_terakhir' => $terakhir['tuntas'],
                ];
            })
            ->sortBy([['selalu_rendah', 'desc'], ['rendah_terakhir', 'desc'], ['tuntas_terakhir', 'asc']])
            ->values()->all();
    }

    /**
     * Siswa yang rata-rata semesternya turun dua kali berturut-turut (tiga semester terakhir yang bernilai),
     * dengan total penurunan minimal TURUN_MIN poin. Hanya siswa aktif.
     */
    private function siswaTurun(Collection $baris, Collection $periodeData, callable $kkm, ?array $kelasSiswa): array
    {
        if ($periodeData->count() < 3) return [];
        $urutan = $periodeData->pluck('id_periode')->values();
        $perSiswa = $baris->groupBy('id_siswa')->map(fn($g) => $g->groupBy('id_periode')
            ->map(fn($gp) => $gp->groupBy('id_mapel')->map(fn($gm) => $gm->avg(fn($b) => (float) $b->nilai))->avg()));

        $siswa = Student::where('status_siswa', 'aktif')->whereIn('id_siswa', $perSiswa->keys())
            ->when($kelasSiswa !== null, fn($q) => $q->whereIn('id_kelas', $kelasSiswa ?: ['-']))
            ->with('kelas:id_kelas,nama_kelas')->get(['id_siswa', 'nama_siswa', 'id_kelas'])->keyBy('id_siswa');

        $hasil = [];
        foreach ($siswa as $id => $s) {
            $deret = $urutan->filter(fn($p) => isset($perSiswa[$id][$p]))->map(fn($p) => ['id_periode' => $p, 'rata' => round($perSiswa[$id][$p], 1)])->values();
            if ($deret->count() < 3) continue;
            [$a, $b, $c] = $deret->slice(-3)->values()->all();
            if (!($b['rata'] < $a['rata'] && $c['rata'] < $b['rata'] && $a['rata'] - $c['rata'] >= self::TURUN_MIN)) continue;
            $hasil[] = [
                'id_siswa' => $id, 'nama_siswa' => $s->nama_siswa, 'nama_kelas' => $s->kelas?->nama_kelas,
                'deret' => $deret->all(), 'turun' => round($a['rata'] - $c['rata'], 1),
                'kehadiran' => $this->kehadiran($id, $c['id_periode']),
            ];
        }
        return collect($hasil)->sortByDesc('turun')->values()->all();
    }

    private function kehadiran(string $idSiswa, string $idPeriode): ?int
    {
        $p = TransPresensi::where('id_siswa', $idSiswa)->where('id_periode', $idPeriode)->pluck('status_kehadiran');
        return $p->isEmpty() ? null : (int) round(100 * $p->filter(fn($s) => $s === 'HADIR')->count() / $p->count());
    }

    /**
     * Lintasan seorang siswa untuk grafik di rekam jejak: rata-rata dan persen kehadiran per semester,
     * serta tanda turun dua semester berturut-turut.
     * @param array $semester baris `semester` dari RekamJejakController (urutan terbaru dulu)
     */
    public static function lintasan(array $semester): array
    {
        $deret = collect($semester)->reverse()->values()->map(function ($s) {
            $p = $s['presensi'];
            $total = $p['hadir'] + $p['sakit'] + $p['izin'] + $p['alpa'];
            return [
                'label' => ($s['tahun_ajaran'] ?? '') . ' ' . ($s['semester'] ?? ''),
                'nama_kelas' => $s['nama_kelas'] ?? null,
                'rata' => $s['rata_rata'],
                'kehadiran' => $total ? (int) round(100 * $p['hadir'] / $total) : null,
            ];
        });
        $bernilai = $deret->filter(fn($d) => $d['rata'] !== null)->values();
        $turun = false;
        if ($bernilai->count() >= 3) {
            [$a, $b, $c] = $bernilai->slice(-3)->values()->all();
            $turun = $b['rata'] < $a['rata'] && $c['rata'] < $b['rata'] && $a['rata'] - $c['rata'] >= self::TURUN_MIN;
        }
        return ['deret' => $deret->all(), 'turun_berturut' => $turun];
    }
}

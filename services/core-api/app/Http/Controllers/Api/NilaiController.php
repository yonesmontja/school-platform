<?php

namespace App\Http\Controllers\Api;

use App\Rules\BukanHariMinggu;
use App\Http\Controllers\Controller;
use App\Models\Classes;
use App\Models\MasterIndikator;
use App\Models\MasterMBK;
use App\Models\MasterMateri;
use App\Models\MasterPeriode;
use App\Models\Student;
use App\Models\Subject;
use App\Models\Teacher;
use App\Models\TransJadwal;
use App\Models\TransNilai;
use App\Models\TransNilaiIndikator;
use App\Models\TransRencanaRemedial;
use App\Services\LampiranJadwalService;
use App\Services\RemedialService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

class NilaiController extends Controller
{
    private const RELASI = ['siswa', 'mapel', 'jenis', 'materi.kategori', 'guru:id_guru,nama_guru', 'pengisi:id,name', 'nilaiIndikator.indikator:id_indikator,deskripsi', 'rencana.nilaiRemedial:id_nilai,id_rencana,nilai,tanggal', 'rencana.jadwal:id_jadwal,mulai,selesai,id_ruangan,status_sesi,lampiran_url,lampiran_nama', 'rencanaAsal:id_rencana,opsi_tindakan,id_nilai_asal'];
    private const META = ['id_kelas', 'id_mapel', 'id_periode', 'id_jenis', 'id_materi'];

    public function getFilters(Request $request)
    {
        $user = $request->user();
        return response()->json([
            'periodes' => MasterPeriode::orderByDesc('tahun_ajaran')->orderBy('semester')->get(),
            'classes' => Classes::orderBy('nama_kelas')->get(),
            // Guru hanya melihat mapel yang diampunya
            'subjects' => Subject::with('guru')
                ->when($user->isGuru(), fn($q) => $q->whereIn('id_mapel', $user->mapelDiampu()))
                ->orderBy('nama_mapel')->get(),
            'mbks' => MasterMBK::orderBy('kategori_penilaian')->get(),
            'opsi_remedial' => TransRencanaRemedial::OPSI,
            'saran' => $this->saranDariJadwal($user),
        ]);
    }

    /**
     * Kelas, mapel & materi yang disarankan untuk guru dari jadwalnya hari ini: sesi yang sedang berjalan,
     * lalu sesi terakhir yang sudah lewat, lalu sesi berikutnya.
     */
    private function saranDariJadwal($user): ?array
    {
        if (!$user->id_guru) return null;
        $sekarang = now(config('app.zona_sekolah'))->format('Y-m-d H:i:s');
        $jadwal = TransJadwal::where('id_guru', $user->id_guru)
            ->whereNotNull('id_kelas')->whereNotNull('id_mapel')
            ->whereDate('mulai', substr($sekarang, 0, 10))
            ->orderBy('mulai')->get(['id_kelas', 'id_mapel', 'id_materi', 'mulai', 'selesai']);
        if ($jadwal->isEmpty()) return null;

        $kini = fn($j) => $j->mulai->format('Y-m-d H:i:s') <= $sekarang;
        $pilih = $jadwal->filter($kini)->last() ?? $jadwal->first();

        return $pilih->only(['id_kelas', 'id_mapel', 'id_materi']) + ['mulai' => $pilih->mulai->format('H:i')];
    }

    public function getMateriByContext(Request $request)
    {
        // Indikator aktif ditawarkan saat menilai; yang nonaktif tetap terbaca lewat lembar nilai bila pernah dipakai
        $query = MasterMateri::with(['kategori', 'indikator' => fn($q) => $q->where('aktif', true)]);

        if ($request->filled('id_mapel')) $query->where('id_mapel', $request->id_mapel);
        // Materi tanpa kelas/periode berlaku umum untuk semua kelas/periode
        foreach (['id_kelas', 'id_periode'] as $kolom) {
            if ($request->filled($kolom)) {
                $query->where(fn($q) => $q->where($kolom, $request->$kolom)->orWhereNull($kolom));
            }
        }

        return response()->json(['data' => $query->orderBy('nama_materi')->get()]);
    }

    /**
     * Riwayat nilai satu kelas pada satu periode.
     */
    public function index(Request $request)
    {
        $request->validate([
            'id_kelas' => 'required|exists:classes,id_kelas',
            'id_periode' => 'required|exists:master_periode,id_periode',
        ]);

        $user = $request->user();
        $data = TransNilai::with(self::RELASI)
            ->where('id_kelas', $request->id_kelas)
            ->when($user->isGuru(), fn($q) => $q->whereIn('id_mapel', $user->mapelDiampu()))
            ->where('id_periode', $request->id_periode)
            ->orderByDesc('tanggal')
            ->orderByDesc('updated_at')
            ->get();

        return response()->json(['data' => $data]);
    }

    /**
     * Ringkasan untuk guru sebelum menilai/mengimpor (kelas + mapel + periode): penilaian terakhir beserta
     * materi & indikatornya, progres capaian per materi dan per indikator, serta siswa yang perlu perhatian.
     * Capaian memakai nilai efektif seperti rapor: nilai yang sudah diremedial digantikan nilai remedialnya,
     * dan asesmen diagnostik tidak dihitung.
     */
    public function ringkasan(Request $request)
    {
        $request->validate([
            'id_kelas' => 'required|exists:classes,id_kelas',
            'id_mapel' => 'required|exists:subjects,id_mapel',
            'id_periode' => 'required|exists:master_periode,id_periode',
        ]);
        $this->cekMapel($request, $request->id_mapel);
        $meta = $request->only(['id_kelas', 'id_mapel', 'id_periode']);
        $kkm = (float) (Subject::find($request->id_mapel)?->kkm ?? 75);
        $siswa = Student::where('id_kelas', $request->id_kelas)->orderBy('nama_siswa')->get(['id_siswa', 'nama_siswa']);
        $jumlahSiswa = $siswa->count();
        $diagnostik = TransNilai::jenisDiagnostik();

        $semua = TransNilai::with([
                'jenis:id_jenis,kategori_penilaian,jenis_asesmen',
                'materi:id_materi,nama_materi,id_kategori', 'materi.kategori:id_kategori,nama_kategori',
                'nilaiIndikator.indikator:id_indikator,deskripsi,urutan,id_materi',
                'rencana:id_rencana,id_nilai_asal',
            ])
            ->where($meta)->whereIn('id_siswa', $siswa->pluck('id_siswa'))
            ->orderBy('tanggal')->get();
        $normal = $semua->where('tipe_nilai', 'NORMAL');

        // Penilaian terakhir: satu sesi = tanggal + jenis + materi (seperti satu lembar Input Nilai)
        $sesi = $normal->groupBy(fn($n) => substr($n->tanggal, 0, 10) . '|' . $n->id_jenis . '|' . $n->id_materi)
            ->map(function ($g) use ($kkm, $jumlahSiswa, $diagnostik) {
                $n = $g->first();
                $nilai = $g->map(fn($x) => (float) $x->nilai);
                $isDiag = in_array($n->id_jenis, $diagnostik, true);
                return [
                    'tanggal' => substr($n->tanggal, 0, 10),
                    'id_jenis' => $n->id_jenis, 'jenis' => $n->jenis?->kategori_penilaian, 'diagnostik' => $isDiag,
                    'id_materi' => $n->id_materi, 'materi' => $n->materi?->nama_materi,
                    'indikator' => $g->flatMap(fn($x) => $x->nilaiIndikator)->pluck('indikator')->filter()->unique('id_indikator')
                        ->sortBy('urutan')->pluck('deskripsi')->values(),
                    'dinilai' => $g->count(), 'jumlah_siswa' => $jumlahSiswa,
                    'rata' => round($nilai->avg(), 2),
                    'di_bawah_kkm' => $isDiag ? 0 : $nilai->filter(fn($v) => $v < $kkm)->count(),
                    // Siswa di bawah KKM yang belum punya rencana tindak lanjut
                    'belum_ditindak' => $isDiag ? 0 : $g->filter(fn($x) => (float) $x->nilai < $kkm && !$x->rencana)->count(),
                    'diubah' => $g->max('updated_at')?->toIso8601String(),
                ];
            })->sortByDesc(fn($x) => $x['tanggal'] . ($x['diubah'] ?? ''))->values();

        // Nilai efektif (seperti rapor): tanpa diagnostik, nilai asal yang sudah diremedial digantikan nilai remedialnya
        $rencanaKeAsal = $normal->filter(fn($n) => $n->rencana)->mapWithKeys(fn($n) => [$n->rencana->id_rencana => $n->id_nilai]);
        $tergantikan = $semua->where('tipe_nilai', 'REMEDIAL')->map(fn($r) => $rencanaKeAsal[$r->id_rencana] ?? null)->filter()->flip();
        $efektif = $semua->reject(fn($n) => in_array($n->id_jenis, $diagnostik, true) || isset($tergantikan[$n->id_nilai]));

        $materiKonteks = MasterMateri::with(['kategori:id_kategori,nama_kategori', 'indikator' => fn($q) => $q->orderBy('urutan')->orderBy('created_at')])
            ->where('id_mapel', $request->id_mapel)
            ->where(fn($q) => $q->where('id_kelas', $request->id_kelas)->orWhereNull('id_kelas'))
            ->where(fn($q) => $q->where('id_periode', $request->id_periode)->orWhereNull('id_periode'))
            ->get();
        $idMateri = $materiKonteks->pluck('id_materi')->merge($semua->pluck('id_materi'))->filter()->unique();

        $materi = $idMateri->map(function ($id) use ($materiKonteks, $semua, $efektif, $normal, $kkm, $jumlahSiswa, $siswa, $diagnostik) {
            $m = $materiKonteks->firstWhere('id_materi', $id) ?? $semua->firstWhere('id_materi', $id)?->materi;
            $perSiswa = $efektif->where('id_materi', $id)->groupBy('id_siswa')->map(fn($g) => round($g->avg(fn($x) => (float) $x->nilai), 2));

            // Indikator: nilai terbaru tiap siswa (nilai remedial menimpa nilai asal pada tanggal yang sama)
            $nilaiInd = [];
            $urut = $semua->where('id_materi', $id)->reject(fn($n) => in_array($n->id_jenis, $diagnostik, true))
                ->sortBy(fn($n) => substr($n->tanggal, 0, 10) . ($n->tipe_nilai === 'REMEDIAL' ? '1' : '0'));
            $daftar = collect($m?->indikator ?? [])->mapWithKeys(fn($i) => [$i->id_indikator => ['id_indikator' => $i->id_indikator, 'deskripsi' => $i->deskripsi, 'aktif' => (bool) $i->aktif]]);
            foreach ($urut as $n) {
                foreach ($n->nilaiIndikator as $ni) {
                    $nilaiInd[$ni->id_indikator][$n->id_siswa] = (float) $ni->nilai;
                    if (!$daftar->has($ni->id_indikator) && $ni->indikator) {
                        $daftar[$ni->id_indikator] = ['id_indikator' => $ni->id_indikator, 'deskripsi' => $ni->indikator->deskripsi, 'aktif' => false];
                    }
                }
            }
            $sesiMateri = $normal->where('id_materi', $id);

            return [
                'id_materi' => $id,
                'materi' => $m?->nama_materi,
                'kategori' => $m?->kategori?->nama_kategori,
                'jumlah_sesi' => $sesiMateri->map(fn($n) => substr($n->tanggal, 0, 10) . '|' . $n->id_jenis)->unique()->count(),
                'terakhir' => $sesiMateri->isEmpty() ? null : $sesiMateri->max(fn($n) => substr($n->tanggal, 0, 10)),
                'dinilai' => $perSiswa->count(),
                'jumlah_siswa' => $jumlahSiswa,
                'rata' => $perSiswa->isEmpty() ? null : round($perSiswa->avg(), 2),
                'tuntas' => $perSiswa->filter(fn($v) => $v >= $kkm)->count(),
                'belum_tuntas' => $siswa->filter(fn($s) => isset($perSiswa[$s->id_siswa]) && $perSiswa[$s->id_siswa] < $kkm)
                    ->map(fn($s) => ['id_siswa' => $s->id_siswa, 'nama_siswa' => $s->nama_siswa, 'nilai' => $perSiswa[$s->id_siswa]])
                    ->sortBy('nilai')->values(),
                'indikator' => $daftar->values()->map(function ($i) use ($nilaiInd, $kkm) {
                    $v = collect($nilaiInd[$i['id_indikator']] ?? []);
                    return $i + ['dinilai' => $v->count(), 'rata' => $v->isEmpty() ? null : round($v->avg(), 2), 'tuntas' => $v->filter(fn($x) => $x >= $kkm)->count()];
                })->values(),
            ];
        })->sortByDesc(fn($m) => ($m['terakhir'] ?? '0000-00-00') . '|' . $m['materi'])->values();

        // Siswa dengan rata-rata efektif mapel di bawah KKM, terendah lebih dulu
        $rataSiswa = $efektif->groupBy('id_siswa')->map(fn($g) => round($g->avg(fn($x) => (float) $x->nilai), 2));
        $perhatian = $siswa->filter(fn($s) => isset($rataSiswa[$s->id_siswa]) && $rataSiswa[$s->id_siswa] < $kkm)
            ->map(fn($s) => [
                'id_siswa' => $s->id_siswa, 'nama_siswa' => $s->nama_siswa, 'rata' => $rataSiswa[$s->id_siswa],
                'materi_belum_tuntas' => $materi->filter(fn($m) => $m['belum_tuntas']->contains('id_siswa', $s->id_siswa))->count(),
            ])->sortBy('rata')->values();

        return response()->json([
            'kkm' => $kkm,
            'jumlah_siswa' => $jumlahSiswa,
            'ringkas' => [
                'jumlah_sesi' => $sesi->count(),
                'materi_dinilai' => $materi->where('dinilai', '>', 0)->count(),
                'materi_total' => $materi->count(),
                'rata' => $rataSiswa->isEmpty() ? null : round($rataSiswa->avg(), 2),
                'siswa_tuntas' => $rataSiswa->filter(fn($v) => $v >= $kkm)->count(),
                'siswa_dinilai' => $rataSiswa->count(),
                'remedial_terbuka' => TransRencanaRemedial::whereHas('nilaiAsal', fn($q) => $q->where($meta))->doesntHave('nilaiRemedial')->count(),
            ],
            'sesi_terakhir' => $sesi->take(6)->values(),
            'materi' => $materi,
            'perhatian' => $perhatian->take(8)->values(),
        ]);
    }

    private function rulesMeta(): array
    {
        return [
            'id_kelas' => 'required|exists:classes,id_kelas',
            'id_mapel' => 'required|exists:subjects,id_mapel',
            'id_periode' => 'required|exists:master_periode,id_periode',
            'id_jenis' => 'required|exists:master_mbk,id_jenis',
            'id_materi' => 'required|exists:master_materi,id_materi',
        ];
    }

    /**
     * Lembar nilai reguler: seluruh siswa kelas beserta nilai yang tercatat pada kombinasi penilaian + tanggal ini.
     * Tanggal berbeda berarti penilaian berbeda (mis. ulangan harian minggu 1 dan minggu 2 untuk materi yang sama).
     */
    public function getStudentsWithNilai(Request $request)
    {
        $request->validate($this->rulesMeta() + ['tanggal' => 'required|date']);
        $this->cekMapel($request, $request->id_mapel);
        $meta = $request->only(self::META);

        $students = Student::where('id_kelas', $request->id_kelas)
            ->orderBy('nama_siswa')
            ->get(['id_siswa', 'nisn', 'nama_siswa']);

        $existing = $this->queryPenilaian($meta, $request->tanggal)
            ->with('rencana.nilaiRemedial:id_nilai,id_rencana,nilai,tanggal', 'rencana.jadwal:id_jadwal,mulai,selesai,id_ruangan,status_sesi,lampiran_url,lampiran_nama', 'nilaiIndikator')
            ->whereIn('id_siswa', $students->pluck('id_siswa'))
            ->get()
            ->keyBy('id_siswa');

        // Tanggal lain yang sudah punya nilai untuk kombinasi ini, agar guru bisa berpindah antar-penilaian
        $tanggalTersedia = $this->queryPenilaian($meta)
            ->selectRaw('tanggal, COUNT(*) as jumlah')
            ->groupBy('tanggal')->orderByDesc('tanggal')->get()
            ->map(fn($t) => ['tanggal' => substr($t->tanggal, 0, 10), 'jumlah' => (int) $t->jumlah]);

        // Indikator yang sudah dinilai pada sesi ini (termasuk yang kini nonaktif), urut sesuai susunan materi
        $idTerpakai = $existing->flatMap(fn($n) => $n->nilaiIndikator->pluck('id_indikator'))->unique();
        $indikatorSesi = MasterIndikator::whereIn('id_indikator', $idTerpakai)->orderBy('urutan')->orderBy('created_at')
            ->get(['id_indikator', 'deskripsi', 'aktif', 'urutan']);

        return response()->json([
            'tanggal_tersedia' => $tanggalTersedia,
            'indikator_sesi' => $indikatorSesi,
            'students' => $students->map(function ($s) use ($existing) {
                $n = $existing[$s->id_siswa] ?? null;
                return [
                    'id_siswa' => $s->id_siswa,
                    'nisn' => $s->nisn,
                    'nama_siswa' => $s->nama_siswa,
                    'id_nilai' => $n?->id_nilai,
                    'nilai' => $n ? (float) $n->nilai : null,
                    'tanggal' => $n?->tanggal,
                    'rencana' => $n?->rencana,
                    'nilai_indikator' => $n ? $n->nilaiIndikator->mapWithKeys(fn($i) => [$i->id_indikator => (float) $i->nilai]) : (object) [],
                    // Poin STNKM tersimpan; metode MANUAL berarti diisi guru sendiri (bukan dihitung dari bobot)
                    'metode_stnkm' => $n?->metode_stnkm,
                    'poin' => $n ? ['S' => (float) $n->poin_S, 'T' => (float) $n->poin_T, 'N' => (float) $n->poin_N, 'K' => (float) $n->poin_K, 'M' => (float) $n->poin_M] : null,
                ];
            }),
        ]);
    }

    /**
     * Lembar remedial: siswa yang punya rencana tindak lanjut pada kombinasi penilaian ini,
     * beserta nilai asal dan nilai remedial yang sudah tercatat.
     */
    public function getRemedial(Request $request)
    {
        $request->validate($this->rulesMeta());
        $this->cekMapel($request, $request->id_mapel);
        $meta = $request->only(self::META);

        $data = TransRencanaRemedial::with([
                'siswa:id_siswa,nisn,nama_siswa',
                'nilaiAsal:id_nilai,nilai,tanggal,tipe_nilai',
                'nilaiAsal.nilaiIndikator.indikator:id_indikator,deskripsi,urutan,aktif',
                'nilaiRemedial:id_nilai,id_rencana,nilai,tanggal',
                'nilaiRemedial.nilaiIndikator',
                'jadwal:id_jadwal,mulai,selesai,id_ruangan,status_sesi,lampiran_url,lampiran_nama',
            ])
            ->whereHas('nilaiAsal', fn($q) => $q->where($meta))
            ->orderBy('status')->orderBy('tanggal_rencana')
            ->get();

        return response()->json(['data' => $data]);
    }

    /**
     * Simpan lembar nilai. Nilai NORMAL: satu siswa satu nilai per kombinasi penilaian + tanggal;
     * menyimpan ulang pada tanggal yang sama memperbarui nilainya.
     * Nilai REMEDIAL menautkan diri ke rencana tindak lanjut siswa (id_rencana, atau rencana terbuka
     * pada kombinasi ini bila tidak disebut, mis. dari import Excel) lalu menuntaskan rencana itu.
     * Metode MANUAL (import Excel) memakai poin STNKM dari file apa adanya.
     */
    public function saveBatch(Request $request)
    {
        $request->validate($this->rulesMeta() + [
            'tanggal' => ['required', 'date', new BukanHariMinggu],
            'metode_stnkm' => 'nullable|in:OTOMATIS,MANUAL',
            'tipe_nilai' => ['nullable', Rule::in(['NORMAL', 'REMEDIAL'])],
            'records' => 'required|array|min:1',
            'records.*.id_siswa' => 'required|exists:students,id_siswa',
            'records.*.tipe_nilai' => ['nullable', Rule::in(['NORMAL', 'REMEDIAL'])],
            'records.*.id_rencana' => 'nullable|exists:trans_rencana_remedial,id_rencana',
            // Nilai per indikator {id_indikator: 0-100}; bila diisi, nilai materi = rata-ratanya
            'records.*.nilai_indikator' => 'nullable|array',
            'records.*.nilai_indikator.*' => 'numeric|between:0,100',
            'records.*.nilai' => 'required_without:records.*.nilai_indikator|nullable|numeric|between:0,100',
            'records.*.poin_S' => 'nullable|numeric',
            'records.*.poin_T' => 'nullable|numeric',
            'records.*.poin_N' => 'nullable|numeric',
            'records.*.poin_K' => 'nullable|numeric',
            'records.*.poin_M' => 'nullable|numeric',
        ]);

        $this->cekMapel($request, $request->id_mapel);
        $meta = $request->only(self::META);
        $tipeBawaan = $request->input('tipe_nilai', 'NORMAL');

        // Indikator yang dinilai harus milik materi penilaian ini
        $idIndikator = collect($request->records)->flatMap(fn($r) => array_keys($r['nilai_indikator'] ?? []))->unique();
        $asing = $idIndikator->diff(MasterIndikator::where('id_materi', $meta['id_materi'])->whereIn('id_indikator', $idIndikator)->pluck('id_indikator'));
        if ($asing->isNotEmpty()) {
            return response()->json(['message' => 'Ada indikator yang bukan milik materi ini: ' . $asing->implode(', ')], 422);
        }

        $records = collect($request->records)->map(function ($r) use ($tipeBawaan) {
            $r += ['tipe_nilai' => $tipeBawaan];
            $r['nilai_indikator'] = array_map('floatval', $r['nilai_indikator'] ?? []);
            if ($r['nilai_indikator']) {
                $r['nilai'] = round(array_sum($r['nilai_indikator']) / count($r['nilai_indikator']), 2);
            }
            return $r;
        });
        if ($records->contains(fn($r) => !isset($r['nilai']))) {
            return response()->json(['message' => 'Setiap siswa harus punya nilai atau minimal satu nilai indikator.'], 422);
        }
        [$remedial, $normal] = $records->partition(fn($r) => $r['tipe_nilai'] === 'REMEDIAL');

        $idSiswa = $records->pluck('id_siswa')->unique();
        $bukanAnggota = $idSiswa->diff(Student::where('id_kelas', $meta['id_kelas'])->whereIn('id_siswa', $idSiswa)->pluck('id_siswa'));
        if ($bukanAnggota->isNotEmpty()) {
            return response()->json(['message' => 'Ada siswa yang bukan anggota kelas ini.'], 422);
        }
        if ($normal->pluck('id_siswa')->duplicates()->isNotEmpty()) {
            return response()->json(['message' => 'Satu siswa hanya boleh punya satu nilai reguler per tanggal penilaian.'], 422);
        }

        // Cocokkan setiap nilai remedial dengan rencana tindak lanjutnya
        $rencanaRemedial = [];
        foreach ($remedial as $i => $rec) {
            $rencana = $this->cariRencana($rec, $meta);
            if (!$rencana) {
                $nama = Student::find($rec['id_siswa'])?->nama_siswa ?? $rec['id_siswa'];
                return response()->json(['message' => "{$nama} belum punya rencana tindak lanjut untuk penilaian ini, jadi nilai remedialnya tidak dapat dicatat."], 422);
            }
            if (isset($rencanaRemedial[$rencana->id_rencana])) {
                return response()->json(['message' => 'Ada nilai remedial ganda untuk rencana yang sama.'], 422);
            }
            $rencanaRemedial[$rencana->id_rencana] = $rencana;
            $remedial[$i] = $rec + ['rencana' => $rencana];
        }

        $metode = $request->input('metode_stnkm', 'OTOMATIS');
        $mbk = MasterMBK::find($meta['id_jenis']);
        $materi = MasterMateri::find($meta['id_materi']);
        // Guru penilai: guru pemilik akun; admin/kepsek menilai atas nama guru pengampu mapel
        $user = $request->user();
        $guruAkun = $user->id_guru && Teacher::whereKey($user->id_guru)->exists() ? $user->id_guru : null;
        $guruPengampu = Subject::find($meta['id_mapel'])?->id_guru;

        $existing = $this->queryPenilaian($meta, $request->tanggal)->whereIn('id_siswa', $normal->pluck('id_siswa'))->get()->keyBy('id_siswa');
        $saved = 0; $updated = 0;

        DB::transaction(function () use ($request, $meta, $metode, $mbk, $materi, $user, $guruAkun, $guruPengampu, $existing, $normal, $remedial, &$saved, &$updated) {
            $simpan = function (array $rec, ?TransNilai $row, array $tambahan) use ($request, $meta, $metode, $mbk, $materi, $user, $guruAkun, $guruPengampu, &$saved, &$updated) {
                $nilai = (float) $rec['nilai'];
                $data = [
                    'tanggal' => $request->tanggal,
                    'nilai' => $nilai,
                    // Koreksi oleh admin/kepsek tidak mengganti guru penilai yang sudah tercatat
                    'id_guru' => $guruAkun ?? $row?->id_guru ?? $guruPengampu,
                    'diisi_oleh' => $user->id,
                    'metode_stnkm' => $metode,
                    ...($metode === 'MANUAL' ? $this->poinManual($rec) : $this->hitungStnkm($nilai, $mbk, $materi)),
                ];

                if ($row) {
                    $row->update($data);
                    $updated++;
                } else {
                    $row = TransNilai::create([
                        'id_nilai' => 'NIL-' . Str::uuid(),
                        'id_siswa' => $rec['id_siswa'],
                        ...$meta,
                        ...$data,
                        ...$tambahan,
                    ]);
                    $saved++;
                }
                $this->simpanNilaiIndikator($row, $rec['nilai_indikator']);
            };

            foreach ($normal as $rec) {
                $simpan($rec, $existing[$rec['id_siswa']] ?? null, ['tipe_nilai' => 'NORMAL']);
            }
            foreach ($remedial as $rec) {
                $rencana = $rec['rencana'];
                if ($rec['nilai_indikator']) {
                    // Remedial per indikator: indikator yang diulang menggantikan nilai asalnya, sisanya tetap,
                    // sehingga nilai remedial = rata-rata seluruh indikator setelah perbaikan
                    $gabungan = array_replace(
                        $rencana->nilaiAsal->nilaiIndikator->mapWithKeys(fn($i) => [$i->id_indikator => (float) $i->nilai])->all(),
                        $rec['nilai_indikator'],
                    );
                    $rec['nilai'] = round(array_sum($gabungan) / count($gabungan), 2);
                }
                $simpan($rec, $rencana->nilaiRemedial, ['tipe_nilai' => 'REMEDIAL', 'id_rencana' => $rencana->id_rencana]);
                RemedialService::tandaiSelesai($rencana, $request->tanggal);
            }
        });

        // Nilai di bawah KKM yang belum punya rencana tindak lanjut (asesmen diagnostik tidak ditindaklanjuti remedial)
        $kkm = in_array($meta['id_jenis'], TransNilai::jenisDiagnostik(), true) ? -1 : (float) (Subject::find($meta['id_mapel'])?->kkm ?? 75);
        $belumTuntas = fn($q) => $q->where('nilai', '<', $kkm)->doesntHave('rencana')->count();
        $perluTindakLanjut = $belumTuntas($this->queryPenilaian($meta, $request->tanggal)->whereIn('id_siswa', $normal->pluck('id_siswa')))
            + $belumTuntas(TransNilai::whereIn('id_rencana', array_keys($rencanaRemedial)));

        return response()->json([
            'success' => true,
            'message' => "Nilai disimpan. Baru: {$saved}, Diperbarui: {$updated}." . ($remedial->isNotEmpty() ? " {$remedial->count()} rencana remedial dituntaskan." : ''),
            'saved' => $saved,
            'updated' => $updated,
            'perlu_tindak_lanjut' => $perluTindakLanjut,
        ]);
    }

    /**
     * Samakan nilai per indikator dengan kiriman: indikator yang tidak dikirim lagi dihapus dari nilai ini,
     * sehingga kolom nilai selalu sama dengan rata-rata indikator yang tercatat.
     */
    private function simpanNilaiIndikator(TransNilai $row, array $nilaiIndikator): void
    {
        TransNilaiIndikator::where('id_nilai', $row->id_nilai)->whereNotIn('id_indikator', array_keys($nilaiIndikator))->delete();
        foreach ($nilaiIndikator as $idIndikator => $nilai) {
            TransNilaiIndikator::updateOrCreate(['id_nilai' => $row->id_nilai, 'id_indikator' => $idIndikator], ['nilai' => $nilai]);
        }
    }

    private function cariRencana(array $rec, array $meta): ?TransRencanaRemedial
    {
        $query = TransRencanaRemedial::with('nilaiRemedial', 'nilaiAsal.nilaiIndikator')
            ->where('id_siswa', $rec['id_siswa'])
            ->whereHas('nilaiAsal', fn($q) => $q->where($meta));

        if (!empty($rec['id_rencana'])) return $query->find($rec['id_rencana']);

        // Tanpa id_rencana (import Excel): rencana terbuka paling awal; bila semuanya sudah selesai,
        // rencana selesai terakhir sehingga nilai remedialnya diperbarui (koreksi lewat import)
        return (clone $query)->where('status', 'DIRENCANAKAN')->orderBy('tanggal_rencana')->first()
            ?? $query->where('status', 'SELESAI')->orderByDesc('tanggal_selesai')->orderByDesc('updated_at')->first();
    }

    public function destroy(Request $request, $id)
    {
        $nilai = TransNilai::with('rencanaAsal')->findOrFail($id);
        $this->cekMapel($request, $nilai->id_mapel);

        DB::transaction(function () use ($nilai) {
            // Rencana yang dipicu nilai ini ikut terhapus (cascade); sesi jadwalnya dibersihkan bila tak terpakai
            $rencana = TransRencanaRemedial::where('id_nilai_asal', $nilai->id_nilai)->get(['id_jadwal', 'bukti_url']);
            $rencanaAsal = $nilai->rencanaAsal;
            $nilai->delete();
            if ($rencanaAsal) RemedialService::bukaKembali($rencanaAsal);
            RemedialService::bersihkanJadwal($rencana->pluck('id_jadwal'));
            LampiranJadwalService::bersihkan($rencana->pluck('bukti_url'));
        });

        return response()->json(['success' => true, 'message' => 'Data nilai berhasil dihapus.']);
    }

    private function cekMapel(Request $request, ?string $idMapel): void
    {
        abort_unless($request->user()->bolehNilaiMapel($idMapel), 403, 'Anda hanya dapat mengelola nilai mata pelajaran yang Anda ampu.');
    }

    // Nilai reguler satu kombinasi penilaian, opsional dibatasi satu tanggal
    private function queryPenilaian(array $meta, ?string $tanggal = null)
    {
        return TransNilai::where($meta)
            ->where('tipe_nilai', 'NORMAL')
            ->when($tanggal, fn($q) => $q->whereDate('tanggal', $tanggal));
    }

    private function poinManual(array $rec): array
    {
        $poin = [];
        foreach (['S', 'T', 'N', 'K', 'M'] as $d) {
            $poin["poin_{$d}"] = round((float) ($rec["poin_{$d}"] ?? 0), 2);
        }
        return $poin;
    }

    /**
     * MESIN KALKULASI STNKM: Nilai × Matriks MBK × Matriks Materi
     */
    private function hitungStnkm(float $nilai, MasterMBK $mbk, MasterMateri $materi): array
    {
        $poin = [];
        foreach (['S', 'T', 'N', 'K', 'M'] as $d) {
            $poin["poin_{$d}"] = round($nilai * $mbk->{"mat_{$d}"} * $materi->{"mat_{$d}"}, 2);
        }
        return $poin;
    }
}

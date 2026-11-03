<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Classes;
use App\Models\MasterIndikator;
use App\Models\MasterMBK;
use App\Models\MasterMateri;
use App\Models\MasterPeriode;
use App\Models\Student;
use App\Models\Subject;
use App\Models\TransNilai;
use App\Models\TransNilaiIndikator;
use App\Models\TransRencanaRemedial;
use App\Services\RemedialService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

class NilaiController extends Controller
{
    private const RELASI = ['siswa', 'mapel', 'jenis', 'materi.kategori', 'nilaiIndikator.indikator:id_indikator,deskripsi', 'rencana.nilaiRemedial:id_nilai,id_rencana,nilai,tanggal', 'rencana.jadwal:id_jadwal,mulai,selesai,id_ruangan,status_sesi', 'rencanaAsal:id_rencana,opsi_tindakan,id_nilai_asal'];
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
        ]);
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
            ->with('rencana.nilaiRemedial:id_nilai,id_rencana,nilai,tanggal', 'rencana.jadwal:id_jadwal,mulai,selesai,id_ruangan,status_sesi', 'nilaiIndikator')
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
                'jadwal:id_jadwal,mulai,selesai,id_ruangan,status_sesi',
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
            'tanggal' => 'required|date',
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
        // Belum ada relasi users → teachers, jadi pengisi dicatat dengan nama akun
        $pengisi = Str::limit($request->user()->name ?? 'UNKNOWN', 50, '');

        $existing = $this->queryPenilaian($meta, $request->tanggal)->whereIn('id_siswa', $normal->pluck('id_siswa'))->get()->keyBy('id_siswa');
        $saved = 0; $updated = 0;

        DB::transaction(function () use ($request, $meta, $metode, $mbk, $materi, $pengisi, $existing, $normal, $remedial, &$saved, &$updated) {
            $simpan = function (array $rec, ?TransNilai $row, array $tambahan) use ($request, $meta, $metode, $mbk, $materi, $pengisi, &$saved, &$updated) {
                $nilai = (float) $rec['nilai'];
                $data = [
                    'tanggal' => $request->tanggal,
                    'nilai' => $nilai,
                    'id_guru' => $pengisi,
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

        // Nilai di bawah KKM yang belum punya rencana tindak lanjut
        $kkm = (float) (Subject::find($meta['id_mapel'])?->kkm ?? 75);
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
            $jadwal = TransRencanaRemedial::where('id_nilai_asal', $nilai->id_nilai)->pluck('id_jadwal');
            $rencanaAsal = $nilai->rencanaAsal;
            $nilai->delete();
            if ($rencanaAsal) RemedialService::bukaKembali($rencanaAsal);
            RemedialService::bersihkanJadwal($jadwal);
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

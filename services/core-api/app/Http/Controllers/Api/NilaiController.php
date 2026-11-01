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
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class NilaiController extends Controller
{
    private const RELASI = ['siswa', 'mapel', 'jenis', 'materi.kategori'];

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
        ]);
    }

    public function getMateriByContext(Request $request)
    {
        $query = MasterMateri::with('kategori');

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
     * Lembar nilai: seluruh siswa kelas beserta nilai yang sudah tercatat untuk kombinasi penilaian ini.
     */
    public function getStudentsWithNilai(Request $request)
    {
        $request->validate([
            'id_kelas' => 'required|exists:classes,id_kelas',
            'id_mapel' => 'required|exists:subjects,id_mapel',
            'id_periode' => 'required|exists:master_periode,id_periode',
            'id_jenis' => 'required|exists:master_mbk,id_jenis',
            'id_materi' => 'required|exists:master_materi,id_materi',
        ]);
        $this->cekMapel($request, $request->id_mapel);

        $students = Student::where('id_kelas', $request->id_kelas)
            ->orderBy('nama_siswa')
            ->get(['id_siswa', 'nisn', 'nama_siswa']);

        $existing = $this->queryPenilaian($request->only(['id_kelas', 'id_mapel', 'id_periode', 'id_jenis', 'id_materi']))
            ->whereIn('id_siswa', $students->pluck('id_siswa'))
            ->get()
            ->keyBy('id_siswa');

        return response()->json([
            'students' => $students->map(fn($s) => [
                'id_siswa' => $s->id_siswa,
                'nisn' => $s->nisn,
                'nama_siswa' => $s->nama_siswa,
                'id_nilai' => $existing[$s->id_siswa]->id_nilai ?? null,
                'nilai' => isset($existing[$s->id_siswa]) ? (float) $existing[$s->id_siswa]->nilai : null,
                'tanggal' => $existing[$s->id_siswa]->tanggal ?? null,
            ]),
        ]);
    }

    /**
     * Simpan lembar nilai. Satu siswa memiliki satu nilai per kombinasi
     * kelas + mapel + periode + jenis + materi; menyimpan ulang memperbarui nilai & tanggalnya.
     * Metode MANUAL (import Excel) memakai poin STNKM dari file apa adanya.
     */
    public function saveBatch(Request $request)
    {
        $request->validate([
            'id_kelas' => 'required|exists:classes,id_kelas',
            'id_mapel' => 'required|exists:subjects,id_mapel',
            'id_periode' => 'required|exists:master_periode,id_periode',
            'id_jenis' => 'required|exists:master_mbk,id_jenis',
            'id_materi' => 'required|exists:master_materi,id_materi',
            'tanggal' => 'required|date',
            'metode_stnkm' => 'nullable|in:OTOMATIS,MANUAL',
            'records' => 'required|array|min:1',
            'records.*.id_siswa' => 'required|distinct|exists:students,id_siswa',
            'records.*.nilai' => 'required|numeric|between:0,100',
            'records.*.poin_S' => 'nullable|numeric',
            'records.*.poin_T' => 'nullable|numeric',
            'records.*.poin_N' => 'nullable|numeric',
            'records.*.poin_K' => 'nullable|numeric',
            'records.*.poin_M' => 'nullable|numeric',
        ]);

        $this->cekMapel($request, $request->id_mapel);
        $meta = $request->only(['id_kelas', 'id_mapel', 'id_periode', 'id_jenis', 'id_materi']);

        $idSiswa = collect($request->records)->pluck('id_siswa');
        $bukanAnggota = $idSiswa->diff(Student::where('id_kelas', $meta['id_kelas'])->whereIn('id_siswa', $idSiswa)->pluck('id_siswa'));
        if ($bukanAnggota->isNotEmpty()) {
            return response()->json(['message' => 'Ada siswa yang bukan anggota kelas ini.'], 422);
        }

        $metode = $request->input('metode_stnkm', 'OTOMATIS');
        $mbk = MasterMBK::find($meta['id_jenis']);
        $materi = MasterMateri::find($meta['id_materi']);
        // Belum ada relasi users → teachers, jadi pengisi dicatat dengan nama akun
        $pengisi = Str::limit($request->user()->name ?? 'UNKNOWN', 50, '');

        $existing = $this->queryPenilaian($meta)->whereIn('id_siswa', $idSiswa)->get()->keyBy('id_siswa');
        $saved = 0; $updated = 0;

        DB::transaction(function () use ($request, $meta, $metode, $mbk, $materi, $pengisi, $existing, &$saved, &$updated) {
            foreach ($request->records as $rec) {
                $nilai = (float) $rec['nilai'];

                $data = [
                    'tanggal' => $request->tanggal,
                    'nilai' => $nilai,
                    'id_guru' => $pengisi,
                    'metode_stnkm' => $metode,
                    ...($metode === 'MANUAL' ? $this->poinManual($rec) : $this->hitungStnkm($nilai, $mbk, $materi)),
                ];

                if ($row = $existing[$rec['id_siswa']] ?? null) {
                    $row->update($data);
                    $updated++;
                } else {
                    TransNilai::create([
                        'id_nilai' => 'NIL-' . Str::uuid(),
                        'id_siswa' => $rec['id_siswa'],
                        ...$meta,
                        ...$data,
                    ]);
                    $saved++;
                }
            }
        });

        return response()->json([
            'success' => true,
            'message' => "Nilai disimpan. Baru: {$saved}, Diperbarui: {$updated}.",
            'saved' => $saved,
            'updated' => $updated,
        ]);
    }

    public function destroy(Request $request, $id)
    {
        $nilai = TransNilai::findOrFail($id);
        $this->cekMapel($request, $nilai->id_mapel);
        $nilai->delete();

        return response()->json(['success' => true, 'message' => 'Data nilai berhasil dihapus.']);
    }

    private function cekMapel(Request $request, ?string $idMapel): void
    {
        abort_unless($request->user()->bolehNilaiMapel($idMapel), 403, 'Anda hanya dapat mengelola nilai mata pelajaran yang Anda ampu.');
    }

    private function queryPenilaian(array $meta)
    {
        return TransNilai::where('id_kelas', $meta['id_kelas'])
            ->where('id_mapel', $meta['id_mapel'])
            ->where('id_periode', $meta['id_periode'])
            ->where('id_jenis', $meta['id_jenis'])
            ->where('id_materi', $meta['id_materi']);
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

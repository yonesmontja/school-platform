<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\MasterProyek;
use App\Models\MasterTargetP5;
use App\Models\Student;
use App\Models\TransCatatanP5;
use App\Models\TransJurnal;
use App\Models\TransNilai;
use App\Models\TransNilaiP5;
use App\Services\RaporAIService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

class P5Controller extends Controller
{
    private const DIMENSI_STNKM = ['S', 'T', 'N', 'K', 'M'];

    // Ambang predikat dari skor rata-rata poin STNKM (sama dengan GAS)
    private const AMBANG_PREDIKAT = ['SB' => 90, 'BSH' => 75, 'MB' => 60];

    /**
     * Projek kelas pada periode ini beserta target, siswa, catatan proses, dan nilai P5.
     */
    public function index(Request $request)
    {
        $request->validate([
            'id_kelas' => 'required|exists:classes,id_kelas',
            'id_periode' => 'required|exists:master_periode,id_periode',
        ]);
        $this->cekKelas($request, $request->id_kelas);

        $proyek = MasterProyek::with(['targets' => fn($q) => $q->orderBy('dimensi')->orderBy('created_at')])
            ->where('id_kelas', $request->id_kelas)
            ->where('id_periode', $request->id_periode)
            ->orderBy('created_at')
            ->get();
        $idProyek = $proyek->pluck('id_proyek');

        return response()->json([
            'proyek' => $proyek,
            'students' => Student::where('id_kelas', $request->id_kelas)->orderBy('nama_siswa')->get(['id_siswa', 'nisn', 'nama_siswa']),
            'catatan' => TransCatatanP5::whereIn('id_proyek', $idProyek)->get(['id_catatan_p5', 'id_proyek', 'id_siswa', 'catatan_proses', 'updated_at']),
            'nilai' => TransNilaiP5::whereIn('id_proyek', $idProyek)->get(['id_nilaip5', 'id_proyek', 'id_siswa', 'id_target', 'skor_rata2', 'predikat', 'updated_at']),
        ]);
    }

    // ================= PROJEK & TARGET =================

    private function rulesProyek(): array
    {
        return [
            'judul_proyek' => 'required|string|max:255',
            'deskripsi_proyek' => 'nullable|string|max:2000',
            'fase' => 'nullable|string|max:10',
            'id_kelas' => 'required|exists:classes,id_kelas',
            'id_periode' => 'required|exists:master_periode,id_periode',
            'targets' => 'required|array|min:1|max:50',
            'targets.*.id_target' => 'nullable|string|max:50',
            'targets.*.dimensi' => 'required|string|max:255',
            'targets.*.elemen' => 'nullable|string|max:255',
            'targets.*.sub_elemen' => 'nullable|string|max:255',
            'targets.*.capaian_akhir_fase' => 'nullable|string|max:2000',
            'targets.*.relasi_stnkm' => 'nullable|array',
            'targets.*.relasi_stnkm.*' => Rule::in(self::DIMENSI_STNKM),
        ];
    }

    public function storeProyek(Request $request)
    {
        $request->validate($this->rulesProyek());
        $this->cekKelas($request, $request->id_kelas);

        $proyek = DB::transaction(function () use ($request) {
            $proyek = MasterProyek::create([
                'id_proyek' => 'PRY-' . Str::uuid(),
                ...$request->only(['judul_proyek', 'deskripsi_proyek', 'fase', 'id_kelas', 'id_periode']),
            ]);
            $this->sinkronTarget($proyek, $request->targets);
            return $proyek;
        });

        return response()->json(['success' => true, 'message' => 'Projek P5 ditambahkan.', 'data' => $proyek->load('targets')], 201);
    }

    public function updateProyek(Request $request, $id)
    {
        $proyek = MasterProyek::findOrFail($id);
        $request->validate($this->rulesProyek());
        $this->cekKelas($request, $proyek->id_kelas);
        $this->cekKelas($request, $request->id_kelas);

        DB::transaction(function () use ($request, $proyek) {
            $proyek->update($request->only(['judul_proyek', 'deskripsi_proyek', 'fase', 'id_kelas', 'id_periode']));
            $this->sinkronTarget($proyek, $request->targets);
        });

        return response()->json(['success' => true, 'message' => 'Projek P5 diperbarui.', 'data' => $proyek->load('targets')]);
    }

    public function destroyProyek(Request $request, $id)
    {
        $proyek = MasterProyek::findOrFail($id);
        $this->cekKelas($request, $proyek->id_kelas);
        // Target, nilai, dan catatan P5 ikut terhapus (cascade)
        $proyek->delete();

        return response()->json(['success' => true, 'message' => 'Projek P5 beserta target, nilai, dan catatannya dihapus.']);
    }

    /**
     * Target yang dikirim diperbarui/ditambah; target lama yang tidak dikirim dihapus beserta nilainya.
     */
    private function sinkronTarget(MasterProyek $proyek, array $targets): void
    {
        $dipakai = [];
        foreach ($targets as $t) {
            $data = [
                'dimensi' => trim($t['dimensi']),
                'elemen' => $t['elemen'] ?? null,
                'sub_elemen' => $t['sub_elemen'] ?? null,
                'capaian_akhir_fase' => $t['capaian_akhir_fase'] ?? null,
                // Disimpan seperti GAS: "poin_K,poin_M"
                'relasi_stnkm' => collect($t['relasi_stnkm'] ?? [])->unique()->map(fn($d) => "poin_{$d}")->implode(',') ?: null,
            ];

            $target = !empty($t['id_target'])
                ? MasterTargetP5::where('id_proyek', $proyek->id_proyek)->find($t['id_target'])
                : null;

            if ($target) {
                $target->update($data);
            } else {
                $target = MasterTargetP5::create(['id_target' => 'TP5-' . Str::uuid(), 'id_proyek' => $proyek->id_proyek, ...$data]);
            }
            $dipakai[] = $target->id_target;
        }

        MasterTargetP5::where('id_proyek', $proyek->id_proyek)->whereNotIn('id_target', $dipakai)->delete();
    }

    // ================= CATATAN PROSES =================

    /**
     * Simpan catatan proses seluruh siswa untuk satu projek. Catatan kosong menghapus catatan lama,
     * sehingga rapor kembali memakai kalimat bawaan.
     */
    public function saveCatatan(Request $request)
    {
        $request->validate([
            'id_proyek' => 'required|exists:master_proyek,id_proyek',
            'records' => 'required|array|min:1',
            'records.*.id_siswa' => 'required|distinct|exists:students,id_siswa',
            'records.*.catatan_proses' => 'nullable|string|max:2000',
        ]);

        $proyek = MasterProyek::find($request->id_proyek);
        $this->cekKelas($request, $proyek->id_kelas);
        $idSiswa = collect($request->records)->pluck('id_siswa');
        $anggota = Student::where('id_kelas', $proyek->id_kelas)->whereIn('id_siswa', $idSiswa)->pluck('id_siswa');
        if ($idSiswa->diff($anggota)->isNotEmpty()) {
            return response()->json(['message' => 'Ada siswa yang bukan anggota kelas projek ini.'], 422);
        }

        $existing = TransCatatanP5::where('id_proyek', $proyek->id_proyek)->whereIn('id_siswa', $idSiswa)->get()->keyBy('id_siswa');
        $tersimpan = 0; $dihapus = 0;

        DB::transaction(function () use ($request, $proyek, $existing, &$tersimpan, &$dihapus) {
            foreach ($request->records as $rec) {
                $teks = trim((string) ($rec['catatan_proses'] ?? ''));
                $row = $existing[$rec['id_siswa']] ?? null;

                if ($teks === '') {
                    if ($row) { $row->delete(); $dihapus++; }
                    continue;
                }
                if ($row) {
                    if ($row->catatan_proses !== $teks) $row->update(['catatan_proses' => $teks]);
                } else {
                    TransCatatanP5::create([
                        'id_catatan_p5' => 'CP5-' . Str::uuid(),
                        'id_siswa' => $rec['id_siswa'],
                        'id_proyek' => $proyek->id_proyek,
                        'catatan_proses' => $teks,
                    ]);
                }
                $tersimpan++;
            }
        });

        return response()->json([
            'success' => true,
            'message' => "Catatan proses disimpan untuk {$tersimpan} siswa" . ($dihapus ? ", {$dihapus} catatan dikosongkan." : '.'),
        ]);
    }

    public function generateCatatan(Request $request, RaporAIService $ai)
    {
        $request->validate([
            'id_siswa' => 'required|exists:students,id_siswa',
            'id_proyek' => 'required|exists:master_proyek,id_proyek',
            'draf' => 'nullable|string|max:2000',
            'ai_mode' => ['nullable', Rule::in(RaporAIService::MODES)],
        ]);

        $siswa = Student::find($request->id_siswa);
        $proyek = MasterProyek::find($request->id_proyek);
        $this->cekKelas($request, $proyek->id_kelas);
        $jurnal = TransJurnal::where('id_siswa', $siswa->id_siswa)->orderBy('tanggal')->get(['narasi_kejadian'])->toArray();

        $hasil = $ai->catatanP5($siswa->nama_siswa, $proyek->judul_proyek, $proyek->deskripsi_proyek, $request->draf, $jurnal, $request->ai_mode ?? 'GEMINI');

        return response()->json(['success' => true, 'data' => $hasil['text'], 'mode' => $hasil['mode']]);
    }

    // ================= NILAI P5 =================

    /**
     * Ekstraksi predikat P5 dari nilai harian: skor = rata-rata poin STNKM yang direlasikan ke target,
     * dihitung dari seluruh nilai siswa pada kelas & periode projek. Menjalankan ulang menimpa hasil lama.
     */
    public function hitung(Request $request)
    {
        $request->validate(['id_proyek' => 'required|exists:master_proyek,id_proyek']);

        $proyek = MasterProyek::with('targets')->find($request->id_proyek);
        $this->cekKelas($request, $proyek->id_kelas);
        if ($proyek->targets->isEmpty()) {
            return response()->json(['message' => 'Projek ini belum memiliki target P5.'], 422);
        }

        $siswa = Student::where('id_kelas', $proyek->id_kelas)->pluck('id_siswa');
        if ($siswa->isEmpty()) {
            return response()->json(['message' => 'Tidak ada siswa di kelas projek ini.'], 422);
        }

        $nilai = TransNilai::efektif()->where('id_kelas', $proyek->id_kelas)
            ->where('id_periode', $proyek->id_periode)
            ->whereIn('id_siswa', $siswa)
            ->get(['id_siswa', 'poin_S', 'poin_T', 'poin_N', 'poin_K', 'poin_M'])
            ->groupBy('id_siswa');

        $existing = TransNilaiP5::where('id_proyek', $proyek->id_proyek)->get()
            ->keyBy(fn($n) => "{$n->id_siswa}|{$n->id_target}");
        $rekap = array_fill_keys(['SB', 'BSH', 'MB', 'BB'], 0);

        DB::transaction(function () use ($proyek, $siswa, $nilai, $existing, &$rekap) {
            foreach ($siswa as $idSiswa) {
                $riwayat = $nilai[$idSiswa] ?? collect();

                foreach ($proyek->targets as $target) {
                    $kolom = $this->kolomRelasi($target->relasi_stnkm);
                    $poin = $riwayat->flatMap(fn($n) => array_map(fn($k) => (float) $n->{$k}, $kolom));
                    $skor = $poin->isNotEmpty() ? round($poin->avg(), 2) : 0;
                    $predikat = $this->predikat($skor);
                    $rekap[$predikat]++;

                    $data = ['id_periode' => $proyek->id_periode, 'id_kelas' => $proyek->id_kelas, 'skor_rata2' => $skor, 'predikat' => $predikat];
                    if ($row = $existing["{$idSiswa}|{$target->id_target}"] ?? null) {
                        $row->update($data);
                    } else {
                        TransNilaiP5::create([
                            'id_nilaip5' => 'P5-' . Str::uuid(),
                            'id_proyek' => $proyek->id_proyek,
                            'id_siswa' => $idSiswa,
                            'id_target' => $target->id_target,
                            ...$data,
                        ]);
                    }
                }
            }
        });

        $total = array_sum($rekap);
        $tanpaRelasi = $proyek->targets->filter(fn($t) => empty($this->kolomRelasi($t->relasi_stnkm)))->count();

        return response()->json([
            'success' => true,
            'message' => "Berhasil mengekstrak {$total} predikat P5.",
            'rekap' => $rekap,
            'target_tanpa_relasi' => $tanpaRelasi,
        ]);
    }

    /**
     * Ubah predikat satu siswa pada satu target secara manual (penyesuaian guru setelah ekstraksi).
     */
    public function updateNilai(Request $request, $id)
    {
        $request->validate(['predikat' => 'required|in:SB,BSH,MB,BB']);
        $nilai = TransNilaiP5::findOrFail($id);
        $this->cekKelas($request, $nilai->id_kelas);
        $nilai->update(['predikat' => $request->predikat]);

        return response()->json(['success' => true, 'message' => 'Predikat diperbarui.', 'data' => $nilai]);
    }

    // Guru hanya mengelola P5 kelas binaannya (wali kelas)
    private function cekKelas(Request $request, ?string $idKelas): void
    {
        abort_unless($request->user()->bolehKelolaKelas($idKelas), 403, 'P5 kelas ini hanya dapat dikelola oleh wali kelasnya, kepala sekolah, atau admin.');
    }

    // "poin_K, poin_M" atau "K,M" → ['poin_K', 'poin_M']
    private function kolomRelasi(?string $relasi): array
    {
        return collect(explode(',', (string) $relasi))
            ->map(fn($r) => strtoupper(preg_replace('/^poin_/i', '', trim($r))))
            ->filter(fn($d) => in_array($d, self::DIMENSI_STNKM, true))
            ->unique()
            ->map(fn($d) => "poin_{$d}")
            ->values()
            ->all();
    }

    private function predikat(float $skor): string
    {
        foreach (self::AMBANG_PREDIKAT as $predikat => $ambang) {
            if ($skor >= $ambang) return $predikat;
        }
        return 'BB';
    }
}

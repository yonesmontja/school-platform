<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\MasterIndikator;
use App\Models\MasterKategoriPenilaian;
use App\Models\MasterMateri;
use App\Services\MateriAsistenService;
use App\Services\PerangkatAjarAIService;
use App\Services\SoalAIService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

class MateriController extends Controller
{
    public function index()
    {
        return response()->json([
            'data' => MasterMateri::with(['mapel', 'kelas', 'periode', 'kategori', 'indikator'])
                ->orderBy('nama_materi')
                ->get()
        ]);
    }

    public function byContext(Request $request)
    {
        $query = MasterMateri::with(['kategori', 'mapel', 'indikator' => fn ($q) => $q->where('aktif', true)]);

        if ($request->filled('id_kelas')) $query->where('id_kelas', $request->id_kelas);
        if ($request->filled('id_mapel')) $query->where('id_mapel', $request->id_mapel);
        if ($request->filled('id_periode')) $query->where('id_periode', $request->id_periode);

        return response()->json(['data' => $query->orderBy('nama_materi')->get()]);
    }

    public function store(Request $request)
    {
        $this->pastikanBolehKelola($request);

        $validator = Validator::make($request->all(), [
            'id_mapel' => 'required|exists:subjects,id_mapel',
            'id_kelas' => 'required|exists:classes,id_kelas',
            'id_periode' => 'required|exists:master_periode,id_periode',
            'id_kategori' => 'required|exists:master_kategori_penilaian,id_kategori',
            'nama_materi' => 'required|string|max:255',
            'deskripsi_kompetensi' => 'nullable|string',
            'mat_S' => 'required|numeric|between:0,1',
            'mat_T' => 'required|numeric|between:0,1',
            'mat_N' => 'required|numeric|between:0,1',
            'mat_K' => 'required|numeric|between:0,1',
            'mat_M' => 'required|numeric|between:0,1',
            // Daftar indikator (IKTP) disimpan bersama materi; yang tidak dikirim dibiarkan (hapus lewat endpoint indikator)
            'indikator' => 'nullable|array|max:50',
            'indikator.*.id_indikator' => 'nullable|string',
            'indikator.*.deskripsi' => 'required|string|max:1000',
            'indikator.*.aktif' => 'nullable|boolean',
        ]);

        if ($validator->fails()) {
            return response()->json(['message' => 'Validasi gagal', 'errors' => $validator->errors()], 422);
        }
        if (!MasterKategoriPenilaian::find($request->id_kategori)?->berlakuUntuk($request->id_mapel)) {
            return response()->json(['message' => 'Validasi gagal', 'errors' => ['id_kategori' => ['High Level ini khusus untuk mapel lain.']]], 422);
        }

        $materi = DB::transaction(function () use ($request) {
            $materi = MasterMateri::create([
                'id_materi' => 'MAT-' . Str::random(8),
                'id_mapel' => $request->id_mapel,
                'id_kelas' => $request->id_kelas,
                'id_periode' => $request->id_periode,
                'id_kategori' => $request->id_kategori,
                'nama_materi' => $request->nama_materi,
                'deskripsi_kompetensi' => $request->deskripsi_kompetensi,
                'mat_S' => $request->mat_S,
                'mat_T' => $request->mat_T,
                'mat_N' => $request->mat_N,
                'mat_K' => $request->mat_K,
                'mat_M' => $request->mat_M,
            ]);
            $this->simpanIndikator($request, $materi);
            return $materi;
        });

        return response()->json(['message' => 'Materi berhasil ditambahkan', 'data' => $materi->load(['mapel', 'kelas', 'periode', 'kategori', 'indikator'])], 201);
    }

    public function update(Request $request, $id)
    {
        $materi = MasterMateri::findOrFail($id);
        // Guru tidak boleh mengubah materi mapel lain, termasuk memindahkannya ke mapel yang ia ampu
        abort_unless($request->user()->bolehNilaiMapel($materi->id_mapel), 403, 'Anda hanya dapat mengelola materi mata pelajaran yang Anda ampu.');
        $this->pastikanBolehKelola($request);

        $validator = Validator::make($request->all(), [
            'id_mapel' => 'required|exists:subjects,id_mapel',
            'id_kelas' => 'required|exists:classes,id_kelas',
            'id_periode' => 'required|exists:master_periode,id_periode',
            'id_kategori' => 'required|exists:master_kategori_penilaian,id_kategori',
            'nama_materi' => 'required|string|max:255',
            'deskripsi_kompetensi' => 'nullable|string',
            'mat_S' => 'required|numeric|between:0,1',
            'mat_T' => 'required|numeric|between:0,1',
            'mat_N' => 'required|numeric|between:0,1',
            'mat_K' => 'required|numeric|between:0,1',
            'mat_M' => 'required|numeric|between:0,1',
            // Daftar indikator (IKTP) disimpan bersama materi; yang tidak dikirim dibiarkan (hapus lewat endpoint indikator)
            'indikator' => 'nullable|array|max:50',
            'indikator.*.id_indikator' => 'nullable|string',
            'indikator.*.deskripsi' => 'required|string|max:1000',
            'indikator.*.aktif' => 'nullable|boolean',
        ]);

        if ($validator->fails()) {
            return response()->json(['message' => 'Validasi gagal', 'errors' => $validator->errors()], 422);
        }
        if (!MasterKategoriPenilaian::find($request->id_kategori)?->berlakuUntuk($request->id_mapel)) {
            return response()->json(['message' => 'Validasi gagal', 'errors' => ['id_kategori' => ['High Level ini khusus untuk mapel lain.']]], 422);
        }

        DB::transaction(function () use ($request, $materi) {
            $materi->update([
                'id_mapel' => $request->id_mapel,
                'id_kelas' => $request->id_kelas,
                'id_periode' => $request->id_periode,
                'id_kategori' => $request->id_kategori,
                'nama_materi' => $request->nama_materi,
                'deskripsi_kompetensi' => $request->deskripsi_kompetensi,
                'mat_S' => $request->mat_S,
                'mat_T' => $request->mat_T,
                'mat_N' => $request->mat_N,
                'mat_K' => $request->mat_K,
                'mat_M' => $request->mat_M,
            ]);
            $this->simpanIndikator($request, $materi);
        });

        return response()->json(['message' => 'Materi berhasil diperbarui', 'data' => $materi->load(['mapel', 'kelas', 'periode', 'kategori', 'indikator'])]);
    }

    /** Tambah indikator baru & perbarui yang sudah ada (milik materi ini); urutan mengikuti susunan kiriman. */
    private function simpanIndikator(Request $request, MasterMateri $materi): void
    {
        if (!$request->has('indikator')) return;

        foreach (array_values($request->input('indikator', [])) as $i => $item) {
            $data = ['deskripsi' => trim($item['deskripsi']), 'urutan' => $i + 1, 'aktif' => (bool) ($item['aktif'] ?? true)];
            $lama = !empty($item['id_indikator'])
                ? MasterIndikator::where('id_materi', $materi->id_materi)->find($item['id_indikator'])
                : null;

            if ($lama) {
                $lama->update($data);
            } else {
                MasterIndikator::create($data + [
                    'id_indikator' => 'IND-' . Str::upper(Str::random(8)),
                    'id_materi' => $materi->id_materi,
                    'dibuat_oleh' => $request->user()->id,
                ]);
            }
        }
    }

    /** Guru hanya mengelola materi mapel yang ia ampu; admin & kepsek semua mapel. */
    private function pastikanBolehKelola(Request $request): void
    {
        if ($request->filled('id_mapel')) {
            abort_unless($request->user()->bolehNilaiMapel($request->id_mapel), 403, 'Anda hanya dapat mengelola materi mata pelajaran yang Anda ampu.');
        }
    }

    /** Isian form yang dipakai asisten (rujukan & AI). */
    private function isianAsisten(Request $request): array
    {
        $data = $request->validate([
            'id_materi' => 'nullable|string',
            'id_mapel' => 'required|exists:subjects,id_mapel',
            'id_kelas' => 'nullable|exists:classes,id_kelas',
            'id_periode' => 'nullable|exists:master_periode,id_periode',
            'id_kategori' => 'nullable|exists:master_kategori_penilaian,id_kategori',
            'nama_materi' => 'nullable|string|max:255',
            'deskripsi_kompetensi' => 'nullable|string|max:3000',
            'indikator' => 'nullable|array|max:50',
            'indikator.*.deskripsi' => 'nullable|string|max:1000',
        ]);
        abort_unless($request->user()->bolehNilaiMapel($data['id_mapel']), 403, 'Anda hanya dapat mengelola materi mata pelajaran yang Anda ampu.');
        return $data;
    }

    /** Daftar centang TP dari perangkat ajar yang sudah ada (ATP, Peta Tema, modul, materi lain, CP); tanpa AI. */
    public function rujukanTp(Request $request)
    {
        $layanan = new MateriAsistenService($request->user(), $this->isianAsisten($request));
        $rujukan = $layanan->rujukanTp();
        return response()->json([
            'data' => $rujukan,
            'message' => $rujukan ? null : 'Belum ada TP atau perangkat ajar untuk mapel–kelas ini. Tulis TP sendiri, atau minta saran AI.',
        ]);
    }

    /**
     * Bantuan AI untuk form Materi. bagian: semua (isi seluruh form) | tp (3 alternatif TP) | iktp (IKTP + bobot dari TP).
     * Hasil hanya usulan: guru memilih/mencentang lalu menyimpan lewat form seperti biasa.
     */
    public function asistenAI(Request $request, PerangkatAjarAIService $ai)
    {
        $request->validate([
            'ai_mode' => ['required', Rule::in(SoalAIService::MODES)],
            'bagian' => ['required', Rule::in(['semua', 'tp', 'iktp'])],
        ]);
        $isian = $this->isianAsisten($request);
        $layanan = new MateriAsistenService($request->user(), $isian);
        $konteks = $layanan->konteks();

        $hasil = $ai->susunMateri($konteks, $request->bagian, $request->ai_mode);
        if ($hasil === null) return response()->json(['message' => $ai->galat()], 422);

        $sudahAda = collect($isian['indikator'] ?? [])->pluck('deskripsi')->filter()->all();
        $bersih = fn($t) => Str::limit(trim(preg_replace('/\s+/', ' ', (string) $t)), 1000, '');
        $data = array_filter([
            'nama_materi' => isset($hasil['nama_materi']) ? Str::limit($bersih($hasil['nama_materi']), 255, '') : null,
            'tp' => isset($hasil['tp']) ? $bersih($hasil['tp']) : null,
            'tp_saran' => collect($hasil['tp_saran'] ?? [])->map($bersih)->filter()->unique()->take(5)->values()->all(),
            'iktp' => MateriAsistenService::normalIktp($hasil['iktp'] ?? [], $sudahAda),
            'bobot' => isset($hasil['bobot']) ? MateriAsistenService::normalBobot($hasil['bobot']) : null,
        ], fn($v) => $v !== null && $v !== '' && $v !== []);
        $data['alasan'] = Str::limit(trim((string) ($hasil['alasan'] ?? '')), 600, '');
        $data['sumber'] = array_values(array_filter([
            !empty($konteks['alur_atp']) ? 'alur ATP' : null,
            !empty($konteks['peta_tema']) ? 'Peta Tema' : null,
            !empty($konteks['cp']) ? 'CP' : null,
            !empty($konteks['materi_lain_mapel_kelas_ini']) ? 'materi lain' : null,
            !empty($konteks['isian_guru']['tp']) ? 'TP yang Anda tulis' : null,
        ]));

        return response()->json(['success' => true, 'data' => $data, 'mode' => $request->ai_mode]);
    }

    public function destroy($id)
    {
        $materi = MasterMateri::findOrFail($id);

        // Cek apakah masih dipakai di TransNilai
        $usedInNilai = \App\Models\TransNilai::where('id_materi', $id)->exists();
        if ($usedInNilai) {
            return response()->json(['message' => 'Materi tidak bisa dihapus karena masih digunakan di data nilai.'], 422);
        }

        $materi->delete();
        return response()->json(['message' => 'Materi berhasil dihapus']);
    }
}
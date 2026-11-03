<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\MasterIndikator;
use App\Models\MasterMateri;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

/**
 * Indikator Ketercapaian Tujuan Pembelajaran (IKTP).
 * Admin & kepsek mengelola semua mapel, guru hanya mapel yang diampu; hapus khusus admin
 * dan hanya untuk indikator yang belum pernah dipakai menilai (selainnya dinonaktifkan).
 */
class IndikatorController extends Controller
{
    public function index(Request $request)
    {
        $request->validate(['id_materi' => 'required|string']);

        return response()->json([
            'data' => MasterIndikator::where('id_materi', $request->id_materi)
                ->when(!$request->boolean('semua'), fn ($q) => $q->where('aktif', true))
                ->orderBy('urutan')->orderBy('created_at')
                ->get(),
        ]);
    }

    /** Tambah satu indikator, termasuk "sambil jalan" dari halaman Input Nilai. */
    public function store(Request $request)
    {
        $data = $request->validate([
            'id_materi' => 'required|exists:master_materi,id_materi',
            'deskripsi' => 'required|string|max:1000',
        ]);
        $materi = MasterMateri::findOrFail($data['id_materi']);
        $this->pastikanBolehKelola($request, $materi);

        $indikator = MasterIndikator::create([
            'id_indikator' => 'IND-' . Str::upper(Str::random(8)),
            'id_materi' => $materi->id_materi,
            'deskripsi' => trim($data['deskripsi']),
            'urutan' => (int) $materi->indikator()->max('urutan') + 1,
            'aktif' => true,
            'dibuat_oleh' => $request->user()->id,
        ]);

        return response()->json(['message' => 'Indikator berhasil ditambahkan', 'data' => $indikator], 201);
    }

    public function update(Request $request, string $id)
    {
        $indikator = MasterIndikator::with('materi')->findOrFail($id);
        $this->pastikanBolehKelola($request, $indikator->materi);

        $data = $request->validate([
            'deskripsi' => 'sometimes|required|string|max:1000',
            'aktif' => 'sometimes|boolean',
            'urutan' => 'sometimes|integer|min:0',
        ]);
        if (isset($data['deskripsi'])) $data['deskripsi'] = trim($data['deskripsi']);
        $indikator->update($data);

        return response()->json(['message' => 'Indikator berhasil diperbarui', 'data' => $indikator]);
    }

    public function destroy(string $id)
    {
        $indikator = MasterIndikator::findOrFail($id);
        if ($indikator->sudahDipakai()) {
            return response()->json(['message' => 'Indikator sudah dipakai menilai sehingga tidak bisa dihapus. Nonaktifkan saja agar tidak muncul lagi.'], 422);
        }

        $indikator->delete();
        return response()->json(['message' => 'Indikator berhasil dihapus']);
    }

    private function pastikanBolehKelola(Request $request, MasterMateri $materi): void
    {
        abort_unless($request->user()->bolehNilaiMapel($materi->id_mapel), 403, 'Anda hanya dapat mengelola indikator mata pelajaran yang Anda ampu.');
    }
}

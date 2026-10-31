<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\MasterMateri;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Str;

class MateriController extends Controller
{
    public function index()
    {
        return response()->json([
            'data' => MasterMateri::with(['mapel', 'kelas', 'periode', 'kategori'])
                ->orderBy('nama_materi')
                ->get()
        ]);
    }

    public function byContext(Request $request)
    {
        $query = MasterMateri::with('kategori');

        if ($request->filled('id_kelas')) $query->where('id_kelas', $request->id_kelas);
        if ($request->filled('id_mapel')) $query->where('id_mapel', $request->id_mapel);
        if ($request->filled('id_periode')) $query->where('id_periode', $request->id_periode);

        return response()->json(['data' => $query->orderBy('nama_materi')->get()]);
    }

    public function store(Request $request)
    {
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
        ]);

        if ($validator->fails()) {
            return response()->json(['message' => 'Validasi gagal', 'errors' => $validator->errors()], 422);
        }

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

        return response()->json(['message' => 'Materi berhasil ditambahkan', 'data' => $materi->load(['mapel', 'kelas', 'periode', 'kategori'])], 201);
    }

    public function update(Request $request, $id)
    {
        $materi = MasterMateri::findOrFail($id);

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
        ]);

        if ($validator->fails()) {
            return response()->json(['message' => 'Validasi gagal', 'errors' => $validator->errors()], 422);
        }

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

        return response()->json(['message' => 'Materi berhasil diperbarui', 'data' => $materi->load(['mapel', 'kelas', 'periode', 'kategori'])]);
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
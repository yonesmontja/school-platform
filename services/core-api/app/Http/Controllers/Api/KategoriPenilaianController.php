<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\MasterKategoriPenilaian;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Str;

class KategoriPenilaianController extends Controller
{
    public function index()
    {
        return response()->json([
            'data' => MasterKategoriPenilaian::with('mapel:id_mapel,nama_mapel')->orderBy('nama_kategori')->get()
        ]);
    }

    public function store(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'id_mapel' => 'nullable|exists:subjects,id_mapel',
            'nama_kategori' => 'required|string|max:150',
            'keterangan' => 'nullable|string',
        ]);

        if ($validator->fails()) {
            return response()->json(['message' => 'Validasi gagal', 'errors' => $validator->errors()], 422);
        }

        $kategori = MasterKategoriPenilaian::create([
            'id_kategori' => 'KAT-' . Str::random(8),
            'id_mapel' => $request->id_mapel ?: null,
            'nama_kategori' => $request->nama_kategori,
            'keterangan' => $request->keterangan,
        ]);

        return response()->json(['message' => 'Kategori berhasil ditambahkan', 'data' => $kategori], 201);
    }

    public function update(Request $request, $id)
    {
        $kategori = MasterKategoriPenilaian::findOrFail($id);

        $validator = Validator::make($request->all(), [
            'id_mapel' => 'nullable|exists:subjects,id_mapel',
            'nama_kategori' => 'required|string|max:150',
            'keterangan' => 'nullable|string',
        ]);

        if ($validator->fails()) {
            return response()->json(['message' => 'Validasi gagal', 'errors' => $validator->errors()], 422);
        }

        $idMapel = $request->id_mapel ?: null;
        // Membatasi ke satu mapel tidak boleh membuat materi mapel lain kehilangan High Level-nya
        if ($idMapel && \App\Models\MasterMateri::where('id_kategori', $id)->where('id_mapel', '!=', $idMapel)->exists()) {
            return response()->json(['message' => 'High Level ini sudah dipakai materi mapel lain, jadi tidak bisa dikhususkan ke satu mapel.'], 422);
        }

        $kategori->update([
            'id_mapel' => $idMapel,
            'nama_kategori' => $request->nama_kategori,
            'keterangan' => $request->keterangan,
        ]);

        return response()->json(['message' => 'Kategori berhasil diperbarui', 'data' => $kategori]);
    }

    public function destroy($id)
    {
        $kategori = MasterKategoriPenilaian::findOrFail($id);

        // Cek apakah dipakai di MasterMateri
        $usedInMateri = \App\Models\MasterMateri::where('id_kategori', $id)->exists();
        if ($usedInMateri) {
            return response()->json(['message' => 'Kategori tidak bisa dihapus karena masih digunakan di data materi.'], 422);
        }

        $kategori->delete();
        return response()->json(['message' => 'Kategori berhasil dihapus']);
    }
}
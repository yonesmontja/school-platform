<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\MasterMBK;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Str;

class MBKController extends Controller
{
    public function index()
    {
        return response()->json([
            'data' => MasterMBK::orderBy('kategori_penilaian')->get()
        ]);
    }

    public function store(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'kategori_penilaian' => 'required|string|max:100',
            'jenis_asesmen' => 'required|in:DIAGNOSTIK,FORMATIF,SUMATIF',
            'keterangan' => 'nullable|string',
            'mat_S' => 'required|numeric|between:0,1',
            'mat_T' => 'required|numeric|between:0,1',
            'mat_N' => 'required|numeric|between:0,1',
            'mat_K' => 'required|numeric|between:0,1',
            'mat_M' => 'required|numeric|between:0,1',
        ]);

        if ($validator->fails()) {
            return response()->json(['message' => 'Validasi gagal', 'errors' => $validator->errors()], 422);
        }

        $mbk = MasterMBK::create([
            'id_jenis' => 'MBK-' . Str::random(8),
            'kategori_penilaian' => $request->kategori_penilaian,
            'jenis_asesmen' => $request->jenis_asesmen,
            'keterangan' => $request->keterangan,
            'mat_S' => $request->mat_S,
            'mat_T' => $request->mat_T,
            'mat_N' => $request->mat_N,
            'mat_K' => $request->mat_K,
            'mat_M' => $request->mat_M,
        ]);

        return response()->json(['message' => 'MBK berhasil ditambahkan', 'data' => $mbk], 201);
    }

    public function update(Request $request, $id)
    {
        $mbk = MasterMBK::findOrFail($id);

        $validator = Validator::make($request->all(), [
            'kategori_penilaian' => 'required|string|max:100',
            'jenis_asesmen' => 'required|in:DIAGNOSTIK,FORMATIF,SUMATIF',
            'keterangan' => 'nullable|string',
            'mat_S' => 'required|numeric|between:0,1',
            'mat_T' => 'required|numeric|between:0,1',
            'mat_N' => 'required|numeric|between:0,1',
            'mat_K' => 'required|numeric|between:0,1',
            'mat_M' => 'required|numeric|between:0,1',
        ]);

        if ($validator->fails()) {
            return response()->json(['message' => 'Validasi gagal', 'errors' => $validator->errors()], 422);
        }

        $mbk->update([
            'kategori_penilaian' => $request->kategori_penilaian,
            'jenis_asesmen' => $request->jenis_asesmen,
            'keterangan' => $request->keterangan,
            'mat_S' => $request->mat_S,
            'mat_T' => $request->mat_T,
            'mat_N' => $request->mat_N,
            'mat_K' => $request->mat_K,
            'mat_M' => $request->mat_M,
        ]);

        return response()->json(['message' => 'MBK berhasil diperbarui', 'data' => $mbk]);
    }

    public function destroy($id)
    {
        $mbk = MasterMBK::findOrFail($id);

        // Cek apakah masih dipakai di TransNilai
        $usedInNilai = \App\Models\TransNilai::where('id_jenis', $id)->exists();
        if ($usedInNilai) {
            return response()->json(['message' => 'MBK tidak bisa dihapus karena masih digunakan di data nilai.'], 422);
        }

        $mbk->delete();
        return response()->json(['message' => 'MBK berhasil dihapus']);
    }
}
<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\MasterPeriode;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Str;

class PeriodeController extends Controller
{
    public function index()
    {
        return response()->json([
            'data' => MasterPeriode::orderByDesc('tahun_ajaran')
                ->orderBy('semester')
                ->get()
        ]);
    }

    public function store(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'tahun_ajaran' => 'required|string|max:20',
            'semester' => 'required|in:Ganjil,Genap',
            'status_aktif' => 'required|in:AKTIF,TUTUP',
        ]);

        if ($validator->fails()) {
            return response()->json(['message' => 'Validasi gagal', 'errors' => $validator->errors()], 422);
        }

        DB::beginTransaction();
        try {
            // Jika periode baru di-set AKTIF, matikan semua periode lain
            if ($request->status_aktif === 'AKTIF') {
                MasterPeriode::where('status_aktif', 'AKTIF')->update(['status_aktif' => 'TUTUP']);
            }

            $periode = MasterPeriode::create([
                'id_periode' => 'PER-' . Str::random(8),
                'tahun_ajaran' => $request->tahun_ajaran,
                'semester' => $request->semester,
                'status_aktif' => $request->status_aktif,
            ]);

            DB::commit();
            return response()->json(['message' => 'Periode berhasil ditambahkan', 'data' => $periode], 201);
        } catch (\Exception $e) {
            DB::rollBack();
            return response()->json(['message' => $e->getMessage()], 500);
        }
    }

    public function update(Request $request, $id)
    {
        $periode = MasterPeriode::findOrFail($id);

        $validator = Validator::make($request->all(), [
            'tahun_ajaran' => 'required|string|max:20',
            'semester' => 'required|in:Ganjil,Genap',
            'status_aktif' => 'required|in:AKTIF,TUTUP',
        ]);

        if ($validator->fails()) {
            return response()->json(['message' => 'Validasi gagal', 'errors' => $validator->errors()], 422);
        }

        DB::beginTransaction();
        try {
            // Jika di-set AKTIF, matikan yang lain
            if ($request->status_aktif === 'AKTIF' && $periode->status_aktif !== 'AKTIF') {
                MasterPeriode::where('status_aktif', 'AKTIF')
                    ->where('id_periode', '!=', $id)
                    ->update(['status_aktif' => 'TUTUP']);
            }

            $periode->update([
                'tahun_ajaran' => $request->tahun_ajaran,
                'semester' => $request->semester,
                'status_aktif' => $request->status_aktif,
            ]);

            DB::commit();
            return response()->json(['message' => 'Periode berhasil diperbarui', 'data' => $periode]);
        } catch (\Exception $e) {
            DB::rollBack();
            return response()->json(['message' => $e->getMessage()], 500);
        }
    }

    public function destroy($id)
    {
        $periode = MasterPeriode::findOrFail($id);

        // Cek apakah periode masih dipakai di transaksi
        $usedInNilai = \App\Models\TransNilai::where('id_periode', $id)->exists();
        if ($usedInNilai) {
            return response()->json(['message' => 'Periode tidak bisa dihapus karena masih digunakan di data nilai.'], 422);
        }

        $periode->delete();
        return response()->json(['message' => 'Periode berhasil dihapus']);
    }
}
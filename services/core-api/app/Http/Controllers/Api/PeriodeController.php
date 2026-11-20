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
            'tanggal_mulai' => 'nullable|date_format:Y-m-d',
            'tanggal_selesai' => 'nullable|date_format:Y-m-d|after:tanggal_mulai',
        ]);

        if ($validator->fails()) {
            return response()->json(['message' => 'Validasi gagal', 'errors' => $validator->errors()], 422);
        }

        DB::beginTransaction();
        try {
            // Jika periode baru di-set AKTIF, matikan semua periode lain
            if ($request->status_aktif === 'AKTIF') {
                $this->potretAktif();
                MasterPeriode::where('status_aktif', 'AKTIF')->update(['status_aktif' => 'TUTUP']);
            }

            $periode = MasterPeriode::create([
                'id_periode' => 'PER-' . Str::random(8),
                'tahun_ajaran' => $request->tahun_ajaran,
                'semester' => $request->semester,
                'status_aktif' => $request->status_aktif,
                'tanggal_mulai' => $request->tanggal_mulai ?: null,
                'tanggal_selesai' => $request->tanggal_selesai ?: null,
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
            'tanggal_mulai' => 'nullable|date_format:Y-m-d',
            'tanggal_selesai' => 'nullable|date_format:Y-m-d|after:tanggal_mulai',
        ]);

        if ($validator->fails()) {
            return response()->json(['message' => 'Validasi gagal', 'errors' => $validator->errors()], 422);
        }

        DB::beginTransaction();
        try {
            // Jika di-set AKTIF, matikan yang lain
            if ($periode->status_aktif === 'AKTIF' && $request->status_aktif !== 'AKTIF') {
                $this->potretAktif();
            }
            if ($request->status_aktif === 'AKTIF' && $periode->status_aktif !== 'AKTIF') {
                $this->potretAktif();
                MasterPeriode::where('status_aktif', 'AKTIF')
                    ->where('id_periode', '!=', $id)
                    ->update(['status_aktif' => 'TUTUP']);
            }

            // Semester yang diaktifkan selalu terbuka untuk diisi
            if ($request->status_aktif === 'AKTIF') $periode->forceFill(['terkunci' => false, 'dikunci_pada' => null]);
            $periode->update([
                'tahun_ajaran' => $request->tahun_ajaran,
                'semester' => $request->semester,
                'status_aktif' => $request->status_aktif,
                'tanggal_mulai' => $request->tanggal_mulai ?: null,
                'tanggal_selesai' => $request->tanggal_selesai ?: null,
            ]);

            DB::commit();
            return response()->json(['message' => 'Periode berhasil diperbarui', 'data' => $periode]);
        } catch (\Exception $e) {
            DB::rollBack();
            return response()->json(['message' => $e->getMessage()], 500);
        }
    }

    /**
     * Sebelum semester aktif berganti, rombel & wali kelas sekarang dipotret ke riwayat semester itu,
     * agar rapor dan laporan semester tersebut tetap memuat siswa & wali yang benar setelah kenaikan kelas.
     */
    private function potretAktif(): void
    {
        $aktif = \App\Services\RiwayatRombel::periodeAktif();
        if ($aktif) \App\Services\RiwayatRombel::potret($aktif);
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
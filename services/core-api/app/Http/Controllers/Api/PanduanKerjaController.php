<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Teacher;
use App\Services\PanduanKerjaService;
use Illuminate\Http\Request;

/**
 * Peta kerja guru (halaman Panduan & kartu Dashboard): progres alur kerja semester dari data nyata.
 * Guru melihat miliknya; admin & kepala sekolah boleh memilih guru mana pun untuk memantau.
 */
class PanduanKerjaController extends Controller
{
    public function index(Request $request)
    {
        $u = $request->user();
        $idGuru = $u->id_guru;
        if ($u->isPengelola() && $request->filled('id_guru')) $idGuru = $request->id_guru;
        $daftar = $u->isPengelola() ? Teacher::orderBy('nama_guru')->get(['id_guru', 'nama_guru']) : null;

        if (!$idGuru) {
            return response()->json(['data' => null, 'daftar_guru' => $daftar,
                'message' => $u->isPengelola() ? 'Pilih guru untuk melihat peta kerjanya.' : 'Akun ini belum terhubung ke data guru.']);
        }
        $guru = Teacher::findOrFail($idGuru);
        return response()->json(['data' => (new PanduanKerjaService($guru))->hitung(), 'daftar_guru' => $daftar]);
    }
}

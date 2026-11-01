<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\WhatsAppService;
use Illuminate\Http\Request;

class WhatsAppController extends Controller
{
    /**
     * Kirim pesan otomatis lewat gateway Fonnte (dipakai Cetak Rapor & Presensi).
     */
    public function kirim(Request $request, WhatsAppService $wa)
    {
        $request->validate([
            'daftar_pesan' => 'required|array|min:1|max:50',
            'daftar_pesan.*.target' => 'required|string|max:100',
            'daftar_pesan.*.message' => 'required|string|max:4000',
        ]);

        $hasil = $wa->kirim($request->daftar_pesan);

        return response()->json($hasil, $hasil['sent'] ? 200 : 422);
    }
}

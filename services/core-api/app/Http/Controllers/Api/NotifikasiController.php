<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\NotifikasiDibaca;
use App\Services\NotifikasiService;
use Illuminate\Http\Request;

/**
 * Pusat notifikasi "Perlu Tindakan" untuk semua peran. Notifikasi dihitung dari data saat diminta;
 * yang disimpan hanya penanda sudah dibaca per pengguna.
 */
class NotifikasiController extends Controller
{
    public function index(Request $request)
    {
        $item = (new NotifikasiService($request->user()))->semua();
        $dibaca = NotifikasiDibaca::where('user_id', $request->user()->id)
            ->whereIn('kunci', $item->pluck('kunci'))->pluck('kunci')->flip();
        $item = $item->map(fn($n) => $n + ['dibaca' => isset($dibaca[$n['kunci']])]);

        return response()->json([
            'data' => $item,
            'belum_dibaca' => $item->where('dibaca', false)->count(),
            'mendesak' => $item->where('dibaca', false)->where('tingkat', 'danger')->count(),
        ]);
    }

    /** Tandai dibaca: kunci tertentu, atau semua notifikasi yang sedang tampil bila kunci tidak dikirim. */
    public function baca(Request $request)
    {
        $request->validate(['kunci' => 'nullable|array|max:200', 'kunci.*' => 'string|max:191']);
        $kunci = $request->kunci ?? (new NotifikasiService($request->user()))->semua()->pluck('kunci')->all();

        $sekarang = now();
        NotifikasiDibaca::upsert(
            array_map(fn($k) => ['user_id' => $request->user()->id, 'kunci' => $k, 'dibaca_pada' => $sekarang], $kunci),
            ['user_id', 'kunci'], ['dibaca_pada']
        );
        // Penanda lama yang notifikasinya sudah tidak ada lagi dibersihkan
        NotifikasiDibaca::where('user_id', $request->user()->id)->where('dibaca_pada', '<', now()->subDays(60))->delete();

        return response()->json(['success' => true, 'jumlah' => count($kunci)]);
    }
}

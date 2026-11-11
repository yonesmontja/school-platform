<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\HariLibur;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/** Kalender hari libur selain Minggu. Semua akun boleh membaca; admin & kepala sekolah mengelola. */
class HariLiburController extends Controller
{
    public function index(Request $request)
    {
        $request->validate(['tahun' => 'nullable|integer|min:2000|max:2100', 'dari' => 'nullable|date', 'sampai' => 'nullable|date']);
        $q = HariLibur::query()->orderBy('tanggal');
        if ($request->tahun) $q->whereYear('tanggal', $request->tahun);
        if ($request->dari) $q->whereDate('tanggal', '>=', $request->dari);
        if ($request->sampai) $q->whereDate('tanggal', '<=', $request->sampai);
        return response()->json([
            'data' => $q->get(),
            'tahun' => HariLibur::query()->selectRaw('DISTINCT EXTRACT(YEAR FROM tanggal)::int AS t')->orderBy('t')->pluck('t'),
            'jenis' => HariLibur::JENIS,
        ]);
    }

    public function store(Request $request)
    {
        $data = $this->valid($request);
        $h = HariLibur::create($data + ['perlu_cek' => false]);
        return response()->json(['message' => 'Hari libur ditambahkan.', 'data' => $h], 201);
    }

    public function update(Request $request, int $id)
    {
        $h = HariLibur::findOrFail($id);
        $h->update($this->valid($request, $id) + ['perlu_cek' => false]);
        return response()->json(['message' => 'Hari libur diperbarui.', 'data' => $h]);
    }

    public function destroy(int $id)
    {
        HariLibur::findOrFail($id)->delete();
        return response()->json(['message' => 'Hari libur dihapus. Tanggal itu kembali menjadi hari sekolah.']);
    }

    /** Tandai seluruh data satu tahun sudah dicocokkan dengan dokumen SKB resmi. */
    public function tandaiCek(Request $request)
    {
        $request->validate(['tahun' => 'required|integer|min:2000|max:2100']);
        $n = HariLibur::whereYear('tanggal', $request->tahun)->where('perlu_cek', true)->update(['perlu_cek' => false]);
        return response()->json(['message' => $n ? "{$n} tanggal ditandai sudah dicek." : 'Semua tanggal tahun ini sudah dicek.']);
    }

    private function valid(Request $request, ?int $id = null): array
    {
        return $request->validate([
            'tanggal' => ['required', 'date_format:Y-m-d', Rule::unique('hari_libur', 'tanggal')->ignore($id)],
            'nama' => 'required|string|max:120',
            'jenis' => ['required', Rule::in(array_keys(HariLibur::JENIS))],
        ], ['tanggal.unique' => 'Tanggal ini sudah terdaftar sebagai hari libur.']);
    }
}

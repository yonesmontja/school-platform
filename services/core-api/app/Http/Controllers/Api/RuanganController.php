<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\MasterRuangan;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class RuanganController extends Controller
{
    public function index()
    {
        return response()->json(['data' => MasterRuangan::orderBy('nama_ruangan')->get()]);
    }

    private function rules(): array
    {
        return [
            'nama_ruangan' => 'required|string|max:150',
            'kapasitas' => 'nullable|integer|between:1,1000',
            'keterangan' => 'nullable|string|max:255',
        ];
    }

    public function store(Request $request)
    {
        $request->validate($this->rules());
        $ruangan = MasterRuangan::create([
            'id_ruangan' => 'RNG-' . Str::upper(Str::random(8)),
            ...$request->only(['nama_ruangan', 'kapasitas', 'keterangan']),
        ]);

        return response()->json(['success' => true, 'message' => 'Ruangan ditambahkan.', 'data' => $ruangan], 201);
    }

    public function update(Request $request, $id)
    {
        $ruangan = MasterRuangan::findOrFail($id);
        $request->validate($this->rules());
        $ruangan->update($request->only(['nama_ruangan', 'kapasitas', 'keterangan']));

        return response()->json(['success' => true, 'message' => 'Ruangan diperbarui.', 'data' => $ruangan]);
    }

    public function destroy($id)
    {
        // Jadwal yang memakai ruangan ini tetap ada, kolom ruangannya dikosongkan (nullOnDelete)
        MasterRuangan::findOrFail($id)->delete();

        return response()->json(['success' => true, 'message' => 'Ruangan dihapus.']);
    }
}

<?php
namespace App\Http\Controllers\Api;
use App\Http\Controllers\Controller;
use App\Models\Classes;
use Illuminate\Http\Request;

class ClassesController extends Controller {
    public function index() {
        return response()->json(['data' => Classes::with('waliKelas')->get()]);
    }
    public function store(Request $request) {
        $data = $request->all();
        if(empty($data['id_kelas'])) $data['id_kelas'] = 'KLS-' . time();
        $class = Classes::create($data);
        return response()->json(['message' => 'Kelas ditambahkan', 'data' => $class]);
    }
    public function update(Request $request, $id) {
        $class = Classes::findOrFail($id);
        $class->update($request->all());
        return response()->json(['message' => 'Kelas diperbarui', 'data' => $class]);
    }
    public function destroy($id) {
        Classes::findOrFail($id)->delete();
        return response()->json(['message' => 'Kelas dihapus']);
    }
}
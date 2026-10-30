<?php
namespace App\Http\Controllers\Api;
use App\Http\Controllers\Controller;
use App\Models\Subject;
use Illuminate\Http\Request;

class SubjectController extends Controller {
    public function index() {
        return response()->json(['data' => Subject::with('guru')->get()]);
    }
    public function store(Request $request) {
        $data = $request->all();
        if(empty($data['id_mapel'])) $data['id_mapel'] = 'MPL-' . time();
        $subject = Subject::create($data);
        return response()->json(['message' => 'Mapel ditambahkan', 'data' => $subject]);
    }
    public function update(Request $request, $id) {
        $subject = Subject::findOrFail($id);
        $subject->update($request->all());
        return response()->json(['message' => 'Mapel diperbarui', 'data' => $subject]);
    }
    public function destroy($id) {
        Subject::findOrFail($id)->delete();
        return response()->json(['message' => 'Mapel dihapus']);
    }
}
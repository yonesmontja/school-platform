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
        $request->validate(['kkm' => 'nullable|integer|between:0,100']);
        $data = $request->all();
        if (!isset($data['kkm']) || $data['kkm'] === '') unset($data['kkm']);
        if(empty($data['id_mapel'])) $data['id_mapel'] = 'MPL-' . time();
        $subject = Subject::create($data);
        return response()->json(['message' => 'Mapel ditambahkan', 'data' => $subject]);
    }
    public function update(Request $request, $id) {
        $request->validate(['kkm' => 'nullable|integer|between:0,100']);
        $subject = Subject::findOrFail($id);
        $data = $request->all();
        if (!isset($data['kkm']) || $data['kkm'] === '') unset($data['kkm']);
        $subject->update($data);
        return response()->json(['message' => 'Mapel diperbarui', 'data' => $subject]);
    }
    public function destroy($id) {
        Subject::findOrFail($id)->delete();
        return response()->json(['message' => 'Mapel dihapus']);
    }
}
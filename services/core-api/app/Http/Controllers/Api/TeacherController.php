<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Teacher;
use Illuminate\Http\Request;
use App\Services\BerkasTtd;
use Illuminate\Support\Facades\Storage;

class TeacherController extends Controller
{
    public function index()
    {
        return response()->json(['data' => Teacher::orderBy('nama_guru')->get()]);
    }

    public function store(Request $request)
    {
        $request->validate([
            'nama_guru' => 'required|string|max:255',
            'no_wa' => 'nullable|string|max:20',
        ]);

        $data = $request->except('ttd_guru_base64');
        if (empty($data['id_guru'])) {
            $data['id_guru'] = 'GR-' . time();
        }

        // Handle Upload TTD
        if ($request->filled('ttd_guru_base64')) {
            $data['ttd_guru_url'] = BerkasTtd::simpan($request->ttd_guru_base64, 'ttd_guru', 'ttd_guru_base64');
        }

        $teacher = Teacher::create($data);
        return response()->json(['message' => 'Guru ditambahkan', 'data' => $teacher], 201);
    }

    public function update(Request $request, $id)
    {
        $teacher = Teacher::findOrFail($id);
        $request->validate(['no_wa' => 'nullable|string|max:20']);
        $data = $request->except('ttd_guru_base64');

        // Handle Upload TTD Baru
        if ($request->filled('ttd_guru_base64')) {
            $baru = BerkasTtd::simpan($request->ttd_guru_base64, 'ttd_guru', 'ttd_guru_base64');
            BerkasTtd::hapus($teacher->ttd_guru_url);
            $data['ttd_guru_url'] = $baru;
        }

        $teacher->update($data);
        return response()->json(['message' => 'Guru diperbarui', 'data' => $teacher]);
    }

    public function destroy($id)
    {
        $teacher = Teacher::findOrFail($id);
        BerkasTtd::hapus($teacher->ttd_guru_url);
        $teacher->delete();
        return response()->json(['message' => 'Guru dihapus']);
    }
}
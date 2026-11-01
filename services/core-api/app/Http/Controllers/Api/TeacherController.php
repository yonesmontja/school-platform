<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Teacher;
use Illuminate\Http\Request;
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
            $image_parts = explode(";base64,", $request->ttd_guru_base64);
            $image_base64 = base64_decode($image_parts[1]);
            $fileName = 'ttd_guru_' . time() . '.png';
            Storage::disk('public')->put('signatures/' . $fileName, $image_base64);
            $data['ttd_guru_url'] = '/storage/signatures/' . $fileName;
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
            // Hapus TTD lama jika ada
            if ($teacher->ttd_guru_url) {
                $oldPath = str_replace('/storage/', '', $teacher->ttd_guru_url);
                Storage::disk('public')->delete($oldPath);
            }

            $image_parts = explode(";base64,", $request->ttd_guru_base64);
            $image_base64 = base64_decode($image_parts[1]);
            $fileName = 'ttd_guru_' . time() . '.png';
            Storage::disk('public')->put('signatures/' . $fileName, $image_base64);
            $data['ttd_guru_url'] = '/storage/signatures/' . $fileName;
        }

        $teacher->update($data);
        return response()->json(['message' => 'Guru diperbarui', 'data' => $teacher]);
    }

    public function destroy($id)
    {
        $teacher = Teacher::findOrFail($id);
        if ($teacher->ttd_guru_url) {
            $oldPath = str_replace('/storage/', '', $teacher->ttd_guru_url);
            Storage::disk('public')->delete($oldPath);
        }
        $teacher->delete();
        return response()->json(['message' => 'Guru dihapus']);
    }
}
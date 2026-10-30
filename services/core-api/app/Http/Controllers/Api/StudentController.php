<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Student;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;

class StudentController extends Controller
{
    // GET /api/students
    public function index(Request $request)
    {
        $query = Student::with(['kelas', 'agama', 'suku']);

        if ($request->filled('search')) {
            $q = $request->search;
            $query->where(function ($sub) use ($q) {
                $sub->where('nama_siswa', 'like', "%{$q}%")
                    ->orWhere('nisn', 'like', "%{$q}%");
            });
        }

        if ($request->filled('id_kelas') && $request->id_kelas !== 'ALL') {
            $query->where('id_kelas', $request->id_kelas);
        }

        // Menggunakan get() agar data dikirim semua dan paginasi diurus oleh Tabulator (Next.js)
        return response()->json(['data' => $query->orderBy('nama_siswa')->get()]);
    }

    // POST /api/students
    public function store(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'nama_siswa' => 'required|string|max:255',
            'nisn' => 'nullable|string|max:20|unique:students,nisn',
            'jenis_kelamin' => 'required|in:L,P',
        ]);

        if ($validator->fails()) {
            return response()->json(['message' => 'Validasi gagal', 'errors' => $validator->errors()], 422);
        }

        // Generate ID otomatis seperti GAS: SIS-{timestamp}
        $data = $request->all();
        if (empty($data['id_siswa'])) {
            $data['id_siswa'] = 'SIS-' . now()->timestamp;
        }

        $student = Student::create($data);

        return response()->json(['message' => 'Siswa berhasil ditambahkan', 'data' => $student], 201);
    }

    // PUT /api/students/{id}
    public function update(Request $request, $id)
    {
        $student = Student::findOrFail($id);

        $validator = Validator::make($request->all(), [
            'nama_siswa' => 'sometimes|required|string|max:255',
            'nisn' => 'nullable|string|max:20|unique:students,nisn,' . $id . ',id_siswa',
            'jenis_kelamin' => 'sometimes|required|in:L,P',
        ]);

        if ($validator->fails()) {
            return response()->json(['message' => 'Validasi gagal', 'errors' => $validator->errors()], 422);
        }

        $student->update($request->all());

        return response()->json(['message' => 'Siswa berhasil diperbarui', 'data' => $student]);
    }

    // DELETE /api/students/{id}
    public function destroy($id)
    {
        $student = Student::findOrFail($id);
        $student->delete();

        return response()->json(['message' => 'Siswa berhasil dihapus']);
    }

    // GET /api/students/master-data (untuk dropdown)
    public function getMasterData()
    {
        try {
            return response()->json([
                'classes' => \App\Models\Classes::with('waliKelas')->get(),
                'agama' => \App\Models\MasterAgama::all(),
                'suku' => \App\Models\MasterSuku::all(),
                'sekolahAsal' => \App\Models\MasterSekolahAsal::all(),
                'wilayah' => \App\Models\MasterWilayah::all(),
                'ortu' => \App\Models\MasterOrtu::all(),
                'wali' => \App\Models\MasterWali::all(),
            ]);
        } catch (\Exception $e) {
            return response()->json(['error' => $e->getMessage()], 500);
        }
    }
}
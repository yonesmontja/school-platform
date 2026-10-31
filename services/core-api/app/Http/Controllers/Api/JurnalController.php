<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\TransJurnal;
use App\Services\JurnalAIService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Str;

class JurnalController extends Controller
{
    // Hanya tipe ini yang boleh diunggah; ekstensi ditentukan server, bukan dari input user
    private const LAMPIRAN_MIME = [
        'image/jpeg' => 'jpg',
        'image/png' => 'png',
        'image/webp' => 'webp',
        'application/pdf' => 'pdf',
    ];
    private const LAMPIRAN_MAX_BYTES = 5 * 1024 * 1024;

    protected JurnalAIService $aiService;

    public function __construct(JurnalAIService $aiService)
    {
        $this->aiService = $aiService;
    }

    public function index(Request $request)
    {
        $query = TransJurnal::with(['siswa', 'kelas', 'guru', 'jenis', 'materi']);

        if ($request->filled('id_kelas')) {
            $query->where('id_kelas', $request->id_kelas);
        }

        return response()->json([
            'data' => $query->orderByDesc('tanggal')->orderByDesc('created_at')->get()
        ]);
    }

    public function analyze(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'narasi_kejadian' => 'required|string|min:10|max:2000',
            'ai_mode' => 'nullable|in:GEMINI,HEURISTIK',
        ]);

        if ($validator->fails()) {
            return response()->json(['message' => 'Validasi gagal', 'errors' => $validator->errors()], 422);
        }

        $result = $this->aiService->analyze(
            $request->narasi_kejadian,
            $request->ai_mode ?? 'GEMINI'
        );

        return response()->json([
            'success' => true,
            'data' => $result,
        ]);
    }

    public function store(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'tanggal' => 'required|date',
            'id_siswa' => 'required|exists:students,id_siswa',
            'id_kelas' => 'required|exists:classes,id_kelas',
            'id_guru' => 'nullable|exists:teachers,id_guru',
            'id_jenis' => 'nullable|exists:master_mbk,id_jenis',
            'id_materi' => 'nullable|exists:master_materi,id_materi',
            'narasi_kejadian' => 'required|string|min:10|max:2000',
            'mode_dampak' => 'required|in:BONUS,PISAH',
            'ai_mode' => 'nullable|in:GEMINI,HEURISTIK',
            'ai_raw_response' => 'nullable|string|max:10000',
            'val_S' => 'nullable|numeric|between:-5,5',
            'val_T' => 'nullable|numeric|between:-5,5',
            'val_N' => 'nullable|numeric|between:-5,5',
            'val_K' => 'nullable|numeric|between:-5,5',
            'val_M' => 'nullable|numeric|between:-5,5',
            'lampiran_base64' => 'nullable|string',
        ]);

        if ($validator->fails()) {
            return response()->json(['message' => 'Validasi gagal', 'errors' => $validator->errors()], 422);
        }

        $lampiranUrl = null;
        if ($request->filled('lampiran_base64')) {
            // Buang header "data:...;base64," jika ada; tipe asli dicek dari isi file
            $base64 = preg_replace('/^data:[^;]*;base64,/', '', $request->lampiran_base64);
            $decoded = base64_decode($base64, true);

            if ($decoded === false || $decoded === '') {
                return response()->json(['message' => 'Lampiran tidak valid.'], 422);
            }
            if (strlen($decoded) > self::LAMPIRAN_MAX_BYTES) {
                return response()->json(['message' => 'Ukuran lampiran maksimal 5MB.'], 422);
            }

            $mime = (new \finfo(FILEINFO_MIME_TYPE))->buffer($decoded);
            if (!isset(self::LAMPIRAN_MIME[$mime])) {
                return response()->json(['message' => 'Lampiran harus berupa gambar (JPG/PNG/WEBP) atau PDF.'], 422);
            }

            $fileName = 'jurnal_' . Str::random(16) . '.' . self::LAMPIRAN_MIME[$mime];
            Storage::disk('public')->put('jurnal/' . $fileName, $decoded);
            $lampiranUrl = '/storage/jurnal/' . $fileName;
        }

        $jurnal = TransJurnal::create([
            'id_jurnal' => 'JRN-' . Str::uuid(),
            'tanggal' => $request->tanggal,
            'id_siswa' => $request->id_siswa,
            'id_kelas' => $request->id_kelas,
            // Belum ada relasi users → teachers, jadi guru dipilih dari form (opsional)
            'id_guru' => $request->id_guru,
            'id_jenis' => $request->id_jenis,
            'id_materi' => $request->id_materi,
            'narasi_kejadian' => $request->narasi_kejadian,
            'lampiran_url' => $lampiranUrl,
            'mode_dampak' => $request->mode_dampak,
            'val_S' => $request->val_S ?? 0,
            'val_T' => $request->val_T ?? 0,
            'val_N' => $request->val_N ?? 0,
            'val_K' => $request->val_K ?? 0,
            'val_M' => $request->val_M ?? 0,
            'ai_mode' => $request->ai_mode ?? 'HEURISTIK',
            'ai_raw_response' => $request->ai_raw_response,
        ]);

        return response()->json([
            'success' => true,
            'message' => 'Jurnal berhasil disimpan',
            'data' => $jurnal->load(['siswa', 'kelas']),
        ], 201);
    }

    public function destroy($id)
    {
        $jurnal = TransJurnal::findOrFail($id);

        // Hapus lampiran jika ada
        if ($jurnal->lampiran_url) {
            $path = Str::after($jurnal->lampiran_url, '/storage/');
            Storage::disk('public')->delete($path);
        }

        $jurnal->delete();
        return response()->json(['message' => 'Jurnal berhasil dihapus']);
    }
}

<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Classes;
use App\Models\MasterMateri;
use App\Models\Student;
use App\Models\Subject;
use App\Models\TransJurnal;
use App\Services\JurnalAIService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

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

    // ortu/wali untuk nomor WA, materi.mapel untuk label di halaman jurnal
    private const RELASI = ['siswa.ortu', 'siswa.wali', 'kelas', 'guru', 'jenis', 'materi.mapel'];

    protected JurnalAIService $aiService;

    public function __construct(JurnalAIService $aiService)
    {
        $this->aiService = $aiService;
    }

    public function index(Request $request)
    {
        $query = TransJurnal::with(self::RELASI);

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
            // LOKAL = nama lain untuk HEURISTIK
            'ai_mode' => ['nullable', Rule::in([...JurnalAIService::MODES, 'LOKAL'])],
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

    private function rules(): array
    {
        return [
            'tanggal' => 'required|date',
            'id_siswa' => 'required|exists:students,id_siswa',
            'id_kelas' => 'required|exists:classes,id_kelas',
            'id_guru' => 'nullable|exists:teachers,id_guru',
            'id_jenis' => 'nullable|exists:master_mbk,id_jenis',
            'id_materi' => 'nullable|exists:master_materi,id_materi',
            'narasi_kejadian' => 'required|string|min:10|max:2000',
            'mode_dampak' => 'required|in:BONUS,PISAH',
            'ai_mode' => ['nullable', Rule::in(JurnalAIService::MODES)],
            'ai_raw_response' => 'nullable|string|max:10000',
            'val_S' => 'nullable|numeric|between:-5,5',
            'val_T' => 'nullable|numeric|between:-5,5',
            'val_N' => 'nullable|numeric|between:-5,5',
            'val_K' => 'nullable|numeric|between:-5,5',
            'val_M' => 'nullable|numeric|between:-5,5',
            'lampiran_base64' => 'nullable|string',
            'hapus_lampiran' => 'nullable|boolean',
        ];
    }

    /**
     * Simpan lampiran base64 ke storage. Mengembalikan [url, null] atau [null, pesan error].
     */
    private function simpanLampiran(string $lampiranBase64): array
    {
        // Buang header "data:...;base64," jika ada; tipe asli dicek dari isi file
        $base64 = preg_replace('/^data:[^;]*;base64,/', '', $lampiranBase64);
        $decoded = base64_decode($base64, true);

        if ($decoded === false || $decoded === '') {
            return [null, 'Lampiran tidak valid.'];
        }
        if (strlen($decoded) > self::LAMPIRAN_MAX_BYTES) {
            return [null, 'Ukuran lampiran maksimal 5MB.'];
        }

        $mime = (new \finfo(FILEINFO_MIME_TYPE))->buffer($decoded);
        if (!isset(self::LAMPIRAN_MIME[$mime])) {
            return [null, 'Lampiran harus berupa gambar (JPG/PNG/WEBP) atau PDF.'];
        }

        $fileName = 'jurnal_' . Str::random(16) . '.' . self::LAMPIRAN_MIME[$mime];
        Storage::disk('public')->put('jurnal/' . $fileName, $decoded);
        return ['/storage/jurnal/' . $fileName, null];
    }

    private function hapusFileLampiran(?string $lampiranUrl): void
    {
        if ($lampiranUrl) {
            Storage::disk('public')->delete(Str::after($lampiranUrl, '/storage/'));
        }
    }

    /**
     * Guru yang tercatat pada jurnal: akun guru = dirinya sendiri. Bila diisi admin/kepsek: guru yang dipilih di form,
     * atau guru pengampu mapel dari materinya, atau (jurnal observasi tanpa materi) wali kelas siswa.
     */
    private function guruJurnal(Request $request, ?string $idMateri, ?string $idKelas): ?string
    {
        $user = $request->user();
        if ($user->isGuru() && $user->id_guru) return $user->id_guru;
        if ($request->id_guru) return $request->id_guru;
        $pengampu = $idMateri ? Subject::whereKey(MasterMateri::whereKey($idMateri)->value('id_mapel'))->value('id_guru') : null;
        return $pengampu ?? ($idKelas ? Classes::whereKey($idKelas)->value('wali_kelas') : null);
    }

    private function dataJurnal(Request $request): array
    {
        return [
            'tanggal' => $request->tanggal,
            'id_siswa' => $request->id_siswa,
            'id_kelas' => $request->id_kelas,
            'id_guru' => $this->guruJurnal($request, $request->id_materi, $request->id_kelas),
            'id_jenis' => $request->id_jenis,
            'id_materi' => $request->id_materi,
            'narasi_kejadian' => $request->narasi_kejadian,
            'mode_dampak' => $request->mode_dampak,
            'val_S' => $request->val_S ?? 0,
            'val_T' => $request->val_T ?? 0,
            'val_N' => $request->val_N ?? 0,
            'val_K' => $request->val_K ?? 0,
            'val_M' => $request->val_M ?? 0,
            'ai_mode' => $request->ai_mode ?? 'HEURISTIK',
            'ai_raw_response' => $request->ai_raw_response,
        ];
    }

    public function store(Request $request)
    {
        $validator = Validator::make($request->all(), $this->rules());

        if ($validator->fails()) {
            return response()->json(['message' => 'Validasi gagal', 'errors' => $validator->errors()], 422);
        }

        $lampiranUrl = null;
        if ($request->filled('lampiran_base64')) {
            [$lampiranUrl, $error] = $this->simpanLampiran($request->lampiran_base64);
            if ($error) return response()->json(['message' => $error], 422);
        }

        $jurnal = TransJurnal::create([
            'id_jurnal' => 'JRN-' . Str::uuid(),
            ...$this->dataJurnal($request),
            'lampiran_url' => $lampiranUrl,
        ]);

        return response()->json([
            'success' => true,
            'message' => 'Jurnal berhasil disimpan',
            'data' => $jurnal->load(self::RELASI),
        ], 201);
    }

    public function update(Request $request, $id)
    {
        $jurnal = TransJurnal::findOrFail($id);
        $this->cekPemilik($request, $jurnal);

        $validator = Validator::make($request->all(), $this->rules());

        if ($validator->fails()) {
            return response()->json(['message' => 'Validasi gagal', 'errors' => $validator->errors()], 422);
        }

        $data = $this->dataJurnal($request);

        // Lampiran baru menggantikan yang lama; tanpa lampiran baru, yang lama dipertahankan kecuali diminta hapus
        if ($request->filled('lampiran_base64')) {
            [$lampiranUrl, $error] = $this->simpanLampiran($request->lampiran_base64);
            if ($error) return response()->json(['message' => $error], 422);
            $this->hapusFileLampiran($jurnal->lampiran_url);
            $data['lampiran_url'] = $lampiranUrl;
        } elseif ($request->boolean('hapus_lampiran')) {
            $this->hapusFileLampiran($jurnal->lampiran_url);
            $data['lampiran_url'] = null;
        }

        $jurnal->update($data);

        return response()->json([
            'success' => true,
            'message' => 'Jurnal berhasil diperbarui',
            'data' => $jurnal->load(self::RELASI),
        ]);
    }

    /**
     * Import massal dari Excel. Skor STNKM diambil dari file apa adanya (tanpa analisis AI).
     */
    public function importBatch(Request $request)
    {
        $request->validate([
            'id_jenis' => 'nullable|exists:master_mbk,id_jenis',
            'mode_dampak' => 'required|in:BONUS,PISAH',
            'records' => 'required|array|min:1|max:1000',
            'records.*.id_siswa' => 'required|exists:students,id_siswa',
            'records.*.tanggal' => 'required|date',
            'records.*.narasi_kejadian' => 'required|string|max:2000',
            'records.*.val_S' => 'nullable|numeric|between:-5,5',
            'records.*.val_T' => 'nullable|numeric|between:-5,5',
            'records.*.val_N' => 'nullable|numeric|between:-5,5',
            'records.*.val_K' => 'nullable|numeric|between:-5,5',
            'records.*.val_M' => 'nullable|numeric|between:-5,5',
        ]);

        $kelasSiswa = Student::whereIn('id_siswa', collect($request->records)->pluck('id_siswa'))->pluck('id_kelas', 'id_siswa');
        $tanpaKelas = collect($request->records)->pluck('id_siswa')->unique()->filter(fn($id) => empty($kelasSiswa[$id]));
        if ($tanpaKelas->isNotEmpty()) {
            return response()->json(['message' => 'Siswa belum memiliki kelas: ' . $tanpaKelas->implode(', ')], 422);
        }

        DB::transaction(function () use ($request, $kelasSiswa) {
            foreach ($request->records as $rec) {
                TransJurnal::create([
                    'id_jurnal' => 'JRN-' . Str::uuid(),
                    'tanggal' => $rec['tanggal'],
                    'id_siswa' => $rec['id_siswa'],
                    'id_kelas' => $kelasSiswa[$rec['id_siswa']],
                    'id_jenis' => $request->id_jenis,
                    'id_guru' => $this->guruJurnal($request, null, $kelasSiswa[$rec['id_siswa']]),
                    'narasi_kejadian' => $rec['narasi_kejadian'],
                    'mode_dampak' => $request->mode_dampak,
                    'val_S' => $rec['val_S'] ?? 0,
                    'val_T' => $rec['val_T'] ?? 0,
                    'val_N' => $rec['val_N'] ?? 0,
                    'val_K' => $rec['val_K'] ?? 0,
                    'val_M' => $rec['val_M'] ?? 0,
                    'ai_mode' => 'HEURISTIK',
                ]);
            }
        });

        $jumlah = count($request->records);
        return response()->json(['success' => true, 'message' => "{$jumlah} jurnal berhasil diimpor.", 'saved' => $jumlah], 201);
    }

    public function destroy(Request $request, $id)
    {
        $jurnal = TransJurnal::findOrFail($id);
        $this->cekPemilik($request, $jurnal);

        $this->hapusFileLampiran($jurnal->lampiran_url);

        $jurnal->delete();
        return response()->json(['message' => 'Jurnal berhasil dihapus']);
    }

    // Guru hanya boleh mengubah/menghapus jurnal yang ia tulis sendiri
    private function cekPemilik(Request $request, TransJurnal $jurnal): void
    {
        $user = $request->user();
        abort_if($user->isGuru() && $jurnal->id_guru !== $user->id_guru, 403, 'Anda hanya dapat mengubah atau menghapus jurnal yang Anda tulis.');
    }
}

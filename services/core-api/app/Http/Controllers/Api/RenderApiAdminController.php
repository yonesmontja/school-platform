<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ApiKlien;
use App\Models\RenderApi;
use App\Models\TempatPeta;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\URL;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

/** Halaman admin "API Render": kunci API aplikasi luar, riwayat job render, dan tabel tempat terverifikasi. */
class RenderApiAdminController extends Controller
{
    public function ringkasan()
    {
        return response()->json([
            'klien' => ApiKlien::orderByDesc('created_at')->get()->map(fn($k) => $k->only(['id', 'nama', 'awalan', 'aktif', 'terakhir_dipakai', 'created_at'])
                + ['jumlah_job' => RenderApi::where('id_klien', $k->id)->count()]),
            'job' => RenderApi::with('klien:id,nama')->orderByDesc('created_at')->limit(50)->get()->map(fn($j) => [
                'id' => $j->id, 'klien' => $j->klien?->nama, 'status' => $j->status, 'episode' => $j->episode, 'templat' => $j->templat,
                'suara' => $j->suara, 'peringatan' => $j->peringatan ?? [], 'pesan' => $j->pesan, 'durasi_detik' => $j->durasi_detik,
                'ukuran_kb' => $j->ukuran_kb, 'created_at' => $j->created_at, 'selesai_pada' => $j->selesai_pada,
                'video_url' => $j->status === 'done' && $j->file_path ? URL::temporarySignedRoute('render-api.berkas', now()->addHours(6), ['id' => $j->id, 'jenis' => 'video']) : null,
            ]),
            'endpoint' => url('/api/v1'),
        ]);
    }

    public function buatKlien(Request $request)
    {
        $request->validate(['nama' => 'required|string|max:80']);
        [$klien, $kunci] = ApiKlien::buat($request->nama, $request->user()->id);
        return response()->json(['message' => 'Kunci API dibuat. Salin sekarang; kunci tidak akan ditampilkan lagi.', 'kunci' => $kunci,
            'data' => $klien->only(['id', 'nama', 'awalan', 'aktif', 'created_at'])], 201);
    }

    public function ubahKlien(Request $request, int $id)
    {
        $request->validate(['aktif' => 'required|boolean']);
        ApiKlien::findOrFail($id)->update(['aktif' => $request->boolean('aktif')]);
        return response()->json(['message' => $request->boolean('aktif') ? 'Kunci diaktifkan.' : 'Kunci dinonaktifkan; aplikasi itu tidak bisa memakai API lagi.']);
    }

    public function hapusKlien(int $id)
    {
        $k = ApiKlien::findOrFail($id);
        foreach (RenderApi::where('id_klien', $k->id)->get() as $j) {
            Storage::disk('local')->delete(array_filter([$j->file_path, $j->poster_path]));
        }
        $k->delete();
        return response()->json(['message' => 'Kunci dan seluruh hasil render-nya dihapus.']);
    }

    public function hapusJob(string $id)
    {
        $j = RenderApi::findOrFail($id);
        abort_if($j->status === 'rendering', 422, 'Job sedang dirender; tunggu sampai selesai.');
        Storage::disk('local')->delete(array_filter([$j->file_path, $j->poster_path]));
        $j->delete();
        return response()->json(['message' => 'Job render dihapus.']);
    }

    public function tempat(Request $request)
    {
        $request->validate(['q' => 'nullable|string|max:80', 'jenis' => 'nullable|in:titik,wilayah']);
        $q = TempatPeta::query()->orderBy('nama');
        if ($request->q) {
            $kecil = '%' . mb_strtolower($request->q) . '%';
            $q->where(fn($w) => $w->whereRaw('LOWER(nama) LIKE ?', [$kecil])->orWhere('kode', 'like', $kecil)->orWhereRaw('LOWER(alias::text) LIKE ?', [$kecil]));
        }
        if ($request->jenis) $q->where('jenis', $request->jenis);
        return response()->json(['data' => $q->limit(100)->get(), 'total' => TempatPeta::count()]);
    }

    public function simpanTempat(Request $request, ?int $id = null)
    {
        $data = $request->validate([
            'nama' => 'required|string|max:120',
            'kode' => ['nullable', 'string', 'max:80', 'regex:/^[a-z0-9-]+$/', Rule::unique('tempat_peta', 'kode')->ignore($id)],
            'alias' => 'nullable|array|max:10', 'alias.*' => 'string|max:120',
            'jenis' => 'required|in:titik,wilayah',
            'lat' => 'required|numeric|between:-85,85', 'lon' => 'required|numeric|between:-180,180',
            'bbox' => 'nullable|array|size:4', 'bbox.*' => 'numeric',
            'negara' => 'nullable|string|max:80',
            'sumber' => 'required|string|max:200',
        ], ['sumber.required' => 'Tulis sumber verifikasi koordinat (mis. peta resmi, geocoder, dokumen).']);
        if ($data['jenis'] === 'wilayah' && !empty($data['bbox'])) {
            [$x0, $y0, $x1, $y1] = $data['bbox'];
            abort_unless($x0 < $x1 && $y0 < $y1 && $y0 >= -85 && $y1 <= 85, 422, 'bbox harus [bujur barat, lintang selatan, bujur timur, lintang utara].');
        } else {
            $data['bbox'] = null;
        }
        $data['kode'] = ($data['kode'] ?? null) ?: Str::slug($data['nama']);
        if (!$id && TempatPeta::where('kode', $data['kode'])->exists()) $data['kode'] .= '-' . Str::lower(Str::random(4));
        $t = $id ? tap(TempatPeta::findOrFail($id))->update($data) : TempatPeta::create($data);
        return response()->json(['message' => 'Tempat disimpan.', 'data' => $t], $id ? 200 : 201);
    }

    public function hapusTempat(int $id)
    {
        TempatPeta::findOrFail($id)->delete();
        return response()->json(['message' => 'Tempat dihapus dari tabel terverifikasi.']);
    }
}

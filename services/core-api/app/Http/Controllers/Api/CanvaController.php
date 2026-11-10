<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\CanvaToken;
use App\Models\VideoAset;
use App\Services\CanvaService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use RuntimeException;

/**
 * Impor desain Canva ke Studio Rakit Video (E3). Hanya pembuat video yang ditunjuk admin (atau admin) yang memakai
 * Studio, jadi akses mengikuti aturan Studio. Desain diekspor Canva menjadi PNG/JPG lalu disimpan sebagai aset gambar.
 */
class CanvaController extends Controller
{
    public function __construct(private CanvaService $canva) {}

    private function cekStudio(Request $request): void
    {
        $u = $request->user();
        abort_unless($u->id === VideoBelajarController::pengaturanStudio()['id_pembuat'] || $u->isAdmin(), 403, 'Studio Rakit Video hanya untuk pembuat video yang ditunjuk admin.');
    }

    private function gagal(RuntimeException $e)
    {
        return response()->json(['message' => $e->getMessage()], 422);
    }

    public function status(Request $request)
    {
        $this->cekStudio($request);
        $t = CanvaToken::where('id_user', $request->user()->id)->first();
        return response()->json(['data' => ['terkonfigurasi' => (bool) CanvaService::kredensial(), 'tersambung' => (bool) $t, 'nama' => $t?->nama_canva]]);
    }

    /** Mulai OAuth: frontend mengirim asal halamannya; URL otorisasi Canva dikembalikan untuk dibuka. */
    public function sambung(Request $request)
    {
        $this->cekStudio($request);
        $d = $request->validate(['asal' => ['required', 'string', 'max:200', 'regex:#^https?://[a-z0-9.-]+(:\d{2,5})?$#i']]);
        try {
            return response()->json(['url' => $this->canva->urlSambung($request->user()->id, strtolower($d['asal']))]);
        } catch (RuntimeException $e) { return $this->gagal($e); }
    }

    /** Callback dari Canva (tanpa token login; dikenali lewat `state` sekali pakai), lalu kembali ke Studio. */
    public function kembali(Request $request)
    {
        $state = (string) $request->query('state', '');
        if (!preg_match('/^[A-Za-z0-9]{40}$/', $state)) abort(400, 'Permintaan Canva tidak sah.');
        $asal = cache("canva_state_{$state}")['asal'] ?? null;
        if (!$asal) abort(400, 'Sesi penyambungan Canva kedaluwarsa. Ulangi dari Studio.');
        if ($request->filled('error') || !$request->filled('code')) {
            cache()->forget("canva_state_{$state}");
            return redirect("{$asal}/canva-selesai.html?canva=batal");
        }
        try {
            $this->canva->selesaikan($state, (string) $request->query('code'));
            return redirect("{$asal}/canva-selesai.html?canva=tersambung");
        } catch (RuntimeException $e) {
            report($e);
            return redirect("{$asal}/canva-selesai.html?canva=gagal");
        }
    }

    public function putuskan(Request $request)
    {
        $this->cekStudio($request);
        $this->canva->putuskan($request->user()->id);
        return response()->json(['success' => true, 'message' => 'Akun Canva diputuskan.']);
    }

    public function desain(Request $request)
    {
        $this->cekStudio($request);
        $d = $request->validate(['cari' => 'nullable|string|max:255', 'lanjutan' => 'nullable|string|max:500']);
        try {
            return response()->json(['data' => $this->canva->daftarDesain($request->user()->id, $d['cari'] ?? null, $d['lanjutan'] ?? null)]);
        } catch (RuntimeException $e) { return $this->gagal($e); }
    }

    /** Ekspor desain (PNG/JPG, halaman tertentu atau semua, maks. 10) dan simpan tiap halaman sebagai aset gambar. */
    public function impor(Request $request)
    {
        $this->cekStudio($request);
        $d = $request->validate([
            'id_desain' => ['required', 'string', 'max:60', 'regex:/^[A-Za-z0-9_-]+$/'],
            'judul' => 'nullable|string|max:200',
            'format' => 'required|in:png,jpg',
            'halaman' => 'nullable|array|max:10',
            'halaman.*' => 'integer|min:1|max:500',
            'transparan' => 'nullable|boolean',
            'foto_siswa' => 'nullable|boolean',
            'izin_ortu' => 'nullable|boolean',
        ]);
        try {
            $berkas = $this->canva->ekspor($request->user()->id, $d['id_desain'], $d['format'], $d['halaman'] ?? [], (bool) ($d['transparan'] ?? false));
        } catch (RuntimeException $e) { return $this->gagal($e); }

        $hasil = [];
        foreach ($berkas as $i => $isi) {
            $info = @getimagesizefromstring($isi);
            $ext = ['image/png' => 'png', 'image/jpeg' => 'jpg'][$info['mime'] ?? ''] ?? null;
            if (!$ext || strlen($isi) > 15 * 1024 * 1024) throw ValidationException::withMessages(['id_desain' => 'Hasil ekspor Canva bukan gambar yang bisa dipakai (maks. 15 MB per halaman).']);
            Storage::disk('public')->put($path = 'video-aset/aset_' . Str::lower(Str::random(20)) . ".{$ext}", $isi);
            $hasil[] = VideoAset::create([
                'path' => "/storage/{$path}", 'jenis' => 'GAMBAR', 'diunggah_oleh' => $request->user()->id,
                'nama_asli' => mb_substr('Canva: ' . ($d['judul'] ?? $d['id_desain']) . (count($berkas) > 1 ? ' (hal. ' . ($d['halaman'][$i] ?? $i + 1) . ')' : ''), 0, 250),
                'foto_siswa' => $request->boolean('foto_siswa'), 'izin_ortu' => $request->boolean('izin_ortu'),
            ]);
        }
        return response()->json(['success' => true, 'message' => count($hasil) . ' halaman diimpor dari Canva.', 'data' => $hasil], 201);
    }
}

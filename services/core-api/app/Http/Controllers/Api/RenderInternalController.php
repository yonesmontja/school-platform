<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\VideoBelajar;
use App\Services\SuaraService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

/**
 * Endpoint internal untuk layanan video-render (services/video-render), hanya dengan kunci bersama RENDER_SECRET.
 * Layanan render mengambil antrean, meminta suara berbayar lewat core-api (API key tetap di sini), menulis hasil
 * ke storage/app/public/video, lalu melapor selesai atau gagal.
 */
class RenderInternalController extends Controller
{
    // Render yang macet lebih dari ini dianggap gagal dan diantrekan ulang
    private const BATAS_PROSES_MENIT = 30;

    private function cekKunci(Request $request): void
    {
        $kunci = (string) config('services.video_render.secret');
        abort_if($kunci === '' || !hash_equals($kunci, (string) $request->header('X-Render-Secret')), 403, 'Kunci render tidak valid.');
    }

    /** Ambil satu video berikutnya dari antrean (dikunci agar tidak dirender dua kali). */
    public function berikut(Request $request)
    {
        $this->cekKunci($request);
        VideoBelajar::where('render_status', 'PROSES')->where('render_mulai', '<', now()->subMinutes(self::BATAS_PROSES_MENIT))
            ->update(['render_status' => 'ANTRE', 'render_pesan' => 'Render sebelumnya terhenti; dicoba lagi.']);
        $video = DB::transaction(function () {
            $v = VideoBelajar::where('render_status', 'ANTRE')->orderBy('updated_at')->lockForUpdate()->first();
            if ($v) $v->update(['render_status' => 'PROSES', 'render_mulai' => now()]);
            return $v;
        });
        if (!$video) return response()->json(['data' => null]);
        return response()->json(['data' => $video->only(['id_video', 'judul', 'templat', 'props', 'suara'])]);
    }

    /** Suara narasi berbayar (ElevenLabs/Gemini) → WAV. */
    public function suara(Request $request, SuaraService $suara)
    {
        $this->cekKunci($request);
        $request->validate(['suara' => 'required|in:ELEVENLABS_NETRAL,ELEVENLABS_KLON,GEMINI', 'teks' => 'required|string|max:1000']);
        $wav = $suara->buat($request->suara, $request->teks);
        if ($wav === null) return response()->json(['message' => $suara->galat()], 422);
        return response($wav, 200, ['Content-Type' => 'audio/wav']);
    }

    public function selesai(Request $request, string $id)
    {
        $this->cekKunci($request);
        $data = $request->validate([
            'file_url' => ['required', 'string', 'regex:#^/storage/video/[\w.-]+\.mp4$#'],
            'poster_url' => ['nullable', 'string', 'regex:#^/storage/video/[\w.-]+\.(jpg|png)$#'],
            'durasi_detik' => 'required|integer|min:1|max:3600',
        ]);
        $video = VideoBelajar::where('render_status', 'PROSES')->findOrFail($id);
        $path = Str::after($data['file_url'], '/storage/');
        abort_unless(Storage::disk('public')->exists($path), 422, 'Berkas hasil render tidak ditemukan.');
        $lama = array_filter([$video->file_url, $video->poster_url], fn($u) => $u && $u !== $data['file_url'] && $u !== ($data['poster_url'] ?? null));
        $video->update($data + ['ukuran_kb' => (int) ceil(Storage::disk('public')->size($path) / 1024), 'render_status' => 'SELESAI', 'render_pesan' => null]);
        foreach ($lama as $u) if (Str::startsWith($u, '/storage/video/')) Storage::disk('public')->delete(Str::after($u, '/storage/'));
        return response()->json(['success' => true]);
    }

    public function gagal(Request $request, string $id)
    {
        $this->cekKunci($request);
        $request->validate(['pesan' => 'required|string|max:2000']);
        VideoBelajar::where('render_status', 'PROSES')->findOrFail($id)->update(['render_status' => 'GAGAL', 'render_pesan' => $request->pesan]);
        return response()->json(['success' => true]);
    }
}

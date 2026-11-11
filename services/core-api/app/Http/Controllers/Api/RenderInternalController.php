<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\RenderApi;
use App\Models\VideoBelajar;
use App\Services\SuaraService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
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
        $mesin = in_array($request->query('mesin'), \App\Services\NaskahVideo::MESIN, true) ? $request->query('mesin') : 'REMOTION';
        // Tanda layanan render mesin ini hidup (dipakai pengaturan Studio untuk mengaktifkan pilihan mesin)
        Cache::put("render_hidup_{$mesin}", now()->toIso8601String(), now()->addMinutes(3));
        // Job API render v1 (aplikasi luar) selalu dirender Revideo; diambil bila lebih lama menunggu dari video sekolah
        RenderApi::where('status', 'rendering')->where('mulai_render', '<', now()->subMinutes(self::BATAS_PROSES_MENIT))
            ->update(['status' => 'queued', 'pesan' => 'Render sebelumnya terhenti; dicoba lagi.']);
        if ($mesin === 'REVIDEO') {
            $tertua = VideoBelajar::where('render_status', 'ANTRE')->where('mesin', $mesin)->min('updated_at');
            $api = DB::transaction(function () use ($tertua) {
                $j = RenderApi::where('status', 'queued')->when($tertua, fn($q) => $q->where('created_at', '<=', $tertua))->orderBy('created_at')->lockForUpdate()->first();
                if ($j) $j->update(['status' => 'rendering', 'mulai_render' => now()]);
                return $j;
            });
            if ($api) {
                return response()->json(['data' => ['id_video' => $api->id, 'judul' => $api->episode ?: $api->id, 'templat' => 'Rakitan',
                    'props' => $api->props, 'suara' => $api->suara, 'mesin' => 'REVIDEO']]);
            }
        }
        $video = DB::transaction(function () use ($mesin) {
            // Layanan render mengambil antrean per mesin (?mesin=REMOTION / ?mesin=REVIDEO)
            $v = VideoBelajar::where('render_status', 'ANTRE')->where('mesin', $mesin)->orderBy('updated_at')->lockForUpdate()->first();
            if ($v) $v->update(['render_status' => 'PROSES', 'render_mulai' => now()]);
            return $v;
        });
        if (!$video) return response()->json(['data' => null]);
        return response()->json(['data' => $video->only(['id_video', 'judul', 'templat', 'props', 'suara', 'mesin'])]);
    }

    /** Suara narasi berbayar (ElevenLabs/Gemini) → WAV. */
    public function suara(Request $request, SuaraService $suara)
    {
        $this->cekKunci($request);
        $request->validate(['suara' => 'required|in:ELEVENLABS_NETRAL,ELEVENLABS_KLON,GEMINI,AZURE', 'teks' => 'required|string|max:2000',
            'voice' => ['nullable', 'string', 'max:60', 'regex:/^[a-z]{2,3}-[A-Z]{2}-[A-Za-z]+Neural$/'], 'laju' => 'nullable|numeric|min:1|max:1.25']);
        $wav = $suara->buat($request->suara, $request->teks, $request->voice, (float) ($request->laju ?: 1));
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
        $path = Str::after($data['file_url'], '/storage/');
        if (str_starts_with($id, 'rnd_')) return $this->selesaiApi($id, $data, $path);
        $video = VideoBelajar::where('render_status', 'PROSES')->findOrFail($id);
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
        if (str_starts_with($id, 'rnd_')) {
            $job = RenderApi::where('status', 'rendering')->findOrFail($id);
            $this->hapusAset($job);
            $job->update(['status' => 'failed', 'pesan' => $request->pesan, 'selesai_pada' => now()]);
            return response()->json(['success' => true]);
        }
        VideoBelajar::where('render_status', 'PROSES')->findOrFail($id)->update(['render_status' => 'GAGAL', 'render_pesan' => $request->pesan]);
        return response()->json(['success' => true]);
    }

    /** Hasil job API dipindah dari storage publik ke disk privat; diambil lewat tautan bertanda tangan. */
    private function selesaiApi(string $id, array $data, string $path)
    {
        $job = RenderApi::where('status', 'rendering')->findOrFail($id);
        $publik = Storage::disk('public');
        abort_unless($publik->exists($path), 422, 'Berkas hasil render tidak ditemukan.');
        $tujuan = "render-api/{$job->id}.mp4";
        Storage::disk('local')->put($tujuan, $publik->readStream($path));
        $publik->delete($path);
        $poster = null;
        if (!empty($data['poster_url'])) {
            $pp = Str::after($data['poster_url'], '/storage/');
            if ($publik->exists($pp)) {
                $poster = "render-api/{$job->id}.jpg";
                Storage::disk('local')->put($poster, $publik->get($pp));
                $publik->delete($pp);
            }
        }
        $this->hapusAset($job);
        $job->update(['status' => 'done', 'file_path' => $tujuan, 'poster_path' => $poster, 'durasi_detik' => $data['durasi_detik'],
            'ukuran_kb' => (int) ceil(Storage::disk('local')->size($tujuan) / 1024), 'pesan' => null, 'selesai_pada' => now()]);
        return response()->json(['success' => true]);
    }

    /** Narasi/musik unduhan hanya dibutuhkan selama render. */
    private function hapusAset(RenderApi $job): void
    {
        foreach ((array) $job->aset as $u) {
            if (is_string($u) && preg_match('#^/storage/render-api/aset/[\w.-]+$#', $u)) Storage::disk('public')->delete(Str::after($u, '/storage/'));
        }
    }
}

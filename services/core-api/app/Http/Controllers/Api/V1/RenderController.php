<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\RenderApi;
use App\Models\TempatPeta;
use App\Services\AdeganApi;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\URL;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use RuntimeException;

/**
 * API render publik v1 untuk aplikasi luar (mis. asisten AI "Muse"): kirim Scene JSON, pantau status, ambil MP4.
 * Autentikasi kunci API (middleware kunci.api). Galat selalu berbentuk {"error": {"code", "message", "details"?}}.
 */
class RenderController extends Controller
{
    private const MAKS_ANTRE_PER_KLIEN = 5;
    private const MASA_TAUTAN_HARI = 7;

    public function templates()
    {
        return response()->json(['data' => collect(AdeganApi::TEMPLAT)->map(fn($t, $id) => [
            'id' => $id, 'name' => $t['nama'], 'suggested_duration_sec' => $t['durasi_saran'],
            'formats' => array_map(fn($f) => ['width' => (int) explode('x', $f)[0], 'height' => (int) explode('x', $f)[1]], array_keys(AdeganApi::FORMAT)),
            'fps' => [30], 'scene_types' => AdeganApi::JENIS,
        ])->values()]);
    }

    /** Cari tempat terverifikasi untuk adegan peta (gerbang verifikasi). */
    public function places(Request $request)
    {
        $request->validate(['q' => 'nullable|string|max:80', 'type' => 'nullable|in:point,region']);
        $q = TempatPeta::query()->orderBy('nama')->limit(50);
        if ($request->q) {
            $kecil = '%' . mb_strtolower($request->q) . '%';
            $q->where(fn($w) => $w->whereRaw('LOWER(nama) LIKE ?', [$kecil])->orWhere('kode', 'like', $kecil)->orWhereRaw('LOWER(alias::text) LIKE ?', [$kecil]));
        }
        if ($request->type) $q->where('jenis', $request->type === 'point' ? 'titik' : 'wilayah');
        return response()->json(['data' => $q->get()->map(fn($t) => [
            'code' => $t->kode, 'name' => $t->nama, 'aliases' => $t->alias ?? [], 'type' => $t->jenis === 'titik' ? 'point' : 'region',
            'lon' => $t->lon, 'lat' => $t->lat, 'bbox' => $t->bbox, 'country' => $t->negara, 'source' => $t->sumber,
        ])]);
    }

    public function store(Request $request, AdeganApi $adegan)
    {
        $klien = $request->attributes->get('klien');
        $p = $this->valid($request);
        if (RenderApi::where('id_klien', $klien->id)->whereIn('status', ['queued', 'rendering'])->count() >= self::MAKS_ANTRE_PER_KLIEN) {
            return $this->galat(429, 'queue_full', 'Antrean render untuk kunci ini penuh (maks. ' . self::MAKS_ANTRE_PER_KLIEN . '). Tunggu render sebelumnya selesai.');
        }
        try {
            $hasil = $adegan->susun($p);
        } catch (ValidationException $e) {
            return $this->galat(422, 'validation_failed', collect($e->errors())->flatten()->first(), $e->errors());
        } catch (RuntimeException $e) {
            return $this->galat(422, 'asset_unavailable', $e->getMessage());
        }
        $job = RenderApi::create([
            'id' => 'rnd_' . Str::lower(Str::random(24)), 'id_klien' => $klien->id, 'status' => 'queued',
            'episode' => mb_substr((string) ($p['episode'] ?? ''), 0, 120) ?: null, 'templat' => $p['template'],
            'payload' => $p, 'props' => $hasil['props'], 'suara' => $hasil['suara'], 'peringatan' => $hasil['peringatan'], 'aset' => $hasil['aset'],
        ]);
        return response()->json($this->bentuk($job), 202);
    }

    public function show(Request $request, string $id)
    {
        $job = RenderApi::where('id_klien', $request->attributes->get('klien')->id)->find($id);
        if (!$job) return $this->galat(404, 'not_found', 'Job render tidak ditemukan untuk kunci ini.');
        return response()->json($this->bentuk($job));
    }

    /** Unduh MP4 / poster lewat tautan bertanda tangan (berlaku 7 hari), tanpa kunci API. */
    public function berkas(Request $request, string $id, string $jenis)
    {
        abort_unless($request->hasValidSignature(), 403, 'Tautan tidak valid atau sudah kedaluwarsa.');
        $job = RenderApi::where('status', 'done')->findOrFail($id);
        $path = $jenis === 'poster' ? $job->poster_path : $job->file_path;
        abort_unless($path && Storage::disk('local')->exists($path), 404, 'Berkas sudah tidak tersedia.');
        $nama = Str::slug($job->episode ?: $job->id) . ($jenis === 'poster' ? '.jpg' : '.mp4');
        return Storage::disk('local')->response($path, $nama, ['Content-Type' => $jenis === 'poster' ? 'image/jpeg' : 'video/mp4', 'Cache-Control' => 'private, max-age=3600']);
    }

    private function bentuk(RenderApi $job): array
    {
        $selesai = $job->status === 'done';
        $tautan = fn($jenis) => URL::temporarySignedRoute('render-api.berkas', now()->addDays(self::MASA_TAUTAN_HARI), ['id' => $job->id, 'jenis' => $jenis]);
        // Progres saat merender diperkirakan dari lama berjalan (render ±3× durasi video), tidak dilaporkan mesin
        $perkiraan = $job->payload['format']['durationSec'] ?? 50;
        $progress = match ($job->status) {
            'queued' => 0.0,
            'rendering' => round(min(0.95, ($job->mulai_render?->diffInSeconds(now()) ?? 0) / max(30, $perkiraan * 3)), 2),
            default => 1.0,
        };
        return [
            'job_id' => $job->id, 'status' => $job->status, 'progress' => $progress, 'progress_is_estimate' => $job->status === 'rendering',
            'episode' => $job->episode, 'template' => $job->templat,
            'video_url' => $selesai ? $tautan('video') : null, 'poster_url' => $selesai && $job->poster_path ? $tautan('poster') : null,
            'url_expires_at' => $selesai ? now()->addDays(self::MASA_TAUTAN_HARI)->toIso8601String() : null,
            'duration_sec' => $job->durasi_detik, 'size_kb' => $job->ukuran_kb,
            'error' => $job->status === 'failed' ? ['code' => 'render_failed', 'message' => $job->pesan] : null,
            'warnings' => $job->peringatan ?? [],
            'created_at' => $job->created_at?->toIso8601String(), 'finished_at' => $job->selesai_pada?->toIso8601String(),
        ];
    }

    private function galat(int $status, string $kode, string $pesan, ?array $rincian = null)
    {
        return response()->json(['error' => array_filter(['code' => $kode, 'message' => $pesan, 'details' => $rincian])], $status);
    }

    private function valid(Request $request): array
    {
        $v = validator($request->all(), [
            'template' => ['required', 'string', 'in:' . implode(',', array_keys(AdeganApi::TEMPLAT))],
            'episode' => 'nullable|string|max:120',
            'language' => 'nullable|string|max:10',
            // Nama suara Azure (id-ID-ArdiNeural) atau suara bawaan Gemini (Charon, Kore, …)
            'voice' => ['nullable', 'string', 'max:60', 'regex:/^([a-z]{2,3}-[A-Z]{2}-[A-Za-z]+Neural|[A-Z][a-z]+)$/'],
            'format' => 'required|array',
            'format.width' => 'required|integer', 'format.height' => 'required|integer',
            'format.fps' => 'nullable|integer|in:30',
            'format.durationSec' => 'required|numeric|min:5|max:180',
            'scenes' => 'required|array|min:1|max:20',
            'scenes.*.type' => ['required', 'string', 'in:' . implode(',', AdeganApi::JENIS)],
            'scenes.*.startSec' => 'required|numeric|min:0',
            'scenes.*.endSec' => 'required|numeric',
            'scenes.*.text' => 'nullable|string|max:700',
            'scenes.*.question' => 'nullable|string|max:300',
            'scenes.*.series' => 'nullable|string|max:60',
            'scenes.*.motion' => 'nullable|string|max:40',
            'scenes.*.bbox' => 'nullable|string|max:80',
            'scenes.*.places' => 'nullable|array|max:12', 'scenes.*.places.*' => 'string|max:80',
            'scenes.*.route' => 'nullable|array|max:12', 'scenes.*.route.*' => 'string|max:80',
            'scenes.*.markers' => 'nullable|array|max:12',
            'scenes.*.markers.*.place' => 'required_with:scenes.*.markers|string|max:80',
            'scenes.*.markers.*.icon' => 'nullable|string|max:20',
            'audio' => 'nullable|array',
            'audio.narration' => 'nullable|string|max:500', 'audio.music' => 'nullable|string|max:500',
            'audio.musicVolume' => 'nullable|numeric|min:0|max:1',
            'subtitles' => 'nullable|string|max:500',
            'sources' => 'nullable|array|max:10',
            'sources.*.publisher' => 'nullable|string|max:120', 'sources.*.title' => 'nullable|string|max:300', 'sources.*.url' => 'nullable|url|max:500',
        ], [], ['format.fps' => 'fps']);
        $v->after(function ($v) use ($request) {
            $f = $request->input('format', []);
            if (!isset(AdeganApi::FORMAT[($f['width'] ?? '') . 'x' . ($f['height'] ?? '')])) {
                $v->errors()->add('format', 'Ukuran video yang didukung: ' . implode(', ', array_keys(AdeganApi::FORMAT)) . '.');
            }
            $akhir = 0.0;
            foreach ((array) $request->input('scenes', []) as $i => $s) {
                if (!is_array($s) || !isset($s['startSec'], $s['endSec'])) continue;
                if ((float) $s['endSec'] <= (float) $s['startSec']) { $v->errors()->add("scenes.{$i}.endSec", 'endSec harus lebih besar dari startSec.'); continue; }
                if (abs((float) $s['startSec'] - $akhir) > 0.05) $v->errors()->add("scenes.{$i}.startSec", "Adegan " . ($i + 1) . " harus mulai tepat saat adegan sebelumnya selesai ({$akhir} detik).");
                $akhir = (float) $s['endSec'];
                if ((float) $s['endSec'] - (float) $s['startSec'] > 40) $v->errors()->add("scenes.{$i}.endSec", 'Satu adegan maksimal 40 detik.');
                $perluTeks = ['hook' => 'text', 'fact' => 'text', 'twist' => 'text', 'closing' => 'question'][$s['type'] ?? ''] ?? null;
                if ($perluTeks && trim((string) ($s[$perluTeks] ?? ($perluTeks === 'question' ? ($s['text'] ?? '') : ''))) === '') $v->errors()->add("scenes.{$i}.{$perluTeks}", "Adegan {$s['type']} butuh isian {$perluTeks}.");
                if (($s['type'] ?? '') === 'map' && empty($s['bbox']) && empty($s['places']) && empty($s['markers'])) $v->errors()->add("scenes.{$i}", 'Adegan map butuh bbox, places, atau markers.');
            }
            if ($akhir > 0 && abs($akhir - (float) $request->input('format.durationSec', 0)) > 0.05) {
                $v->errors()->add('format.durationSec', "Adegan terakhir selesai di {$akhir} detik, tidak sama dengan durationSec.");
            }
        });
        if ($v->fails()) {
            throw new \Illuminate\Http\Exceptions\HttpResponseException($this->galat(422, 'validation_failed', $v->errors()->first(), $v->errors()->toArray()));
        }
        return $request->all();
    }
}

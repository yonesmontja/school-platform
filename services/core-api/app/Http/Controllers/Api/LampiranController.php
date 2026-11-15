<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\TransLampiran;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

/**
 * Unggahan foto/video untuk editor catatan. Tipe ditentukan dari isi berkas (bukan nama/ekstensi kiriman).
 * Foto sudah diperkecil di browser (maks. ±1600 px); video maks. 45 MB (batas unggah PHP 50 MB).
 */
class LampiranController extends Controller
{
    public const ENTITAS = ['pembinaan', 'jurnal'];
    private const MIME = [
        'image/jpeg' => ['FOTO', 'jpg'], 'image/png' => ['FOTO', 'png'], 'image/webp' => ['FOTO', 'webp'], 'image/gif' => ['FOTO', 'gif'],
        'video/mp4' => ['VIDEO', 'mp4'], 'video/webm' => ['VIDEO', 'webm'], 'video/quicktime' => ['VIDEO', 'mov'], 'video/3gpp' => ['VIDEO', '3gp'],
    ];
    private const MAKS = ['FOTO' => 10 * 1024 * 1024, 'VIDEO' => 45 * 1024 * 1024];

    public function store(Request $request)
    {
        $request->validate([
            'berkas' => 'required|file|max:' . (45 * 1024),
            'entitas' => ['required', Rule::in(self::ENTITAS)],
        ], ['berkas.max' => 'Ukuran berkas maksimal 45 MB.', 'berkas.uploaded' => 'Berkas gagal diunggah (maksimal 45 MB).']);

        $berkas = $request->file('berkas');
        $mime = (new \finfo(FILEINFO_MIME_TYPE))->file($berkas->getRealPath());
        abort_unless(isset(self::MIME[$mime]), 422, 'Hanya foto (JPG/PNG/WEBP/GIF) atau video (MP4/WEBM/MOV/3GP) yang dapat disisipkan.');
        [$jenis, $ext] = self::MIME[$mime];
        abort_if($berkas->getSize() > self::MAKS[$jenis], 422, $jenis === 'FOTO' ? 'Ukuran foto maksimal 10 MB.' : 'Ukuran video maksimal 45 MB.');

        $path = 'lampiran/' . now()->format('Y/m') . '/' . Str::random(24) . '.' . $ext;
        Storage::disk('public')->put($path, file_get_contents($berkas->getRealPath()));

        $l = TransLampiran::create([
            'id_lampiran' => 'LMP-' . Str::uuid(), 'entitas' => $request->entitas, 'jenis' => $jenis, 'path' => $path,
            'nama_asli' => mb_substr((string) $berkas->getClientOriginalName(), 0, 200), 'mime' => $mime, 'ukuran' => $berkas->getSize(),
            'dibuat_oleh' => $request->user()->id,
        ]);
        return response()->json(['success' => true, 'data' => ['id_lampiran' => $l->id_lampiran, 'url' => $l->url, 'jenis' => $jenis, 'nama' => $l->nama_asli]], 201);
    }

    /** Tautkan lampiran yang dirujuk HTML catatan ke objeknya (dipanggil saat catatan disimpan). */
    public static function tautkan(string $entitas, string $id, ?string $html): void
    {
        $paths = \App\Support\HtmlAman::mediaDirujuk($html);
        if ($paths) TransLampiran::where('entitas', $entitas)->whereIn('path', $paths)->whereNull('id_entitas')->update(['id_entitas' => $id]);
    }
}

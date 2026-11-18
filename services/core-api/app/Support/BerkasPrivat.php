<?php

namespace App\Support;

use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpFoundation\Response;

/**
 * Simpan & sajikan berkas di disk privat 'local' (surat masuk, arsip, …). Jenis berkas diperiksa dari isinya,
 * bukan dari nama berkas; unduhan hanya lewat rute yang memeriksa hak akses.
 */
class BerkasPrivat
{
    public const DOKUMEN = [
        'application/pdf' => 'pdf', 'image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document' => 'docx',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' => 'xlsx',
        'application/msword' => 'doc', 'application/vnd.ms-excel' => 'xls',
    ];

    public const MAKS_KB = 10240;

    /** @return array{path: string, nama: string, mime: string, ukuran: int} */
    public static function simpan(UploadedFile $file, string $folder, string $kolom = 'berkas'): array
    {
        $mime = (new \finfo(FILEINFO_MIME_TYPE))->file($file->getRealPath());
        // Berkas Office modern terbaca sebagai zip oleh finfo: percayai ekstensinya hanya untuk docx/xlsx
        if ($mime === 'application/zip' && in_array(strtolower($file->getClientOriginalExtension()), ['docx', 'xlsx'], true)) {
            $mime = array_search(strtolower($file->getClientOriginalExtension()), self::DOKUMEN, true);
        }
        if (!isset(self::DOKUMEN[$mime])) {
            throw ValidationException::withMessages([$kolom => 'Jenis berkas tidak didukung. Gunakan PDF, foto (JPG/PNG/WEBP), Word, atau Excel.']);
        }
        $path = trim($folder, '/') . '/' . Str::random(24) . '.' . self::DOKUMEN[$mime];
        Storage::disk('local')->put($path, file_get_contents($file->getRealPath()));
        return ['path' => $path, 'nama' => mb_substr((string) $file->getClientOriginalName(), 0, 200), 'mime' => $mime, 'ukuran' => (int) $file->getSize()];
    }

    public static function hapus(?string $path): void
    {
        if ($path) Storage::disk('local')->delete($path);
    }

    public static function respons(?string $path, ?string $nama, ?string $mime): Response
    {
        abort_unless($path && Storage::disk('local')->exists($path), 404, 'Berkas tidak ditemukan di server.');
        return Storage::disk('local')->response($path, $nama ?: basename($path), ['Content-Type' => $mime ?: 'application/octet-stream', 'Cache-Control' => 'private, no-store']);
    }
}

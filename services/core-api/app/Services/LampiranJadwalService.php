<?php

namespace App\Services;

use App\Models\TransJadwal;
use App\Models\TransRencanaRemedial;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

/**
 * Berkas lampiran sesi Jadwal dan bukti tindak lanjut remedial. Keduanya memakai folder yang sama
 * (storage/jadwal) dan satu berkas bisa dirujuk keduanya, jadi berkas baru dihapus setelah tidak
 * dirujuk sesi maupun rencana mana pun.
 */
class LampiranJadwalService
{
    private const MIME = [
        'application/pdf' => 'pdf',
        'image/jpeg' => 'jpg',
        'image/png' => 'png',
        'image/webp' => 'webp',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document' => 'docx',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation' => 'pptx',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' => 'xlsx',
        'application/msword' => 'doc',
        'application/vnd.ms-powerpoint' => 'ppt',
        'application/zip' => 'zip',
    ];
    private const MAX_BYTES = 10 * 1024 * 1024;

    /** Aturan validasi kolom lampiran pada request. */
    public const RULES = [
        'lampiran_base64' => 'nullable|string',
        'lampiran_nama' => 'nullable|string|max:255',
        'lampiran_url' => 'nullable|url|max:500',
    ];

    /**
     * Lampiran berupa file unggahan (base64) atau tautan eksternal (mis. Google Drive).
     * @return array [url, nama]
     */
    public static function dariRequest(Request $request): array
    {
        if ($request->filled('lampiran_base64')) {
            $decoded = base64_decode(preg_replace('/^data:[^;]*;base64,/', '', $request->lampiran_base64), true);
            if ($decoded === false || $decoded === '') throw ValidationException::withMessages(['lampiran_base64' => 'Lampiran tidak valid.']);
            if (strlen($decoded) > self::MAX_BYTES) throw ValidationException::withMessages(['lampiran_base64' => 'Ukuran lampiran maksimal 10MB.']);

            $mime = (new \finfo(FILEINFO_MIME_TYPE))->buffer($decoded);
            if (!isset(self::MIME[$mime])) {
                throw ValidationException::withMessages(['lampiran_base64' => 'Format lampiran tidak didukung (PDF, gambar, Word, PowerPoint, Excel, ZIP).']);
            }
            $file = 'jadwal_' . Str::random(16) . '.' . self::MIME[$mime];
            Storage::disk('public')->put('jadwal/' . $file, $decoded);
            $nama = Str::limit(basename((string) $request->lampiran_nama) ?: $file, 250, '');
            return ['/storage/jadwal/' . $file, $nama];
        }
        if ($request->filled('lampiran_url')) {
            return [$request->lampiran_url, Str::limit($request->lampiran_nama ?: 'Tautan lampiran', 250, '')];
        }
        return [null, null];
    }

    /**
     * Sebelum sesi remedial dihapus atau dilepas: lampirannya (bukti) disalin ke rencana yang memakai
     * sesi itu dan belum punya bukti sendiri. Yang disalin hanya rujukannya, berkasnya tetap satu.
     */
    public static function pindahkanKeRencana(iterable $jadwal): void
    {
        foreach (collect($jadwal)->filter(fn($j) => $j->lampiran_url) as $j) {
            TransRencanaRemedial::where('id_jadwal', $j->id_jadwal)->whereNull('bukti_url')
                ->update(['bukti_url' => $j->lampiran_url, 'bukti_nama' => $j->lampiran_nama]);
        }
    }

    /** Hapus file unggahan yang sudah tidak dirujuk sesi Jadwal maupun rencana remedial mana pun. */
    public static function bersihkan(iterable $urls): void
    {
        foreach (collect($urls)->filter()->unique() as $url) {
            if (!Str::startsWith($url, '/storage/jadwal/')) continue;
            if (TransJadwal::where('lampiran_url', $url)->exists()) continue;
            if (TransRencanaRemedial::where('bukti_url', $url)->exists()) continue;
            Storage::disk('public')->delete(Str::after($url, '/storage/'));
        }
    }
}

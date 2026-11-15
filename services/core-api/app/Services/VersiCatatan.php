<?php

namespace App\Services;

use App\Models\TransVersi;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * Riwayat versi umum (model "git" sederhana) untuk catatan apa pun: tiap simpan menghasilkan versi baru berisi isi lengkap,
 * keterangan perubahan (seperti pesan commit), penulis, dan waktu. Simpan tanpa perubahan isi tidak membuat versi.
 * Entitas yang dipakai sekarang: 'pembinaan' (rencana pembinaan kehadiran) dan 'jurnal' (catatan progres pembinaan).
 */
class VersiCatatan
{
    /** @return TransVersi|null versi baru, atau null bila isinya sama dengan versi terakhir */
    public static function simpan(string $entitas, string $id, array $isi, ?string $keterangan, ?int $olehUser): ?TransVersi
    {
        return DB::transaction(function () use ($entitas, $id, $isi, $keterangan, $olehUser) {
            $akhir = TransVersi::where(['entitas' => $entitas, 'id_entitas' => $id])->orderByDesc('versi')->lockForUpdate()->first();
            if ($akhir && self::sama($akhir->isi, $isi)) return null;
            return TransVersi::create([
                'entitas' => $entitas, 'id_entitas' => $id, 'versi' => ($akhir->versi ?? 0) + 1, 'isi' => $isi,
                'keterangan' => ($k = trim((string) $keterangan)) !== '' ? mb_substr($k, 0, 300) : null,
                'dibuat_oleh' => $olehUser,
            ]);
        });
    }

    /** Riwayat beberapa objek sekaligus: [id_entitas => [versi terbaru dulu]] */
    public static function riwayat(string $entitas, array $ids): Collection
    {
        if (!$ids) return collect();
        return TransVersi::with('penulis:id,name')->where('entitas', $entitas)->whereIn('id_entitas', $ids)
            ->orderByDesc('versi')->get()
            ->map(fn($v) => ['versi' => $v->versi, 'isi' => $v->isi, 'keterangan' => $v->keterangan, 'oleh' => $v->penulis?->name, 'oleh_id' => $v->dibuat_oleh, 'waktu' => $v->created_at?->toIso8601String(), 'id_entitas' => $v->id_entitas])
            ->groupBy('id_entitas');
    }

    public static function terakhir(string $entitas, string $id): ?TransVersi
    {
        return TransVersi::where(['entitas' => $entitas, 'id_entitas' => $id])->orderByDesc('versi')->first();
    }

    private static function sama($a, $b): bool
    {
        $urut = function ($x) use (&$urut) {
            if (!is_array($x)) return $x;
            if (!array_is_list($x)) ksort($x);
            return array_map($urut, $x);
        };
        return json_encode($urut($a)) === json_encode($urut($b));
    }
}

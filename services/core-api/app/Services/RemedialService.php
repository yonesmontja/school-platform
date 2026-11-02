<?php

namespace App\Services;

use App\Models\TransJadwal;
use App\Models\TransRencanaRemedial;

/**
 * Siklus status rencana remedial dan sesi jadwal yang menyertainya.
 */
class RemedialService
{
    public static function tandaiSelesai(TransRencanaRemedial $rencana, string $tanggal): void
    {
        $rencana->update(['status' => 'SELESAI', 'tanggal_selesai' => $tanggal]);
        self::sinkronJadwal($rencana->id_jadwal);
    }

    // Nilai remedialnya dihapus: rencana kembali menunggu pelaksanaan
    public static function bukaKembali(TransRencanaRemedial $rencana): void
    {
        $rencana->update(['status' => 'DIRENCANAKAN', 'tanggal_selesai' => null]);
        self::sinkronJadwal($rencana->id_jadwal);
    }

    // Sesi remedial dianggap selesai bila seluruh siswa di dalamnya sudah punya nilai remedial
    public static function sinkronJadwal(?string $idJadwal): void
    {
        $jadwal = $idJadwal ? TransJadwal::find($idJadwal) : null;
        if (!$jadwal || $jadwal->status_sesi === 'Batal') return;

        $terbuka = TransRencanaRemedial::where('id_jadwal', $idJadwal)->where('status', 'DIRENCANAKAN')->exists();
        if (!$terbuka && $jadwal->status_sesi !== 'Selesai') $jadwal->update(['status_sesi' => 'Selesai']);
        if ($terbuka && $jadwal->status_sesi === 'Selesai') $jadwal->update(['status_sesi' => 'Menunggu']);
    }

    // Hapus sesi yang tidak lagi dipakai rencana mana pun (yang sudah berjalan tetap disimpan sebagai riwayat)
    public static function bersihkanJadwal(iterable $idJadwal): void
    {
        foreach (collect($idJadwal)->filter()->unique() as $id) {
            if (TransRencanaRemedial::where('id_jadwal', $id)->exists()) continue;
            TransJadwal::where('id_jadwal', $id)->where('status_sesi', 'Menunggu')->delete();
        }
    }
}

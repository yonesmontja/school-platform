<?php

namespace App\Services;

use App\Models\SchoolSetting;
use App\Models\Subject;
use App\Models\TransJadwal;
use App\Models\TransRencanaRemedial;
use Illuminate\Support\Collection;

/**
 * Siklus status rencana remedial dan sesi jadwal yang menyertainya.
 */
class RemedialService
{
    /**
     * Terapkan kebijakan sekolah pada nilai remedial yang direkap (rapor, laporan, dasbor):
     * bila batas_nilai_remedial = KKM, nilai remedial tidak melebihi KKM mapelnya.
     * Baris (model atau hasil query) harus memuat tipe_nilai, id_mapel, dan nilai; datanya tidak disimpan ulang.
     */
    public static function batasiNilai(Collection $baris): Collection
    {
        if ((SchoolSetting::first()?->batas_nilai_remedial ?? 'KKM') !== 'KKM') return $baris;

        $kkm = Subject::pluck('kkm', 'id_mapel');
        return $baris->each(function ($b) use ($kkm) {
            if ($b->tipe_nilai !== 'REMEDIAL') return;
            $batas = (float) ($kkm[$b->id_mapel] ?? 75);
            if ((float) $b->nilai > $batas) $b->nilai = $batas;
        });
    }

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

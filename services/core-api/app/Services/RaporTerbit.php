<?php

namespace App\Services;

use App\Models\MasterPeriode;
use App\Models\TransCatatanWali;
use App\Models\TransJurnal;
use App\Models\TransKenaikan;
use App\Models\TransNilai;
use App\Models\TransPresensi;
use Illuminate\Support\Facades\DB;

/**
 * Bantuan rapor terbit: sidik data sumber rapor (untuk mendeteksi nilai/kehadiran/catatan yang berubah setelah rapor
 * diterbitkan) dan bagian ringkasan yang diambil dari server (kehadiran, keputusan kenaikan).
 */
class RaporTerbit
{
    /**
     * Sidik SHA-256 per siswa dari semua data yang membentuk isi rapor: nilai efektif (beserta nilai indikator),
     * jurnal semester itu, kehadiran, catatan wali, nilai P5, dan keputusan kenaikan yang disahkan.
     * @return array<string, string> id_siswa => sidik
     */
    public static function sidikKelas(?string $idKelas, string $idPeriode, array $idSiswa): array
    {
        if (!$idSiswa) return [];
        $nilai = RemedialService::batasiNilai(TransNilai::efektif()->where('id_periode', $idPeriode)->whereIn('id_siswa', $idSiswa)
            ->when($idKelas, fn($q) => $q->where('id_kelas', $idKelas))
            ->toBase()->orderBy('id_nilai')->get(['id_nilai', 'id_siswa', 'id_mapel', 'tipe_nilai', 'nilai', 'poin_S', 'poin_T', 'poin_N', 'poin_K', 'poin_M']))
            ->groupBy('id_siswa');
        $indikator = DB::table('trans_nilai_indikator as ni')->join('trans_nilai as n', 'n.id_nilai', '=', 'ni.id_nilai')
            ->where('n.id_periode', $idPeriode)->whereIn('n.id_siswa', $idSiswa)->orderBy('ni.id')
            ->get(['n.id_siswa', 'ni.id_nilai', 'ni.id_indikator', 'ni.nilai'])->groupBy('id_siswa');
        $presensi = TransPresensi::where('id_periode', $idPeriode)->whereIn('id_siswa', $idSiswa)->when($idKelas, fn($q) => $q->where('id_kelas', $idKelas))
            ->selectRaw('id_siswa, status_kehadiran, count(*) as n')->groupBy('id_siswa', 'status_kehadiran')->orderBy('status_kehadiran')->toBase()->get()->groupBy('id_siswa');
        $catatan = TransCatatanWali::where('id_periode', $idPeriode)->whereIn('id_siswa', $idSiswa)->pluck('catatan_final', 'id_siswa');
        $kenaikan = TransKenaikan::where('id_periode', $idPeriode)->whereIn('id_siswa', $idSiswa)->where('disahkan', true)->get(['id_siswa', 'keputusan', 'ke_tingkat'])->keyBy('id_siswa');
        $p5 = DB::table('trans_nilai_p5')->where('id_periode', $idPeriode)->whereIn('id_siswa', $idSiswa)->orderBy('id_proyek')->orderBy('id_target')
            ->get(['id_siswa', 'id_proyek', 'id_target', 'predikat'])->groupBy('id_siswa');
        $jurnal = collect();
        if ($p = MasterPeriode::find($idPeriode)) {
            [$mulai, $selesai] = $p->rentang();
            $jurnal = TransJurnal::whereIn('id_siswa', $idSiswa)->whereBetween('tanggal', [$mulai->toDateString(), $selesai->toDateString()])
                ->orderBy('id_jurnal')->toBase()->get(['id_siswa', 'id_jurnal', 'mode_dampak', 'sensitif', 'narasi_kejadian', 'val_S', 'val_T', 'val_N', 'val_K', 'val_M'])->groupBy('id_siswa');
        }

        $hasil = [];
        foreach ($idSiswa as $id) {
            $efektif = collect($nilai->get($id, []))->pluck('id_nilai')->flip();
            $hasil[$id] = hash('sha256', json_encode([
                'i' => collect($indikator->get($id, []))->filter(fn($r) => $efektif->has($r->id_nilai))->map(fn($r) => [$r->id_nilai, $r->id_indikator, (float) $r->nilai])->values(),
                'n' => collect($nilai->get($id, []))->map(fn($r) => [$r->id_nilai, $r->id_mapel, $r->tipe_nilai, (float) $r->nilai, (float) $r->poin_S, (float) $r->poin_T, (float) $r->poin_N, (float) $r->poin_K, (float) $r->poin_M])->values(),
                'p' => collect($presensi->get($id, []))->map(fn($r) => [$r->status_kehadiran, (int) $r->n])->values(),
                'c' => $catatan[$id] ?? null,
                'k' => ($k = $kenaikan->get($id)) ? [$k->keputusan, $k->ke_tingkat] : null,
                'p5' => collect($p5->get($id, []))->map(fn($r) => [$r->id_proyek, $r->id_target, $r->predikat])->values(),
                'j' => collect($jurnal->get($id, []))->map(fn($r) => [$r->id_jurnal, $r->mode_dampak, (bool) $r->sensitif, $r->sensitif ? null : $r->narasi_kejadian,
                    (float) $r->val_S, (float) $r->val_T, (float) $r->val_N, (float) $r->val_K, (float) $r->val_M])->values(),
            ]));
        }
        return $hasil;
    }

    /** Bagian ringkasan rapor dari server: kehadiran dan keputusan kenaikan yang disahkan. */
    public static function ringkasanServer(string $idKelas, string $idPeriode, array $idSiswa): array
    {
        $presensi = TransPresensi::where('id_periode', $idPeriode)->where('id_kelas', $idKelas)->whereIn('id_siswa', $idSiswa)
            ->selectRaw('id_siswa, status_kehadiran, count(*) as n')->groupBy('id_siswa', 'status_kehadiran')->toBase()->get()->groupBy('id_siswa');
        $kenaikan = TransKenaikan::where('id_periode', $idPeriode)->whereIn('id_siswa', $idSiswa)->where('disahkan', true)->get(['id_siswa', 'keputusan', 'ke_tingkat'])->keyBy('id_siswa');
        $hasil = [];
        foreach ($idSiswa as $id) {
            $p = collect($presensi->get($id, []))->pluck('n', 'status_kehadiran');
            $k = $kenaikan->get($id);
            $hasil[$id] = [
                'presensi' => ['sakit' => (int) ($p['SAKIT'] ?? 0), 'izin' => (int) ($p['IZIN'] ?? 0), 'alpa' => (int) ($p['ALPA'] ?? 0)],
                'kenaikan' => $k ? ['keputusan' => $k->keputusan, 'ke_tingkat' => $k->ke_tingkat] : null,
            ];
        }
        return $hasil;
    }
}

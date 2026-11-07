<?php

namespace App\Services;

use App\Models\BankSoal;
use App\Models\PaketSoal;
use Illuminate\Support\Facades\DB;

/**
 * Lingkar belajar bank soal (Fase 16 Tahap D): hasil analisis butir tiap paket disimpan per butir, lalu
 * digabung per soal bank (rata-rata tertimbang jumlah siswa). Bank soal menampilkan soal yang teruji, dan
 * draf AI memakai contoh yang teruji baik, catatan soal bermasalah, serta capaian siswa pada TP itu.
 */
class StatistikSoalService
{
    // Analisis butir baru bermakna bila kelompok atas & bawah terbentuk
    public const MIN_SISWA = 4;

    /** Simpan p, D, dan saran tiap butir dari hasil PaketSoalService::analisis. */
    public static function simpan(PaketSoal $paket, array $analisis): void
    {
        $n = (int) $analisis['jumlah_siswa'];
        $sekarang = now();
        foreach ($analisis['butir'] as $b) {
            $cukup = $n >= self::MIN_SISWA && $b['p'] !== null && $b['d'] !== null;
            $saran = $b['saran'];
            if ($cukup && !empty($b['sebaran']['pengecoh_lemah'])) {
                $pilihan = collect($paket->butir->firstWhere('id', $b['id'])?->soal['isi']['pilihan'] ?? []);
                $lemah = collect($b['sebaran']['pengecoh_lemah'])->map(fn($i) => $pilihan[$i] ?? null)->filter()->implode('; ');
                if ($lemah) $saran .= " Pengecoh tidak dipilih: {$lemah}.";
            }
            DB::table('paket_soal_butir')->where('id', $b['id'])->update($cukup
                ? ['stat_p' => $b['p'], 'stat_d' => $b['d'], 'stat_n' => min($n, 65535), 'stat_saran' => mb_substr((string) $saran, 0, 255), 'stat_pada' => $sekarang]
                : ['stat_p' => null, 'stat_d' => null, 'stat_n' => null, 'stat_saran' => null, 'stat_pada' => null]);
        }
    }

    /**
     * Statistik gabungan per soal bank.
     * @return array id_soal => {p, d, n, paket, kesukaran, daya_beda, teruji_baik, saran}
     */
    public static function untukSoal(array $idSoal): array
    {
        $idSoal = array_values(array_filter(array_unique($idSoal)));
        if (!$idSoal) return [];
        $baris = DB::table('paket_soal_butir')->whereIn('id_soal', $idSoal)->whereNotNull('stat_n')
            ->orderByDesc('stat_pada')->get(['id_soal', 'stat_p', 'stat_d', 'stat_n', 'stat_saran']);

        return $baris->groupBy('id_soal')->map(function ($rs) {
            $n = $rs->sum('stat_n');
            $p = round($rs->sum(fn($r) => $r->stat_p * $r->stat_n) / $n, 2);
            $d = round($rs->sum(fn($r) => $r->stat_d * $r->stat_n) / $n, 2);
            return [
                'p' => $p,
                'd' => $d,
                'n' => (int) $n,
                'paket' => $rs->count(),
                'kesukaran' => $p > 0.7 ? 'MUDAH' : ($p >= 0.3 ? 'SEDANG' : 'SUKAR'),
                'daya_beda' => $d >= 0.4 ? 'BAIK_SEKALI' : ($d >= 0.3 ? 'BAIK' : ($d >= 0.2 ? 'CUKUP' : 'JELEK')),
                'teruji_baik' => self::baik($p, $d),
                'saran' => $rs->first()->stat_saran,
            ];
        })->all();
    }

    /**
     * Bahan belajar AI untuk draf soal baru pada TP (atau materi) & bentuk tertentu.
     * @return array{contoh: array, hindari: array, capaian: ?array, teruji: int}
     */
    public static function bahanBelajar(?string $bentuk, ?string $idIndikator, ?string $idMateri): array
    {
        $lingkup = fn($q) => $idIndikator ? $q->where('id_indikator', $idIndikator) : $q->where('id_materi', $idMateri);
        if (!$idIndikator && !$idMateri) return ['contoh' => [], 'hindari' => [], 'capaian' => null, 'teruji' => 0];

        // Contoh gaya sekolah: soal disetujui dengan bentuk sama; yang teruji baik didahulukan, yang terbukti jelek tidak dipakai
        $calon = BankSoal::where('status', 'DISETUJUI')->where('bentuk', $bentuk)->where($lingkup)
            ->latest('disetujui_pada')->limit(15)->get(['id_soal', 'pertanyaan', 'isi', 'kunci', 'level_kognitif']);
        $stat = self::untukSoal($calon->pluck('id_soal')->all());
        $contoh = $calon->map(fn($s) => ['soal' => $s, 'stat' => $stat[$s->id_soal] ?? null])
            ->reject(fn($c) => $c['stat'] && $c['stat']['d'] < 0.2)
            ->sortBy(fn($c) => $c['stat'] ? ($c['stat']['teruji_baik'] ? 0 : 1) : 1)
            ->take(3)->values();

        // Soal bermasalah pada TP/materi ini (bentuk apa pun)
        $semua = BankSoal::where('status', 'DISETUJUI')->where($lingkup)->latest('disetujui_pada')->limit(40)->get(['id_soal', 'pertanyaan', 'bentuk']);
        $statSemua = self::untukSoal($semua->pluck('id_soal')->all());
        $hindari = $semua->filter(fn($s) => isset($statSemua[$s->id_soal]) && !$statSemua[$s->id_soal]['teruji_baik'])
            ->take(4)->map(fn($s) => [
                'pertanyaan' => mb_substr($s->pertanyaan, 0, 200),
                'bentuk' => $s->bentuk,
                'masalah' => $statSemua[$s->id_soal]['saran'],
                'proporsi_benar' => $statSemua[$s->id_soal]['p'],
            ])->values()->all();

        // Capaian siswa sekolah pada TP/materi ini dari semua butir yang teranalisis
        $agregat = DB::table('paket_soal_butir as b')->join('bank_soal as s', 's.id_soal', '=', 'b.id_soal')
            ->whereNotNull('b.stat_n')->where($idIndikator ? 's.id_indikator' : 's.id_materi', $idIndikator ?: $idMateri)
            ->selectRaw('SUM(b.stat_p * b.stat_n) / NULLIF(SUM(b.stat_n), 0) as p, SUM(b.stat_n) as n, COUNT(*) as butir')->first();
        $capaian = $agregat && $agregat->n ? ['proporsi_benar' => round((float) $agregat->p, 2), 'jawaban' => (int) $agregat->n, 'butir' => (int) $agregat->butir] : null;

        return [
            'contoh' => $contoh->map(fn($c) => array_filter([
                'pertanyaan' => $c['soal']->pertanyaan, 'isi' => $c['soal']->isi, 'kunci' => $c['soal']->kunci, 'level_kognitif' => $c['soal']->level_kognitif,
                'hasil_analisis' => $c['stat'] ? "proporsi benar {$c['stat']['p']}, daya beda {$c['stat']['d']}" . ($c['stat']['teruji_baik'] ? ' (teruji baik)' : '') : null,
            ], fn($v) => $v !== null))->all(),
            'hindari' => $hindari,
            'capaian' => $capaian,
            'teruji' => $contoh->filter(fn($c) => $c['stat'] && $c['stat']['teruji_baik'])->count(),
        ];
    }

    private static function baik(float $p, float $d): bool
    {
        return $d >= 0.3 && $p >= 0.3 && $p <= 0.9;
    }
}

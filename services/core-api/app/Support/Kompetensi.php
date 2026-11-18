<?php

namespace App\Support;

use App\Models\BankStimulus;
use Illuminate\Support\Collection;

/**
 * Laporan level kompetensi ala AKM (CBT Tahap B). ANBK resmi memakai penskalaan IRT; di sini level ditentukan dari
 * persentase capaian siswa pada butir paket (batas di LEVEL), dipecah per domain (literasi/numerasi dari jenis stimulus),
 * per kelas, per level kognitif C1–C6, dan per jenis stimulus.
 */
class Kompetensi
{
    /** Batas bawah capaian (%) tiap level, dari terendah. */
    public const LEVEL = [
        ['kode' => 'PERLU_INTERVENSI', 'label' => 'Perlu intervensi khusus', 'min' => 0],
        ['kode' => 'DASAR', 'label' => 'Dasar', 'min' => 40],
        ['kode' => 'CAKAP', 'label' => 'Cakap', 'min' => 60],
        ['kode' => 'MAHIR', 'label' => 'Mahir', 'min' => 80],
    ];
    public const DOMAIN = ['LITERASI' => 'Literasi membaca', 'NUMERASI' => 'Numerasi'];

    public static function level(?float $persen): ?string
    {
        if ($persen === null) return null;
        $kode = self::LEVEL[0]['kode'];
        foreach (self::LEVEL as $l) if ($persen >= $l['min']) $kode = $l['kode'];
        return $kode;
    }

    private static function sebaran(Collection $kode): array
    {
        return collect(self::LEVEL)->mapWithKeys(fn($l) => [$l['kode'] => $kode->filter(fn($k) => $k === $l['kode'])->count()])->all();
    }

    /**
     * @param Collection $butir PaketSoalButir
     * @param Collection $jawaban PaketSoalJawaban yang sudah lengkap (siswa dimuat dengan id_kelas & kelas)
     */
    public static function laporan(Collection $butir, Collection $jawaban): array
    {
        $skor = fn($j, $b) => (float) ($j->skor[(string) $b->id] ?? 0);
        $capaian = fn($j, Collection $bs) => ($maks = $bs->sum('skor_maks')) > 0 ? round($bs->sum(fn($b) => $skor($j, $b)) / $maks * 100, 1) : null;
        $rata = fn(Collection $bs) => $jawaban->isEmpty() || $bs->isEmpty() ? null : round($jawaban->avg(fn($j) => $capaian($j, $bs)), 1);

        $perDomain = $butir->toBase()->groupBy(fn($b) => BankStimulus::domain($b->soal['stimulus']['jenis'] ?? null) ?? 'UMUM');
        $adaDomain = $perDomain->keys()->diff(['UMUM'])->isNotEmpty();

        $siswa = $jawaban->map(function ($j) use ($butir, $perDomain, $adaDomain, $capaian) {
            $total = $capaian($j, $butir);
            $domain = $adaDomain ? $perDomain->except('UMUM')->map(function ($bs) use ($j, $capaian) {
                $p = $capaian($j, $bs);
                return ['persen' => $p, 'level' => self::level($p)];
            })->all() : [];
            return [
                'id_siswa' => $j->id_siswa, 'nama_siswa' => $j->siswa?->nama_siswa,
                'id_kelas' => $j->siswa?->id_kelas, 'kelas' => $j->siswa?->kelas?->nama_kelas,
                'persen' => $total, 'level' => self::level($total), 'domain' => $domain,
            ];
        })->sortByDesc('persen')->values();

        return [
            'batas' => self::LEVEL,
            'sebaran' => self::sebaran($siswa->pluck('level')),
            'domain' => $adaDomain ? $perDomain->except('UMUM')->map(fn($bs, $d) => [
                'domain' => $d, 'label' => self::DOMAIN[$d], 'jumlah_butir' => $bs->count(), 'rata' => $rata($bs),
                'sebaran' => self::sebaran($siswa->pluck("domain.{$d}.level")),
            ])->values()->all() : [],
            'per_kelas' => $siswa->groupBy(fn($s) => $s['id_kelas'] ?? '')->map(fn($g) => [
                'id_kelas' => $g->first()['id_kelas'], 'kelas' => $g->first()['kelas'] ?? 'Tanpa kelas', 'jumlah_siswa' => $g->count(),
                'rata' => round($g->avg('persen'), 1), 'sebaran' => self::sebaran($g->pluck('level')),
            ])->sortBy('kelas')->values()->all(),
            'level_kognitif' => $butir->groupBy(fn($b) => $b->soal['level_kognitif'] ?? '–')->map(fn($bs, $lv) => [
                'level' => $lv, 'jumlah_butir' => $bs->count(), 'rata' => $rata($bs),
            ])->sortKeys()->values()->all(),
            'stimulus' => $butir->filter(fn($b) => isset($b->soal['stimulus']['id_stimulus']))
                ->groupBy(fn($b) => $b->soal['stimulus']['id_stimulus'])->map(fn($bs) => [
                    'id_stimulus' => $bs->first()->soal['stimulus']['id_stimulus'], 'judul' => $bs->first()->soal['stimulus']['judul'] ?? '',
                    'jenis' => $bs->first()->soal['stimulus']['jenis'] ?? null, 'jumlah_butir' => $bs->count(), 'rata' => $rata($bs),
                ])->values()->all(),
            'siswa' => $siswa->all(),
        ];
    }
}

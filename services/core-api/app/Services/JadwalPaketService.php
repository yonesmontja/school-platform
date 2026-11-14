<?php

namespace App\Services;

use App\Models\Atp;
use App\Models\HariLibur;
use App\Models\MasterPeriode;
use App\Models\TransJadwal;
use Carbon\Carbon;

/**
 * Paket jadwal dari Promes: Prota/Promes (ATP + kalender minggu efektif) sudah menentukan TP mana diajarkan di minggu
 * efektif ke berapa. Dengan pola jam mingguan (mis. Senin 07:30–09:00, Kamis 10:00–11:10) paket ini menyusun seluruh
 * sesi semester, masing-masing sudah tertaut ke TP/materinya. Hari libur & minggu tidak efektif dilewati; sesi yang
 * sudah ada atau bentrok ditandai. Guru/admin tinggal meninjau lalu mengaktifkan.
 */
class JadwalPaketService
{
    public const MAKS_SESI = 300;
    public const MAKS_SLOT = 10;

    public function __construct(private ProgramAjarService $program) {}

    /**
     * @param array $slot [['hari' => 1..6, 'mulai' => 'H:i', 'selesai' => 'H:i'], ...]
     * @param array $info ['id_guru', 'id_ruangan', 'mulai_dari' => 'Y-m-d']
     */
    public function susun(MasterPeriode $periode, string $idMapel, ?string $idKelas, array $slot, array $info): array
    {
        $atp = $this->program->pilihAtp($idMapel, $idKelas, $periode->id_periode);
        $minggu = $this->program->kalender($periode);
        [$awal, $akhir] = $periode->rentang();
        $zona = config('app.zona_sekolah');
        $dari = Carbon::parse($info['mulai_dari'] ?? now($zona)->format('Y-m-d'))->startOfDay();
        if ($dari->lt($awal)) $dari = $awal->copy()->startOfDay();

        // Sisa JP tiap TP = alokasi dikurangi yang sudah terlaksana/terjadwal (perhitungan Promes), agar tidak dobel
        $baris = $atp ? $this->program->promes($periode, $idMapel, $idKelas)['baris'] : [];
        $sisa = array_map(fn($b) => max(0, max(1, (int) $b['alokasi_jp']) - $b['jp_selesai'] - $b['jp_terjadwal']), $baris);
        $mingguTerakhir = $baris ? max(array_map(fn($b) => $b['rencana']['ke_akhir'], $baris)) : 0;
        usort($slot, fn($a, $b) => [$a['hari'], $a['mulai']] <=> [$b['hari'], $b['mulai']]);

        // 1) Semua slot pada minggu efektif, mulai tanggal paket; hari libur dilewati
        $sesi = [];
        $libur = [];
        foreach ($minggu as $m) {
            if (!$m['efektif']) continue;
            $senin = Carbon::parse($m['mulai']);
            foreach ($slot as $s) {
                $tgl = $senin->copy()->addDays($s['hari'] - 1);
                if ($tgl->lt($dari) || $tgl->gt($akhir)) continue;
                if ($nama = HariLibur::namaPada($tgl)) { $libur[] = $tgl->format('Y-m-d') . " ({$nama})"; continue; }
                $mulai = Carbon::parse($tgl->format('Y-m-d') . ' ' . $s['mulai']);
                $selesai = Carbon::parse($tgl->format('Y-m-d') . ' ' . $s['selesai']);
                $sesi[] = [
                    'kunci' => $mulai->format('Y-m-d\TH:i'), 'mulai' => $mulai, 'selesai' => $selesai,
                    'jp' => max(1, (int) round($mulai->diffInMinutes($selesai) / 35)), 'minggu_ke' => $m['ke_efektif'], 'baris' => null,
                ];
            }
        }
        $this->tandai($sesi, $idMapel, $idKelas, $info['id_guru'] ?? null, $info['id_ruangan'] ?? null);

        // 2) TP tiap sesi baru: yang direncanakan di minggu itu, lalu yang tertinggal; urut sesuai ATP.
        //    Paket berhenti setelah minggu terakhir rencana ATP bila semua TP sudah tertutup.
        $hasil = [];
        foreach ($sesi as $s) {
            $ke = $s['minggu_ke'];
            if ($s['status'] !== 'SUDAH_ADA') {
                $k = $this->pilihBaris($baris, $sisa, fn($b) => $b['rencana']['ke_awal'] <= $ke && $ke <= $b['rencana']['ke_akhir'])
                    ?? $this->pilihBaris($baris, $sisa, fn($b) => $b['rencana']['ke_akhir'] < $ke);
                if ($k === null && $ke > $mingguTerakhir) break;
                if ($k !== null) { $sisa[$k] -= $s['jp']; $s['baris'] = $baris[$k]; }
            }
            $hasil[] = $s;
            if (count($hasil) >= self::MAKS_SESI) break;
        }
        $sesi = $hasil;

        $kurang = [];
        foreach ($baris as $k => $b) {
            if ($sisa[$k] > 0) $kurang[] = ['no' => $b['no'], 'tp' => $b['tp'], 'alokasi_jp' => $b['alokasi_jp'], 'kurang_jp' => round($sisa[$k], 1)];
        }

        return [
            'atp' => $atp ? $atp->only(['id_atp', 'judul', 'status', 'jp_per_minggu']) : null,
            'periode' => ['id_periode' => $periode->id_periode, 'mulai' => $awal->format('Y-m-d'), 'selesai' => $akhir->format('Y-m-d'), 'mulai_dari' => $dari->format('Y-m-d')],
            'sesi' => array_map(fn($s) => [
                'kunci' => $s['kunci'],
                'tanggal' => $s['mulai']->format('Y-m-d'),
                'mulai' => $s['mulai']->format('H:i'), 'selesai' => $s['selesai']->format('H:i'),
                'jp' => $s['jp'], 'minggu_ke' => $s['minggu_ke'],
                'tp' => $s['baris'] ? ['id' => $s['baris']['id'], 'no' => $s['baris']['no'], 'tp' => $s['baris']['tp'], 'materi' => $s['baris']['materi'], 'id_materi' => $s['baris']['id_materi'], 'id_indikator' => $s['baris']['id_indikator']] : null,
                'status' => $s['status'], 'keterangan' => $s['keterangan'],
            ], $sesi),
            'libur' => array_values(array_unique($libur)),
            'tp_kurang' => $kurang,
            'ringkasan' => [
                'sesi' => count($sesi),
                'baru' => count(array_filter($sesi, fn($s) => $s['status'] === 'BARU')),
                'bentrok' => count(array_filter($sesi, fn($s) => $s['status'] === 'BENTROK')),
                'sudah_ada' => count(array_filter($sesi, fn($s) => $s['status'] === 'SUDAH_ADA')),
                'jp_paket' => array_sum(array_map(fn($s) => $s['status'] !== 'SUDAH_ADA' ? $s['jp'] : 0, $sesi)),
                'jp_rencana' => array_sum(array_column($baris, 'alokasi_jp')),
                'jp_per_minggu_pola' => array_sum(array_map(fn($s) => max(1, (int) round(Carbon::parse($s['mulai'])->diffInMinutes(Carbon::parse($s['selesai'])) / 35)), $slot)),
            ],
        ];
    }

    /** Pola jam mingguan yang sudah dipakai sesi mapel–kelas ini (untuk mengisi awal formulir paket). */
    public function saranSlot(string $idMapel, ?string $idKelas): array
    {
        $sesi = TransJadwal::where('id_mapel', $idMapel)->when($idKelas, fn($q) => $q->where('id_kelas', $idKelas))
            ->where('status_sesi', '!=', 'Batal')->where('mulai', '>=', now()->subWeeks(8))
            ->orderByDesc('mulai')->limit(60)->get(['mulai', 'selesai', 'id_ruangan', 'id_guru']);
        $slot = $sesi->groupBy(fn($s) => $s->mulai->dayOfWeek . '|' . $s->mulai->format('H:i') . '|' . $s->selesai->format('H:i'))
            ->sortByDesc(fn($g) => $g->count())->take(self::MAKS_SLOT)
            ->map(fn($g) => ['hari' => $g->first()->mulai->dayOfWeek, 'mulai' => $g->first()->mulai->format('H:i'), 'selesai' => $g->first()->selesai->format('H:i'), 'jumlah' => $g->count()])
            ->filter(fn($s) => $s['hari'] >= 1 && $s['hari'] <= 6)
            ->sortBy(fn($s) => [$s['hari'], $s['mulai']])->values()->all();
        return [
            'slot' => $slot,
            'id_ruangan' => $sesi->pluck('id_ruangan')->filter()->countBy()->sortDesc()->keys()->first(),
            'id_guru' => $sesi->pluck('id_guru')->filter()->countBy()->sortDesc()->keys()->first(),
        ];
    }

    private function pilihBaris(array $baris, array $sisa, callable $syarat): ?int
    {
        foreach ($baris as $k => $b) if ($sisa[$k] > 0 && $syarat($b)) return $k;
        return null;
    }

    /** SUDAH_ADA: mapel–kelas ini sudah punya sesi di jam itu. BENTROK: guru/ruangan/kelas dipakai sesi lain. */
    private function tandai(array &$sesi, string $idMapel, ?string $idKelas, ?string $idGuru, ?string $idRuangan): void
    {
        foreach ($sesi as &$s) { $s['status'] = 'BARU'; $s['keterangan'] = null; }
        unset($s);
        if (!$sesi) return;
        $lain = TransJadwal::with(['mapel:id_mapel,nama_mapel', 'guru:id_guru,nama_guru', 'kelas:id_kelas,nama_kelas', 'ruangan:id_ruangan,nama_ruangan'])
            ->where('status_sesi', '!=', 'Batal')
            ->where('mulai', '<', end($sesi)['selesai'])->where('selesai', '>', $sesi[0]['mulai'])
            ->where(fn($q) => $q->where('id_mapel', $idMapel)
                ->orWhereIn('id_guru', array_filter([$idGuru]) ?: ['-'])
                ->orWhereIn('id_ruangan', array_filter([$idRuangan]) ?: ['-'])
                ->orWhereIn('id_kelas', array_filter([$idKelas]) ?: ['-']))
            ->get(['id_jadwal', 'id_mapel', 'id_guru', 'id_kelas', 'id_ruangan', 'judul', 'mulai', 'selesai']);

        foreach ($sesi as &$s) {
            foreach ($lain as $l) {
                if (!($l->mulai->lt($s['selesai']) && $l->selesai->gt($s['mulai']))) continue;
                if ($l->id_mapel === $idMapel && (!$idKelas || $l->id_kelas === $idKelas)) {
                    $s['status'] = 'SUDAH_ADA';
                    $s['keterangan'] = 'Sesi mapel ini sudah ada di jam tersebut';
                    break;
                }
                $sebab = array_filter([
                    $idGuru && $l->id_guru === $idGuru ? 'guru ' . ($l->guru->nama_guru ?? '') : null,
                    $idRuangan && $l->id_ruangan === $idRuangan ? 'ruangan ' . ($l->ruangan->nama_ruangan ?? '') : null,
                    $idKelas && $l->id_kelas === $idKelas ? 'kelas ' . ($l->kelas->nama_kelas ?? '') : null,
                ]);
                if (!$sebab) continue;
                $s['status'] = 'BENTROK';
                $s['keterangan'] = 'Bentrok (' . implode(', ', $sebab) . ') dengan ' . ($l->judul ?: ($l->mapel->nama_mapel ?? 'sesi lain')) . ' ' . $l->mulai->format('H:i') . '–' . $l->selesai->format('H:i');
            }
        }
        unset($s);
    }
}

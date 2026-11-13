<?php

namespace App\Services;

use App\Models\Atp;
use App\Models\HariLibur;
use App\Models\MasterPeriode;
use App\Models\ModulAjar;
use App\Models\TransJadwal;
use Carbon\Carbon;
use Illuminate\Support\Collection;

/**
 * Program Semester (Promes) dan Program Tahunan (Prota) yang hidup: rencana dari ATP (alokasi JP & minggu efektif),
 * realisasi dari sesi jadwal yang menautkan TP/indikator/modul/materi, dan kalender minggu efektif dari hari libur.
 */
class ProgramAjarService
{
    public const MIN_HARI_EFEKTIF = 3; // minggu efektif bila ada minimal 3 hari sekolah (Senin–Sabtu, di luar hari libur)
    private const BULAN = ['', 'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

    /** Kalender minggu semester: tiap minggu Senin–Sabtu, hari sekolah, hari libur, dan nomor minggu efektifnya. */
    public function kalender(MasterPeriode $periode): array
    {
        [$awal, $akhir] = $periode->rentang();
        $ditandai = collect($periode->minggu_tidak_efektif ?? [])->keyBy('mulai');
        $minggu = [];
        $ke = 0;
        for ($senin = $awal->copy()->startOfWeek(); $senin->lte($akhir); $senin->addWeek()) {
            $hariSekolah = 0;
            $libur = [];
            for ($i = 0; $i < 6; $i++) {
                $d = $senin->copy()->addDays($i);
                if ($d->lt($awal->copy()->startOfDay()) || $d->gt($akhir)) continue;
                if ($nama = HariLibur::namaPada($d)) { $libur[] = $d->format('j/n') . ' ' . $nama; continue; }
                $hariSekolah++;
            }
            $tanda = $ditandai->get($senin->format('Y-m-d'));
            $efektif = !$tanda && $hariSekolah >= self::MIN_HARI_EFEKTIF;
            // Bulan minggu ditentukan oleh hari Kamis-nya (aturan ISO), agar minggu peralihan tidak dihitung dua kali
            $kamis = $senin->copy()->addDays(3);
            $minggu[] = [
                'indeks' => count($minggu),
                'mulai' => $senin->format('Y-m-d'),
                'selesai' => $senin->copy()->addDays(5)->format('Y-m-d'),
                'bulan' => $kamis->format('Y-m'),
                'nama_bulan' => self::BULAN[$kamis->month],
                'ke_bulan' => (int) ceil($kamis->day / 7),
                'hari_sekolah' => $hariSekolah,
                'libur' => $libur,
                'ditandai' => $tanda['keterangan'] ?? null,
                'efektif' => $efektif,
                'ke_efektif' => $efektif ? ++$ke : null,
            ];
        }
        return $minggu;
    }

    /** Rekap minggu efektif per bulan (tabel perhitungan minggu efektif pada dokumen Promes). */
    public function rekapBulan(array $minggu): array
    {
        return collect($minggu)->groupBy('bulan')->map(fn($m, $b) => [
            'bulan' => $b, 'nama' => $m->first()['nama_bulan'] . ' ' . substr($b, 0, 4),
            'jumlah_minggu' => $m->count(), 'efektif' => $m->where('efektif', true)->count(), 'tidak_efektif' => $m->where('efektif', false)->count(),
            'keterangan' => $m->pluck('ditandai')->filter()->merge($m->pluck('libur')->flatten())->unique()->values()->all(),
        ])->values()->all();
    }

    /** ATP yang menjadi acuan: yang disetujui lebih dulu, lalu yang terbaru. */
    public function pilihAtp(string $idMapel, ?string $idKelas, string $idPeriode): ?Atp
    {
        return Atp::with(['baris.cp:id_cp,elemen', 'baris.materi:id_materi,nama_materi', 'baris.indikator:id_indikator,deskripsi', 'mapel:id_mapel,nama_mapel', 'kelas:id_kelas,nama_kelas', 'pembuat:id,name'])
            ->where('id_mapel', $idMapel)->where('id_periode', $idPeriode)
            ->when($idKelas, fn($q) => $q->where(fn($w) => $w->where('id_kelas', $idKelas)->orWhereNull('id_kelas')))
            ->orderByRaw("CASE status WHEN 'DISETUJUI' THEN 0 WHEN 'DIAJUKAN' THEN 1 ELSE 2 END")
            ->orderByRaw('id_kelas IS NULL')->orderByDesc('updated_at')->first();
    }

    /** Promes satu mapel–kelas–semester: rencana per baris ATP, realisasi dari jadwal, status, dan ringkasan. */
    public function promes(MasterPeriode $periode, string $idMapel, ?string $idKelas): array
    {
        TransJadwal::perbaruiStatusOtomatis();
        $minggu = $this->kalender($periode);
        [$awal, $akhir, $bawaan] = $periode->rentang();
        $atp = $this->pilihAtp($idMapel, $idKelas, $periode->id_periode);
        $hariIni = $this->indeksMinggu($minggu, now(config('app.zona_sekolah'))->format('Y-m-d'));

        $sesi = TransJadwal::with('modul:id_modul,tp')
            ->where('id_mapel', $idMapel)->when($idKelas, fn($q) => $q->where('id_kelas', $idKelas))
            ->where('mulai', '>=', $awal)->where('mulai', '<=', $akhir)->orderBy('mulai')
            ->get(['id_jadwal', 'id_materi', 'id_modul', 'pertemuan_ke', 'mulai', 'selesai', 'status_sesi', 'perangkat', 'judul']);

        $baris = $atp ? $this->rencana($atp, $minggu) : [];
        $lepas = $this->cocokkan($baris, $sesi, $minggu);
        $baris = array_map(fn($b) => $this->statusBaris($b, $hariIni), $baris);

        $sesiAktif = $sesi->where('status_sesi', '!=', 'Batal');
        $totalJp = array_sum(array_column($baris, 'alokasi_jp'));
        $jpSelesai = array_sum(array_column($baris, 'jp_selesai'));
        return [
            'periode' => $periode->only(['id_periode', 'tahun_ajaran', 'semester']) + ['tanggal_mulai' => $awal->format('Y-m-d'), 'tanggal_selesai' => $akhir->format('Y-m-d'), 'rentang_bawaan' => $bawaan],
            'minggu' => $minggu,
            'bulan' => $this->rekapBulan($minggu),
            'minggu_ini' => $hariIni,
            'atp' => $atp ? $atp->only(['id_atp', 'judul', 'status', 'jp_per_minggu', 'minggu_efektif', 'fase']) + [
                'mapel' => $atp->mapel?->nama_mapel, 'kelas' => $atp->kelas?->nama_kelas, 'guru' => $atp->pembuat?->name,
            ] : null,
            'baris' => $baris,
            'sesi_lepas' => $lepas,
            'ringkasan' => [
                'minggu_efektif' => collect($minggu)->where('efektif', true)->count(),
                'minggu_total' => count($minggu),
                'jp_rencana' => $totalJp,
                'jp_selesai' => $jpSelesai,
                'persen' => $totalJp ? round(min(100, $jpSelesai / $totalJp * 100)) : 0,
                'tp_total' => count($baris),
                'tp_tuntas' => collect($baris)->where('status', 'TUNTAS')->count(),
                'tp_terlambat' => collect($baris)->where('status', 'TERLAMBAT')->count(),
                'sesi_total' => $sesiAktif->count(),
                'sesi_selesai' => $sesiAktif->where('status_sesi', 'Selesai')->count(),
                'sesi_batal' => $sesi->where('status_sesi', 'Batal')->count(),
            ],
        ];
    }

    /** Prota: kedua semester dalam satu tahun ajaran. */
    public function prota(string $tahunAjaran, string $idMapel, ?string $idKelas): array
    {
        $periode = MasterPeriode::where('tahun_ajaran', $tahunAjaran)->get()->sortBy(fn($p) => $p->semester === 'Ganjil' ? 0 : 1)->values();
        return [
            'tahun_ajaran' => $tahunAjaran,
            'semester' => $periode->map(fn($p) => $this->promes($p, $idMapel, $idKelas))->values()->all(),
        ];
    }

    // ================= BANTUAN =================

    private function indeksMinggu(array $minggu, string $tanggal): int
    {
        if (!$minggu || $tanggal < $minggu[0]['mulai']) return -1;
        foreach ($minggu as $m) {
            if ($tanggal <= Carbon::parse($m['mulai'])->addDays(6)->format('Y-m-d')) return $m['indeks'];
        }
        return count($minggu);
    }

    /** Rentang minggu efektif tiap baris: dari kolom "Minggu" ATP (mis. "5-7"), atau dibagi berurutan menurut JP per minggu. */
    private function rencana(Atp $atp, array $minggu): array
    {
        $efektif = array_values(array_filter($minggu, fn($m) => $m['efektif']));
        $keKalender = fn(int $ke) => $efektif[max(0, min(count($efektif) - 1, $ke - 1))]['indeks'] ?? 0;
        $jpMinggu = max(1, (int) ($atp->jp_per_minggu ?: 1));
        $kumulatif = 0;
        $hasil = [];
        foreach ($atp->baris as $i => $b) {
            $jp = (int) $b->alokasi_jp;
            if (preg_match('/(\d+)\s*(?:[-–sd\/]+\s*(\d+))?/', (string) $b->minggu, $m)) {
                [$a, $z] = [(int) $m[1], (int) ($m[2] ?? $m[1])];
                if ($z < $a) [$a, $z] = [$z, $a];
            } else {
                $a = intdiv($kumulatif, $jpMinggu) + 1;
                $z = max($a, (int) ceil(($kumulatif + max($jp, 1)) / $jpMinggu));
            }
            $kumulatif += $jp;
            $rentang = range($a, $z);
            // JP rencana dibagi rata ke minggu efektif dalam rentang (dipakai matriks bulan × minggu Promes)
            $perMinggu = [];
            foreach ($rentang as $j => $ke) {
                $bagian = intdiv($jp, count($rentang)) + ($j < $jp % count($rentang) ? 1 : 0);
                if ($bagian) $perMinggu[$keKalender($ke)] = ($perMinggu[$keKalender($ke)] ?? 0) + $bagian;
            }
            $hasil[] = [
                'id' => $b->id, 'no' => $i + 1,
                'elemen' => $b->cp?->elemen,
                'materi' => $b->materi?->nama_materi ?? $b->materi_usulan,
                'tp' => $b->indikator?->deskripsi ?? $b->tp_usulan,
                'id_materi' => $b->id_materi, 'id_indikator' => $b->id_indikator,
                'alokasi_jp' => $jp, 'minggu_teks' => $b->minggu, 'dimensi' => $b->dimensi,
                'rencana' => ['ke_awal' => $a, 'ke_akhir' => $z, 'awal' => $keKalender($a), 'akhir' => $keKalender($z), 'jp_per_minggu' => $perMinggu],
                'sesi' => [], 'jp_selesai' => 0, 'jp_terjadwal' => 0, 'realisasi_per_minggu' => [],
            ];
        }
        return $hasil;
    }

    /** Tautkan setiap sesi ke baris ATP. Urutan bukti: TP dipilih langsung → indikator → TP modul ajar → materi. */
    private function cocokkan(array &$baris, Collection $sesi, array $minggu): array
    {
        $lepas = [];
        foreach ($sesi as $s) {
            $perangkat = collect($s->perangkat ?? []);
            $target = [];
            $idBaris = $perangkat->where('jenis', 'ATP')->pluck('id')->map(fn($v) => (int) $v)->all();
            $indikator = $perangkat->where('jenis', 'INDIKATOR')->pluck('id')->all();
            foreach ($baris as $k => $b) if (in_array($b['id'], $idBaris, true)) $target[] = $k;
            if (!$target && $indikator) foreach ($baris as $k => $b) if ($b['id_indikator'] && in_array($b['id_indikator'], $indikator, true)) $target[] = $k;
            if (!$target && $s->modul?->tp) foreach ($baris as $k => $b) if ($b['id_indikator'] && in_array($b['id_indikator'], (array) $s->modul->tp, true)) $target[] = $k;
            if (!$target && $s->id_materi) {
                $calon = array_keys(array_filter($baris, fn($b) => $b['id_materi'] === $s->id_materi));
                // Materi yang sama di beberapa TP: isi berurutan sampai alokasinya terpenuhi
                foreach ($calon as $k) if ($baris[$k]['jp_selesai'] + $baris[$k]['jp_terjadwal'] < max(1, $baris[$k]['alokasi_jp'])) { $target = [$k]; break; }
                if (!$target && $calon) $target = [end($calon)];
            }

            $jp = $s->jp();
            $ringkas = [
                'id_jadwal' => $s->id_jadwal, 'mulai' => $s->mulai->format('Y-m-d\TH:i'), 'selesai' => $s->selesai->format('H:i'),
                'status' => $s->status_sesi, 'jp' => $jp, 'pertemuan_ke' => $s->pertemuan_ke,
                'minggu' => $this->indeksMinggu($minggu, $s->mulai->format('Y-m-d')),
            ];
            if (!$target) { $lepas[] = $ringkas; continue; }
            $bagian = round($jp / count($target), 2);
            foreach ($target as $k) {
                $baris[$k]['sesi'][] = $ringkas;
                if ($s->status_sesi === 'Batal') continue;
                if ($s->status_sesi === 'Selesai') {
                    $baris[$k]['jp_selesai'] += $bagian;
                    $baris[$k]['realisasi_per_minggu'][$ringkas['minggu']] = ($baris[$k]['realisasi_per_minggu'][$ringkas['minggu']] ?? 0) + $bagian;
                } else {
                    $baris[$k]['jp_terjadwal'] += $bagian;
                }
            }
        }
        return $lepas;
    }

    private function statusBaris(array $b, int $mingguIni): array
    {
        $aktif = array_filter($b['sesi'], fn($s) => $s['status'] !== 'Batal');
        $berjalan = array_filter($aktif, fn($s) => in_array($s['status'], ['Selesai', 'Berlangsung'], true));
        $tuntas = $b['alokasi_jp'] > 0 ? $b['jp_selesai'] >= $b['alokasi_jp'] : ($berjalan && $b['rencana']['akhir'] < $mingguIni);
        $b['status'] = match (true) {
            $tuntas => 'TUNTAS',
            $b['rencana']['akhir'] < $mingguIni && $b['jp_selesai'] + $b['jp_terjadwal'] < max(1, $b['alokasi_jp']) => 'TERLAMBAT',
            (bool) $berjalan => 'BERLANGSUNG',
            (bool) $aktif => 'TERJADWAL',
            default => 'BELUM',
        };
        $b['persen'] = $b['alokasi_jp'] ? (int) round(min(100, $b['jp_selesai'] / $b['alokasi_jp'] * 100)) : ($tuntas ? 100 : 0);
        $b['jp_selesai'] = round($b['jp_selesai'], 1);
        $b['jp_terjadwal'] = round($b['jp_terjadwal'], 1);
        $realisasi = array_keys($b['realisasi_per_minggu']);
        $b['realisasi'] = $realisasi ? ['awal' => min($realisasi), 'akhir' => max($realisasi)] : null;
        return $b;
    }
}

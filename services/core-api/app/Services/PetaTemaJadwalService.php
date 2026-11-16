<?php

namespace App\Services;

use App\Models\CapaianPembelajaran;
use App\Models\Classes;
use App\Models\HariLibur;
use App\Models\MasterIndikator;
use App\Models\MasterPeriode;
use App\Models\PetaTema;
use App\Models\Subject;
use App\Models\TransJadwal;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Peta Tema menggerakkan Jadwal kelas.
 * - Pola terstruktur (slot) disusun dari JP per minggu tiap cabang mapel, atau dari teks rekomendasi pola (AI/lokal).
 * - "Buat Jadwal": slot × minggu tema → sesi Jadwal (id_group TEMA-…, tertaut ke peta & slot, TP cabang dibagi rata,
 *   tautan INDIKATOR/ATP sehingga terhitung di Promes/Prota). Hari libur dilewati; sesi yang bentrok tidak dibuat.
 * - Sinkron dua arah: pola berubah → sesi tema yang akan datang menyesuaikan; sesi tema digeser sebagai rangkaian di Jadwal
 *   → slot pola ikut berubah. Tiap perubahan setelah jadwal dibuat dihitung (batas PetaTema::BATAS_PERUBAHAN).
 * - Cek keselarasan: JP target vs pola vs ATP, TP cabang vs rencana Promes, TP dipakai tema lain, cakupan elemen CP.
 */
class PetaTemaJadwalService
{
    public const WARNA = '#7b1fa2';

    public function __construct(private ProgramAjarService $program) {}

    // ================= SUSUN SLOT =================

    /** Hari yang diikuti satu cabang mapel. */
    private function hariCabang(array $c, bool $sabtu): array
    {
        $semua = $sabtu ? [1, 2, 3, 4, 5, 6] : [1, 2, 3, 4, 5];
        if ($c['frekuensi'] === 'HARIAN') return $semua;
        $hari = array_values(array_intersect($c['hari'] ?? [], [1, 2, 3, 4, 5, 6]));
        return $hari ?: [1, 3];
    }

    /**
     * Susun slot dari parameter cabang: JP per minggu dibagi ke hari pilihan (blok 2 JP bila bisa), lalu dikemas per hari
     * mulai jam masuk dengan istirahat 30 menit setelah 09:30. Cabang dua-mingguan memakai minggu ganjil.
     * @return array{pola: array, tidak_muat: array}
     */
    public function susunDariJp(array $jaring, array $aturan): array
    {
        $jp = max(20, (int) ($aturan['menit_jp'] ?? 35));
        $masuk = $aturan['jam_masuk'] ?? '07:30';
        $pulang = $aturan['jam_pulang'] ?? '12:30';
        $sabtu = (bool) ($aturan['sabtu'] ?? false);

        // Blok per hari: [hari => [[cabang, jp], ...]]
        $blok = [];
        foreach ($jaring['mapel'] as $c) {
            if (!$c['id_mapel'] || $c['jp_minggu'] < 1) continue;
            $hari = $this->hariCabang($c, $sabtu);
            $sisa = $c['jp_minggu'];
            $n = count($hari);
            foreach ($hari as $i => $h) {
                $bagian = (int) floor($c['jp_minggu'] / $n) + ($i < $c['jp_minggu'] % $n ? 1 : 0);
                if ($bagian < 1) continue;
                $blok[$h][] = [$c, $bagian];
                $sisa -= $bagian;
            }
        }

        $slot = [];
        $tidakMuat = [];
        foreach ($blok as $h => $daftar) {
            $jam = Carbon::createFromFormat('H:i', $masuk);
            $batas = Carbon::createFromFormat('H:i', $pulang);
            $istirahat = false;
            foreach ($daftar as [$c, $n]) {
                if (!$istirahat && $jam->format('H:i') >= '09:30') {
                    $slot[] = ['hari' => $h, 'mulai' => $jam->format('H:i'), 'selesai' => $jam->copy()->addMinutes(30)->format('H:i'), 'id_mapel' => null, 'kegiatan' => 'Istirahat', 'ulang' => 'MINGGUAN'];
                    $jam->addMinutes(30);
                    $istirahat = true;
                }
                $akhir = $jam->copy()->addMinutes($n * $jp);
                if ($akhir->gt($batas)) {
                    $tidakMuat[] = PetaTema::HARI[$h - 1] . ": {$c['nama']} {$n} JP";
                    continue;
                }
                $slot[] = ['hari' => $h, 'mulai' => $jam->format('H:i'), 'selesai' => $akhir->format('H:i'), 'id_mapel' => $c['id_mapel'],
                    'kegiatan' => Str::limit((string) $c['kalibrasi'], 120, '…'), 'ulang' => $c['frekuensi'] === 'DUA_MINGGU' ? 'GANJIL' : 'MINGGUAN'];
                $jam = $akhir;
            }
        }
        return ['pola' => PetaTema::normalSlot(['menit_jp' => $jp, 'jam_masuk' => $masuk, 'jam_pulang' => $pulang, 'slot' => $slot]), 'tidak_muat' => $tidakMuat];
    }

    /**
     * Ubah teks pola mingguan (hasil Rekomendasi AI / lokal, baris "07:30 Matematika: …") menjadi slot.
     * Jam selesai = jam baris berikutnya; baris terakhir 2 JP (tidak melewati jam pulang). Nama mapel dicocokkan ke cabang.
     */
    public function slotDariTeks(array $pola, array $jaring, array $aturan): array
    {
        $jp = max(20, (int) ($aturan['menit_jp'] ?? 35));
        $pulang = $aturan['jam_pulang'] ?? '12:30';
        $cabang = collect($jaring['mapel'])->filter(fn($c) => $c['id_mapel'])->sortByDesc(fn($c) => mb_strlen($c['nama']))->values();
        $slot = [];
        foreach (PetaTema::HARI as $i => $h) {
            $baris = collect(preg_split('/\R/', (string) ($pola[$h] ?? '')))
                ->map(fn($b) => trim($b))
                ->map(fn($b) => preg_match('/^(\d{1,2})[:.](\d{2})\s*[-–]?\s*(?:(\d{1,2})[:.](\d{2}))?\s*(.*)$/u', $b, $m)
                    ? ['mulai' => sprintf('%02d:%s', $m[1], $m[2]), 'selesai' => $m[3] !== '' ? sprintf('%02d:%s', $m[3], $m[4]) : null, 'teks' => trim($m[5], " \t:-–")]
                    : null)
                ->filter()->sortBy('mulai')->values()->all();
            foreach ($baris as $k => $b) {
                $selesai = $b['selesai'] ?? ($baris[$k + 1]['mulai'] ?? min($pulang, Carbon::createFromFormat('H:i', $b['mulai'])->addMinutes(2 * $jp)->format('H:i')));
                if ($selesai <= $b['mulai']) continue;
                $teksKecil = mb_strtolower($b['teks']);
                $c = $cabang->first(fn($c) => str_starts_with($teksKecil, mb_strtolower($c['nama'])))
                    ?? $cabang->first(fn($c) => preg_match('/\b' . preg_quote(mb_strtolower($c['nama']), '/') . '\b/u', $teksKecil));
                $kegiatan = $c ? trim(mb_substr($b['teks'], mb_stripos($b['teks'], $c['nama']) + mb_strlen($c['nama'])), " \t:-–") : $b['teks'];
                $slot[] = ['hari' => $i + 1, 'mulai' => $b['mulai'], 'selesai' => $selesai, 'id_mapel' => $c['id_mapel'] ?? null,
                    'kegiatan' => $kegiatan, 'ulang' => ($c['frekuensi'] ?? null) === 'DUA_MINGGU' ? 'GANJIL' : 'MINGGUAN'];
            }
        }
        return PetaTema::normalSlot(['menit_jp' => $jp, 'jam_masuk' => $aturan['jam_masuk'] ?? '07:30', 'jam_pulang' => $pulang, 'slot' => $slot]);
    }

    /** Teks pola mingguan per hari dari slot (agar tampilan & ekspor lama tetap terisi). */
    public function teksDariSlot(array $polaSlot, array $jaring): array
    {
        $nama = collect($jaring['mapel'])->pluck('nama', 'id_mapel')->filter();
        $mapelLain = $this->namaMapel(collect($polaSlot['slot'])->pluck('id_mapel')->filter()->diff($nama->keys())->all());
        $teks = [];
        foreach (PetaTema::HARI as $i => $h) {
            $teks[$h] = collect($polaSlot['slot'])->where('hari', $i + 1)->map(function ($s) use ($nama, $mapelLain) {
                $label = $s['id_mapel'] ? ($nama[$s['id_mapel']] ?? $mapelLain[$s['id_mapel']] ?? $s['id_mapel']) : '';
                $ulang = ['GANJIL' => ' (minggu ganjil)', 'GENAP' => ' (minggu genap)'][$s['ulang']] ?? '';
                return "{$s['mulai']}–{$s['selesai']} " . trim($label . ($label && $s['kegiatan'] ? ': ' : '') . $s['kegiatan']) . $ulang;
            })->implode("\n");
        }
        return PetaTema::normalPola($teks);
    }

    private function namaMapel(array $id): array
    {
        return $id ? Subject::whereIn('id_mapel', $id)->pluck('nama_mapel', 'id_mapel')->all() : [];
    }

    /** JP per minggu (rata-rata) tiap mapel dari slot; slot ganjil/genap dihitung setengah. */
    public function jpPola(array $polaSlot): array
    {
        $jp = max(20, $polaSlot['menit_jp'] ?? 35);
        $hasil = [];
        foreach ($polaSlot['slot'] ?? [] as $s) {
            if (!$s['id_mapel']) continue;
            $n = (Carbon::createFromFormat('H:i', $s['mulai'])->diffInMinutes(Carbon::createFromFormat('H:i', $s['selesai']))) / $jp;
            $hasil[$s['id_mapel']] = ($hasil[$s['id_mapel']] ?? 0) + ($s['ulang'] === 'MINGGUAN' ? $n : $n / 2);
        }
        return array_map(fn($v) => round($v, 1), $hasil);
    }

    // ================= RENCANA SESI =================

    /** Senin minggu tema pertama. */
    public function seninAwal(PetaTema $peta): Carbon
    {
        return Carbon::parse($peta->tanggal_mulai->format('Y-m-d'))->startOfWeek(Carbon::MONDAY)->startOfDay();
    }

    /** Guru tiap mapel: pengampu mapel, atau wali kelas bila mapel belum punya pengampu. */
    private function guruMapel(PetaTema $peta, array $idMapel): array
    {
        $wali = Classes::whereKey($peta->id_kelas)->value('wali_kelas');
        return collect($idMapel)->mapWithKeys(fn($id) => [$id => null])->merge(Subject::whereIn('id_mapel', $idMapel)->pluck('id_guru', 'id_mapel'))
            ->map(fn($g) => $g ?: $wali)->all();
    }

    /**
     * Semua sesi yang seharusnya ada menurut pola: [{kunci, tanggal, mulai, selesai, id_slot, id_mapel, id_guru, minggu_ke}].
     * @return array{0: array, 1: array} sesi, tanggal libur yang dilewati
     */
    public function rencana(PetaTema $peta): array
    {
        $pola = PetaTema::normalSlot($peta->pola_slot);
        $slot = array_values(array_filter($pola['slot'], fn($s) => $s['id_mapel']));
        $guru = $this->guruMapel($peta, array_unique(array_column($slot, 'id_mapel')));
        $senin = $this->seninAwal($peta);
        $awal = Carbon::parse($peta->tanggal_mulai->format('Y-m-d'))->startOfDay();
        $sesi = [];
        $libur = [];
        for ($ke = 1; $ke <= $peta->jumlah_minggu; $ke++) {
            foreach ($slot as $s) {
                if (($s['ulang'] === 'GANJIL' && $ke % 2 === 0) || ($s['ulang'] === 'GENAP' && $ke % 2 === 1)) continue;
                $tgl = $senin->copy()->addWeeks($ke - 1)->addDays($s['hari'] - 1);
                if ($tgl->lt($awal)) continue;
                if ($nama = HariLibur::namaPada($tgl)) { $libur[$tgl->format('Y-m-d')] = "{$tgl->format('Y-m-d')} ({$nama})"; continue; }
                $sesi[] = [
                    'kunci' => $tgl->format('Y-m-d') . '|' . $s['id'], 'tanggal' => $tgl->format('Y-m-d'),
                    'mulai' => Carbon::parse($tgl->format('Y-m-d') . ' ' . $s['mulai']), 'selesai' => Carbon::parse($tgl->format('Y-m-d') . ' ' . $s['selesai']),
                    'id_slot' => $s['id'], 'id_mapel' => $s['id_mapel'], 'id_guru' => $guru[$s['id_mapel']] ?? null, 'minggu_ke' => $ke, 'kegiatan' => $s['kegiatan'],
                ];
            }
        }
        usort($sesi, fn($a, $b) => $a['mulai'] <=> $b['mulai']);
        return [$sesi, array_values($libur)];
    }

    /**
     * Tandai tiap sesi rencana: SUDAH_ADA (sesi tema dengan kunci sama sudah ada), BENTROK (kelas atau guru dipakai sesi lain), BARU.
     * @param array $kecuali id_jadwal yang diabaikan (sesi tema yang akan diganti saat sinkron)
     */
    private function tandai(PetaTema $peta, array $sesi, array $kecuali = []): array
    {
        if (!$sesi) return [];
        $ada = TransJadwal::where('id_peta', $peta->id_peta)->get(['id_jadwal', 'id_slot_tema', 'mulai'])
            ->keyBy(fn($j) => $j->mulai->format('Y-m-d') . '|' . $j->id_slot_tema);
        $guru = array_values(array_unique(array_filter(array_column($sesi, 'id_guru'))));
        $lain = TransJadwal::with(['mapel:id_mapel,nama_mapel', 'kelas:id_kelas,nama_kelas', 'guru:id_guru,nama_guru'])
            ->where('status_sesi', '!=', 'Batal')
            ->where('mulai', '<', end($sesi)['selesai'])->where('selesai', '>', $sesi[0]['mulai'])
            ->where(fn($q) => $q->whereNull('id_peta')->orWhere('id_peta', '!=', $peta->id_peta))
            ->when($kecuali, fn($q) => $q->whereNotIn('id_jadwal', $kecuali))
            ->where(fn($q) => $q->where('id_kelas', $peta->id_kelas)->orWhereIn('id_guru', $guru ?: ['-']))
            ->get(['id_jadwal', 'id_mapel', 'id_guru', 'id_kelas', 'judul', 'mulai', 'selesai']);
        foreach ($sesi as &$s) {
            $s['status'] = 'BARU';
            $s['keterangan'] = null;
            if (isset($ada[$s['kunci']])) { $s['status'] = 'SUDAH_ADA'; $s['id_jadwal'] = $ada[$s['kunci']]->id_jadwal; continue; }
            foreach ($lain as $l) {
                if (!($l->mulai->lt($s['selesai']) && $l->selesai->gt($s['mulai']))) continue;
                $sebab = $l->id_kelas === $peta->id_kelas ? 'kelas sudah ada ' : 'guru mengajar ';
                $s['status'] = 'BENTROK';
                $s['keterangan'] = $sebab . ($l->judul ?: ($l->mapel->nama_mapel ?? 'sesi lain')) . ($l->id_kelas !== $peta->id_kelas && $l->kelas ? " di {$l->kelas->nama_kelas}" : '')
                    . ' ' . $l->mulai->format('H:i') . '–' . $l->selesai->format('H:i');
                break;
            }
        }
        unset($s);
        return $sesi;
    }

    /** Pratinjau "Buat Jadwal": sesi rencana beserta status, sesi manual kelas di rentang tema, hari libur. */
    public function pratinjau(PetaTema $peta): array
    {
        [$sesi, $libur] = $this->rencana($peta);
        $sesi = $this->tandai($peta, $sesi);
        $nama = $this->namaMapel(array_unique(array_column($sesi, 'id_mapel')));
        $guru = \App\Models\Teacher::whereIn('id_guru', array_unique(array_filter(array_column($sesi, 'id_guru'))))->pluck('nama_guru', 'id_guru');
        $manual = $sesi ? TransJadwal::where('id_kelas', $peta->id_kelas)->whereNull('id_peta')->where('status_sesi', '!=', 'Batal')
            ->whereBetween('mulai', [$sesi[0]['mulai']->copy()->startOfDay(), end($sesi)['selesai']->copy()->endOfDay()])->count() : 0;
        return [
            'sesi' => array_map(fn($s) => [
                'kunci' => $s['kunci'], 'tanggal' => $s['tanggal'], 'mulai' => $s['mulai']->format('H:i'), 'selesai' => $s['selesai']->format('H:i'),
                'minggu_ke' => $s['minggu_ke'], 'mapel' => $nama[$s['id_mapel']] ?? $s['id_mapel'], 'guru' => $guru[$s['id_guru']] ?? null,
                'status' => $s['status'], 'keterangan' => $s['keterangan'],
            ], $sesi),
            'libur' => $libur,
            'jadwal_manual' => $manual,
            'tanpa_guru' => array_values(array_unique(array_map(fn($s) => $nama[$s['id_mapel']] ?? $s['id_mapel'], array_filter($sesi, fn($s) => !$s['id_guru'])))),
            'ringkasan' => collect($sesi)->countBy('status')->all() + ['total' => count($sesi)],
        ];
    }

    /** TP cabang dibagi rata ke sesi tiap mapel (urut tanggal) → perangkat TEMA + INDIKATOR (+ baris ATP bila ada). */
    private function perangkat(PetaTema $peta, array $sesi): array
    {
        $jaring = PetaTema::normalJaring($peta->jaring);
        $tpCabang = collect($jaring['mapel'])->filter(fn($c) => $c['id_mapel'])->mapWithKeys(fn($c) => [$c['id_mapel'] => $c['tp']])->all();
        $semuaTp = collect($tpCabang)->flatten()->unique()->values()->all();
        $indikator = $semuaTp ? MasterIndikator::whereIn('id_indikator', $semuaTp)->get(['id_indikator', 'id_materi', 'deskripsi'])->keyBy('id_indikator') : collect();
        $barisAtp = [];
        if ($peta->id_periode) {
            foreach (array_keys($tpCabang) as $idMapel) {
                $atp = $this->program->pilihAtp($idMapel, $peta->id_kelas, $peta->id_periode);
                foreach ($atp?->baris ?? [] as $b) if ($b->id_indikator) $barisAtp[$b->id_indikator] = ['id' => $b->id, 'atp' => $atp->id_atp];
            }
        }
        $perMapel = [];
        foreach ($sesi as $i => $s) $perMapel[$s['id_mapel']][] = $i;
        $hasil = [];
        foreach ($perMapel as $idMapel => $indeks) {
            $tp = array_values(array_filter($tpCabang[$idMapel] ?? [], fn($t) => isset($indikator[$t])));
            foreach ($indeks as $urut => $i) {
                $p = [['jenis' => 'TEMA', 'id' => $peta->id_peta, 'label' => Str::limit($peta->judul, 280)]];
                $idMateri = null;
                if ($tp) {
                    $t = $indikator[$tp[(int) floor($urut * count($tp) / count($indeks))]];
                    $p[] = ['jenis' => 'INDIKATOR', 'id' => (string) $t->id_indikator, 'label' => Str::limit((string) $t->deskripsi, 280)];
                    if (isset($barisAtp[$t->id_indikator])) $p[] = ['jenis' => 'ATP', 'id' => (string) $barisAtp[$t->id_indikator]['id'], 'label' => Str::limit((string) $t->deskripsi, 280), 'atp' => $barisAtp[$t->id_indikator]['atp']];
                    $idMateri = $t->id_materi;
                }
                $hasil[$i] = ['perangkat' => $p, 'id_materi' => $idMateri];
            }
        }
        return $hasil;
    }

    private function dataSesi(PetaTema $peta, array $s, array $perangkat): array
    {
        $judulMinggu = collect($peta->minggu ?? [])->firstWhere('ke', $s['minggu_ke'])['judul'] ?? '';
        return [
            'id_group' => 'TEMA-' . $peta->id_peta, 'id_periode' => $peta->id_periode, 'id_kelas' => $peta->id_kelas,
            'id_mapel' => $s['id_mapel'], 'id_guru' => $s['id_guru'], 'id_materi' => $perangkat['id_materi'] ?? null,
            'warna' => self::WARNA, 'perangkat' => $perangkat['perangkat'] ?? null,
            'catatan' => Str::limit("Peta Tema «{$peta->judul}» · minggu ke-{$s['minggu_ke']}" . ($judulMinggu ? ": {$judulMinggu}" : '') . ($s['kegiatan'] ? "\n{$s['kegiatan']}" : ''), 2900),
            'id_peta' => $peta->id_peta, 'id_slot_tema' => $s['id_slot'],
            'mulai' => $s['mulai'], 'selesai' => $s['selesai'], 'status_sesi' => TransJadwal::statusMenurutWaktu($s['mulai'], $s['selesai']),
        ];
    }

    /** Buat sesi BARU dari pola (yang bentrok/sudah ada dilewati). */
    public function buat(PetaTema $peta): array
    {
        [$sesi] = $this->rencana($peta);
        $sesi = $this->tandai($peta, $sesi);
        $perangkat = $this->perangkat($peta, $sesi);
        $dibuat = 0;
        DB::transaction(function () use ($peta, $sesi, $perangkat, &$dibuat) {
            foreach ($sesi as $i => $s) {
                if ($s['status'] !== 'BARU') continue;
                TransJadwal::create(['id_jadwal' => 'JDW-' . Str::uuid()] + $this->dataSesi($peta, $s, $perangkat[$i] ?? []));
                $dibuat++;
            }
            $peta->forceFill(['jadwal_dibuat_pada' => $peta->jadwal_dibuat_pada ?? now()])->save();
        });
        $hitung = collect($sesi)->countBy('status');
        return ['dibuat' => $dibuat, 'bentrok' => $hitung['BENTROK'] ?? 0, 'sudah_ada' => $hitung['SUDAH_ADA'] ?? 0];
    }

    /**
     * Pola berubah → sesi tema yang belum dimulai disesuaikan: sesi dengan tanggal+slot yang masih ada diperbarui jamnya
     * (tautan modul/perangkat guru dipertahankan), yang tidak ada lagi dihapus, yang baru dibuat (kecuali bentrok).
     */
    public function sinkron(PetaTema $peta): array
    {
        $kini = now(config('app.zona_sekolah'))->format('Y-m-d H:i:s');
        $lama = TransJadwal::where('id_peta', $peta->id_peta)->where('mulai', '>', $kini)->where('status_sesi', '!=', 'Batal')->get();
        $lamaKunci = $lama->keyBy(fn($j) => $j->mulai->format('Y-m-d') . '|' . $j->id_slot_tema);
        [$semua] = $this->rencana($peta);
        $rencana = array_values(array_filter($semua, fn($s) => $s['mulai']->format('Y-m-d H:i:s') > $kini));
        $baru = array_values(array_filter($rencana, fn($s) => !isset($lamaKunci[$s['kunci']])));
        $baru = $this->tandai($peta, $baru, $lama->pluck('id_jadwal')->all());
        $perangkat = $this->perangkat($peta, $semua);
        $indeks = array_flip(array_column($semua, 'kunci'));
        $hasil = ['diperbarui' => 0, 'dihapus' => 0, 'dibuat' => 0, 'bentrok' => 0];
        DB::transaction(function () use ($peta, $lama, $rencana, $baru, $perangkat, $indeks, &$hasil) {
            $tetap = [];
            foreach ($rencana as $s) {
                $j = $lama->first(fn($j) => $j->mulai->format('Y-m-d') . '|' . $j->id_slot_tema === $s['kunci']);
                if (!$j) continue;
                $tetap[] = $j->id_jadwal;
                $ubah = array_filter([
                    'mulai' => $j->mulai->format('H:i') !== $s['mulai']->format('H:i') ? $s['mulai'] : null,
                    'selesai' => $j->selesai->format('H:i') !== $s['selesai']->format('H:i') ? $s['selesai'] : null,
                    'id_mapel' => $j->id_mapel !== $s['id_mapel'] ? $s['id_mapel'] : null,
                    'id_guru' => $j->id_mapel !== $s['id_mapel'] ? $s['id_guru'] : null,
                ]);
                if ($ubah) { TransJadwal::whereKey($j->id_jadwal)->update($ubah); $hasil['diperbarui']++; }
            }
            $hapus = $lama->whereNotIn('id_jadwal', $tetap)->pluck('id_jadwal');
            if ($hapus->isNotEmpty()) { TransJadwal::whereIn('id_jadwal', $hapus)->delete(); $hasil['dihapus'] = $hapus->count(); }
            foreach ($baru as $s) {
                if ($s['status'] !== 'BARU') { $hasil['bentrok'] += $s['status'] === 'BENTROK' ? 1 : 0; continue; }
                TransJadwal::create(['id_jadwal' => 'JDW-' . Str::uuid()] + $this->dataSesi($peta, $s, $perangkat[$indeks[$s['kunci']]] ?? []));
                $hasil['dibuat']++;
            }
        });
        return $hasil;
    }

    /**
     * Sesi tema digeser/diubah sebagai rangkaian di Jadwal → slot pola mengikuti hari & jam baru sesi itu.
     * Mengembalikan ringkasan perubahan, atau null bila slot tidak berubah.
     */
    public function slotDariSesi(PetaTema $peta, TransJadwal $sesi): ?string
    {
        $pola = PetaTema::normalSlot($peta->pola_slot);
        $i = collect($pola['slot'])->search(fn($s) => $s['id'] === $sesi->id_slot_tema);
        if ($i === false) return null;
        $lama = $pola['slot'][$i];
        $baru = ['hari' => $sesi->mulai->dayOfWeekIso, 'mulai' => $sesi->mulai->format('H:i'), 'selesai' => $sesi->selesai->format('H:i')];
        if ($baru['hari'] > 6 || ($lama['hari'] === $baru['hari'] && $lama['mulai'] === $baru['mulai'] && $lama['selesai'] === $baru['selesai'])) return null;
        $pola['slot'][$i] = array_merge($lama, $baru);
        $pola = PetaTema::normalSlot($pola);
        $jaring = PetaTema::normalJaring($peta->jaring);
        $peta->pola_slot = $pola;
        $peta->pola = $this->teksDariSlot($pola, $jaring);
        $nama = $sesi->mapel?->nama_mapel ?? $sesi->id_mapel;
        $hari = fn($h) => ucfirst(PetaTema::HARI[$h - 1] ?? '?');
        return "{$nama}: {$hari($lama['hari'])} {$lama['mulai']}–{$lama['selesai']} → {$hari($baru['hari'])} {$baru['mulai']}–{$baru['selesai']}";
    }

    // ================= CEK KESELARASAN =================

    /**
     * Telaah keselarasan Peta Tema dengan ATP/Promes/CP & jadwal. Tiap masalah: {tingkat: bahaya|peringatan|info, teks}.
     */
    public function cek(PetaTema $peta): array
    {
        $jaring = PetaTema::normalJaring($peta->jaring);
        $polaSlot = PetaTema::normalSlot($peta->pola_slot);
        $jpPola = $this->jpPola($polaSlot);
        $periode = $peta->id_periode ? MasterPeriode::find($peta->id_periode) : null;
        $masalah = [];
        $tambah = function (string $tingkat, string $teks) use (&$masalah) { $masalah[] = ['tingkat' => $tingkat, 'teks' => $teks]; };

        // Minggu efektif yang dilalui tema (untuk dibandingkan dengan rencana Promes)
        $mingguTema = [];
        $kalender = $periode ? $this->program->kalender($periode) : [];
        if ($peta->tanggal_mulai) {
            $awal = $this->seninAwal($peta);
            $akhir = $awal->copy()->addWeeks($peta->jumlah_minggu)->subDay();
            foreach ($kalender as $m) {
                if ($m['mulai'] > $akhir->format('Y-m-d') || $m['selesai'] < $awal->format('Y-m-d')) continue;
                if ($m['efektif']) $mingguTema[] = $m['ke_efektif'];
                elseif ($m['ditandai']) $tambah('peringatan', "Minggu {$m['mulai']} ditandai tidak efektif ({$m['ditandai']}) tetapi masuk rentang tema.");
            }
        } else {
            $tambah('peringatan', 'Tanggal mulai tema belum diisi; jadwal belum bisa dibuat dan rencana Promes belum bisa dibandingkan.');
        }

        // Tema lain di kelas yang sama dengan rentang beririsan
        if ($peta->id_kelas && $peta->tanggal_mulai) {
            $awal = $this->seninAwal($peta);
            $akhir = $awal->copy()->addWeeks($peta->jumlah_minggu);
            $lain = PetaTema::where('id_kelas', $peta->id_kelas)->where('id_peta', '!=', $peta->id_peta)->whereNotNull('tanggal_mulai')->get(['id_peta', 'judul', 'tanggal_mulai', 'jumlah_minggu', 'jaring', 'status']);
            foreach ($lain as $t) {
                $a = Carbon::parse($t->tanggal_mulai->format('Y-m-d'))->startOfWeek(Carbon::MONDAY);
                if ($a->lt($akhir) && $a->copy()->addWeeks($t->jumlah_minggu)->gt($awal)) {
                    $tambah('bahaya', "Rentang tanggal beririsan dengan peta tema \"{$t->judul}\" di kelas yang sama.");
                }
            }
        } else {
            $lain = collect();
        }
        $tpTemaLain = $lain->flatMap(fn($t) => collect($t->jaring['mapel'] ?? [])->pluck('tp')->flatten()->map(fn($tp) => [$tp, $t->judul]))->groupBy(0);

        $mapel = [];
        $semuaTp = collect($jaring['mapel'])->pluck('tp')->flatten()->unique()->values()->all();
        $deskripsi = $semuaTp ? MasterIndikator::whereIn('id_indikator', $semuaTp)->pluck('deskripsi', 'id_indikator') : collect();
        foreach ($jaring['mapel'] as $c) {
            if (!$c['id_mapel']) { $tambah('peringatan', "Cabang \"{$c['nama']}\" belum memilih mata pelajaran; tidak bisa dijadwalkan."); continue; }
            $target = $c['frekuensi'] === 'DUA_MINGGU' ? $c['jp_minggu'] / 2 : $c['jp_minggu'];
            $pola = $jpPola[$c['id_mapel']] ?? 0;
            $atp = $periode ? $this->program->pilihAtp($c['id_mapel'], $peta->id_kelas, $periode->id_periode) : null;
            $promes = $atp && $periode ? collect($this->program->promes($periode, $c['id_mapel'], $peta->id_kelas)['baris'])->keyBy('id_indikator') : collect();
            $cp = CapaianPembelajaran::where('id_mapel', $c['id_mapel'])->when($peta->fase, fn($q) => $q->where('fase', $peta->fase))->pluck('elemen')->unique()->values();

            $tp = collect($c['tp'])->map(function ($t) use ($promes, $mingguTema, $tpTemaLain, $deskripsi) {
                $b = $promes[$t] ?? null;
                $status = match (true) {
                    !$b => 'TIDAK_DI_ATP',
                    $b['status'] === 'TUNTAS' => 'SUDAH_TUNTAS',
                    $mingguTema && !array_intersect(range($b['rencana']['ke_awal'], $b['rencana']['ke_akhir']), $mingguTema) => 'BEDA_MINGGU',
                    default => 'SELARAS',
                };
                return [
                    'id_indikator' => $t, 'deskripsi' => $deskripsi[$t] ?? $t, 'status' => $status, 'elemen' => $b['elemen'] ?? null,
                    'rencana' => $b ? "minggu efektif {$b['rencana']['ke_awal']}" . ($b['rencana']['ke_akhir'] !== $b['rencana']['ke_awal'] ? "–{$b['rencana']['ke_akhir']}" : '') : null,
                    'tema_lain' => isset($tpTemaLain[$t]) ? $tpTemaLain[$t]->pluck(1)->unique()->values()->all() : [],
                ];
            })->values();
            $elemenTersentuh = $tp->pluck('elemen')->filter()->unique()->values();

            if (!$c['tp']) $tambah('peringatan', "{$c['nama']}: belum ada TP yang ditautkan, capaian CP tidak terlacak.");
            if ($c['jp_minggu'] < 1) $tambah('peringatan', "{$c['nama']}: JP per minggu belum diisi.");
            elseif (abs($target - $pola) >= 0.5) $tambah('bahaya', "{$c['nama']}: target {$target} JP/minggu, pola baru menyediakan {$pola} JP.");
            if ($atp && $atp->jp_per_minggu && $c['jp_minggu'] && abs($atp->jp_per_minggu - $target) >= 0.5) {
                $tambah('info', "{$c['nama']}: ATP \"{$atp->judul}\" merencanakan {$atp->jp_per_minggu} JP/minggu, peta tema {$target} JP.");
            }
            if (!$atp) $tambah('peringatan', "{$c['nama']}: belum ada ATP semester ini untuk kelas ini, sesi tema tidak terhitung di Promes per baris ATP.");
            foreach ($tp as $t) {
                $pendek = Str::limit($t['deskripsi'], 70);
                if ($t['status'] === 'SUDAH_TUNTAS') $tambah('peringatan', "{$c['nama']}: TP \"{$pendek}\" sudah tuntas di Promes, diajarkan ulang di tema ini.");
                if ($t['status'] === 'BEDA_MINGGU') $tambah('peringatan', "{$c['nama']}: TP \"{$pendek}\" direncanakan Promes di {$t['rencana']}, tema berjalan di minggu efektif " . implode(', ', $mingguTema) . '.');
                if ($t['status'] === 'TIDAK_DI_ATP' && $atp) $tambah('info', "{$c['nama']}: TP \"{$pendek}\" tidak ada di ATP \"{$atp->judul}\".");
                if ($t['tema_lain']) $tambah('peringatan', "{$c['nama']}: TP \"{$pendek}\" juga dipakai peta tema " . implode(', ', $t['tema_lain']) . '.');
            }
            $mapel[] = [
                'id_mapel' => $c['id_mapel'], 'nama' => $c['nama'], 'jp_target' => $target, 'jp_pola' => $pola, 'jp_atp' => $atp?->jp_per_minggu,
                'atp' => $atp ? ['id_atp' => $atp->id_atp, 'judul' => $atp->judul, 'status' => $atp->status] : null,
                'tp' => $tp->all(), 'elemen_cp' => $cp->all(), 'elemen_tersentuh' => $elemenTersentuh->all(),
            ];
        }

        // Slot pola yang beririsan satu sama lain di hari yang sama
        $slot = collect($polaSlot['slot']);
        foreach ($slot as $a) {
            foreach ($slot as $b) {
                if ($a['id'] >= $b['id'] || $a['hari'] !== $b['hari'] || !($a['mulai'] < $b['selesai'] && $b['mulai'] < $a['selesai'])) continue;
                if ($a['ulang'] !== 'MINGGUAN' && $b['ulang'] !== 'MINGGUAN' && $a['ulang'] !== $b['ulang']) continue;
                $tambah('bahaya', ucfirst(PetaTema::HARI[$a['hari'] - 1]) . " {$a['mulai']}: dua kegiatan di pola beririsan jamnya.");
            }
        }
        $mapelPola = $slot->pluck('id_mapel')->filter()->unique();
        foreach ($mapelPola->diff(collect($jaring['mapel'])->pluck('id_mapel')) as $id) $tambah('peringatan', "Pola memuat mapel {$id} yang bukan cabang spider web.");

        // Status jadwal tema
        $jadwal = null;
        if ($peta->jadwal_dibuat_pada) {
            [$rencana] = $this->rencana($peta);
            $ada = TransJadwal::where('id_peta', $peta->id_peta)->where('status_sesi', '!=', 'Batal')->count();
            $jadwal = ['rencana' => count($rencana), 'ada' => $ada];
            if ($ada < count($rencana)) $tambah('info', "Jadwal memuat {$ada} dari " . count($rencana) . ' sesi menurut pola (sisanya bentrok atau dihapus).');
        }

        $urut = ['bahaya' => 0, 'peringatan' => 1, 'info' => 2];
        usort($masalah, fn($a, $b) => $urut[$a['tingkat']] <=> $urut[$b['tingkat']]);
        return ['masalah' => $masalah, 'mapel' => $mapel, 'minggu_efektif' => $mingguTema, 'jadwal' => $jadwal,
            'ringkasan' => collect($masalah)->countBy('tingkat')->all()];
    }

    /** Kepala sekolah untuk penulisan atas nama: akun kepsek aktif, atau akun yang mengisi bila belum ada. */
    public static function akunKepsek(User $pengisi): User
    {
        if ($pengisi->isKepsek()) return $pengisi;
        return User::where('role', 'kepsek')->where('aktif', true)->orderBy('id')->first() ?? $pengisi;
    }
}

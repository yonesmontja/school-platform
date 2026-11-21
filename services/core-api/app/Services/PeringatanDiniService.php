<?php

namespace App\Services;

use App\Models\Classes;
use App\Models\MasterPeriode;
use App\Models\PaketSoal;
use App\Models\PaketSoalJawaban;
use App\Models\Student;
use App\Models\TransNilai;
use App\Models\TransJurnal;
use App\Models\TransPembinaanPresensi;
use App\Models\TransPeringatanTindak;
use App\Models\TransPresensi;
use Carbon\Carbon;
use Illuminate\Support\Collection;

/**
 * Peringatan dini siswa: skor sederhana yang bisa dijelaskan, dihitung dari data yang sudah ada
 * (presensi 30 hari terakhir, nilai efektif semester aktif, tes online yang terlewat, catatan perilaku negatif di jurnal,
 * pembinaan kehadiran).
 * Tidak memakai model AI: setiap poin punya alasan yang bisa dibaca guru.
 *
 * Tingkat: TINGGI (skor >= 6), SEDANG (3–5), PERHATIAN (1–2), AMAN (0).
 */
class PeringatanDiniService
{
    public const HARI_PRESENSI = 30;
    public const TINGKAT = ['TINGGI' => 6, 'SEDANG' => 3, 'PERHATIAN' => 1];

    private Carbon $sekarang;
    private string $hariIni;
    private ?string $periode;

    public function __construct()
    {
        $this->sekarang = now(config('app.zona_sekolah'));
        $this->hariIni = $this->sekarang->toDateString();
        $this->periode = MasterPeriode::where('status_aktif', 'AKTIF')->value('id_periode');
    }

    public function periode(): ?string { return $this->periode; }

    public static function tingkat(int $skor): string
    {
        foreach (self::TINGKAT as $nama => $batas) if ($skor >= $batas) return $nama;
        return 'AMAN';
    }

    /**
     * Hitung peringatan untuk sekumpulan siswa.
     * @param Collection<Student> $siswa (dengan relasi kelas)
     * @return Collection daftar hasil, terurut dari skor tertinggi
     */
    public function hitung(Collection $siswa): Collection
    {
        if ($siswa->isEmpty()) return collect();
        $id = $siswa->pluck('id_siswa')->all();

        $presensi = $this->presensi($id);
        $nilai = $this->nilai($id);
        $tes = $this->tesTerlewat($siswa);
        $pembinaan = $this->pembinaan($id);
        $karakter = $this->karakter($id);
        $kenaikan = $this->kenaikan($siswa);
        $tindak = $this->periode
            ? TransPeringatanTindak::with('pembuat:id,name')->where('id_periode', $this->periode)->whereIn('id_siswa', $id)
                ->orderByDesc('created_at')->get()->groupBy('id_siswa')
            : collect();

        return $siswa->map(function (Student $s) use ($presensi, $nilai, $tes, $pembinaan, $karakter, $kenaikan, $tindak) {
            $alasan = array_merge(
                $presensi[$s->id_siswa]['alasan'] ?? [],
                $nilai[$s->id_siswa]['alasan'] ?? [],
                $tes[$s->id_siswa]['alasan'] ?? [],
                $pembinaan[$s->id_siswa]['alasan'] ?? [],
                $karakter[$s->id_siswa] ?? [],
                $kenaikan[$s->id_siswa] ?? [],
            );
            usort($alasan, fn($a, $b) => $b['bobot'] <=> $a['bobot']);
            $skor = array_sum(array_column($alasan, 'bobot'));
            $kunci = substr(md5(json_encode(array_column($alasan, 'kode'))), 0, 12);
            $terakhir = ($tindak[$s->id_siswa] ?? collect())->first();

            return [
                'id_siswa' => $s->id_siswa,
                'nama_siswa' => $s->nama_siswa,
                'id_kelas' => $s->id_kelas,
                'nama_kelas' => $s->kelas?->nama_kelas,
                'foto_url' => $s->foto_url,
                'skor' => $skor,
                'tingkat' => self::tingkat($skor),
                'alasan' => $alasan,
                'kunci' => $kunci,
                'ringkas' => [
                    'hadir_persen' => $presensi[$s->id_siswa]['hadir_persen'] ?? null,
                    'alpa' => $presensi[$s->id_siswa]['alpa'] ?? 0,
                    'mapel_bawah_kkm' => $nilai[$s->id_siswa]['mapel_bawah'] ?? 0,
                    'rata_nilai' => $nilai[$s->id_siswa]['rata'] ?? null,
                    'tes_terlewat' => $tes[$s->id_siswa]['jumlah'] ?? 0,
                ],
                // Tindak lanjut terakhir; "ditangani" bila dicatat untuk kumpulan alasan yang sama
                'tindak_lanjut' => $terakhir ? [
                    'id' => $terakhir->id,
                    'catatan' => $terakhir->catatan,
                    'oleh' => $terakhir->pembuat?->name,
                    'pada' => $terakhir->created_at?->toIso8601String(),
                    'masih_berlaku' => $terakhir->kunci_alasan === $kunci,
                ] : null,
                'riwayat_tindak' => ($tindak[$s->id_siswa] ?? collect())->count(),
            ];
        })->sortBy([fn($a, $b) => $b['skor'] <=> $a['skor'], fn($a, $b) => strcmp($a['nama_siswa'], $b['nama_siswa'])])->values();
    }

    /** Siswa yang boleh dilihat pengguna, opsional disaring per kelas. */
    public static function siswaUntuk(\App\Models\User $u, ?string $idKelas = null): Collection
    {
        $kelasBoleh = ($u->isAdmin() || $u->isKepsek() || $u->isPeninjau()) ? null : $u->kelasBinaan();
        if ($kelasBoleh !== null && !$kelasBoleh) return collect();
        $nonaktif = Classes::idNonaktif();
        return Student::with('kelas:id_kelas,nama_kelas')
            ->whereNotNull('id_kelas')
            ->when($nonaktif, fn($q) => $q->whereNotIn('id_kelas', $nonaktif))
            ->when($kelasBoleh !== null, fn($q) => $q->whereIn('id_kelas', $kelasBoleh))
            ->when($idKelas, fn($q) => $q->where('id_kelas', $idKelas))
            ->get(['id_siswa', 'nama_siswa', 'id_kelas', 'foto_path', 'foto_diperbarui']);
    }

    private static function alasan(string $kode, string $kategori, int $bobot, string $label, string $detail, ?string $tautan = null): array
    {
        return compact('kode', 'kategori', 'bobot', 'label', 'detail', 'tautan');
    }

    /** Alpa 30 hari terakhir dan penurunan kehadiran 14 hari terakhir dibanding 14 hari sebelumnya. */
    private function presensi(array $id): array
    {
        $mulai = $this->sekarang->copy()->subDays(self::HARI_PRESENSI - 1)->toDateString();
        $tengah = $this->sekarang->copy()->subDays(13)->toDateString();
        $data = TransPresensi::whereIn('id_siswa', $id)->whereBetween('tanggal', [$mulai, $this->hariIni])
            ->get(['id_siswa', 'id_kelas', 'tanggal', 'status_kehadiran'])->groupBy('id_siswa');

        $hasil = [];
        foreach ($data as $idSiswa => $baris) {
            $alpa = $baris->where('status_kehadiran', 'ALPA');
            $hadirPersen = round($baris->where('status_kehadiran', 'HADIR')->count() / max(1, $baris->count()) * 100);
            $alasan = [];
            $tautan = '/dashboard/presensi?' . http_build_query(['kelas' => $baris->first()->id_kelas, 'pembinaan' => 1]);
            if ($alpa->count() >= 5) {
                $alasan[] = self::alasan('alpa-banyak', 'Presensi', 4, "{$alpa->count()} kali alpa", self::HARI_PRESENSI . ' hari terakhir, terakhir ' . self::tgl($alpa->max(fn($p) => $p->tanggal->toDateString())) . '.', $tautan);
            } elseif ($alpa->count() >= 3) {
                $alasan[] = self::alasan('alpa', 'Presensi', 3, "{$alpa->count()} kali alpa", self::HARI_PRESENSI . ' hari terakhir, terakhir ' . self::tgl($alpa->max(fn($p) => $p->tanggal->toDateString())) . '.', $tautan);
            } elseif ($alpa->count() > 0) {
                $alasan[] = self::alasan('alpa-sedikit', 'Presensi', 1, "{$alpa->count()} kali alpa", self::HARI_PRESENSI . ' hari terakhir.', $tautan);
            }

            // Tren: bandingkan persentase hadir dua pekan terakhir dengan dua pekan sebelumnya
            $baru = $baris->filter(fn($p) => $p->tanggal->toDateString() >= $tengah);
            $lama = $baris->filter(fn($p) => $p->tanggal->toDateString() < $tengah);
            if ($baru->count() >= 4 && $lama->count() >= 4) {
                $pBaru = $baru->where('status_kehadiran', 'HADIR')->count() / $baru->count() * 100;
                $pLama = $lama->where('status_kehadiran', 'HADIR')->count() / $lama->count() * 100;
                if ($pLama - $pBaru >= 15) {
                    $alasan[] = self::alasan('hadir-turun', 'Presensi', 2, 'Kehadiran menurun', 'Dua pekan terakhir ' . round($pBaru) . '% hadir, sebelumnya ' . round($pLama) . '%.', $tautan);
                }
            }
            $hasil[$idSiswa] = ['alasan' => $alasan, 'alpa' => $alpa->count(), 'hadir_persen' => $hadirPersen];
        }
        return $hasil;
    }

    /** Mapel dengan rata-rata nilai efektif di bawah KKM, dan nilai terbaru yang turun dibanding sebelumnya. */
    private function nilai(array $id): array
    {
        if (!$this->periode) return [];
        $data = TransNilai::efektif()->with('mapel:id_mapel,nama_mapel,kkm')
            ->where('id_periode', $this->periode)->whereIn('id_siswa', $id)->whereNotNull('nilai')
            ->orderBy('tanggal')->get(['id_nilai', 'id_siswa', 'id_mapel', 'id_kelas', 'tanggal', 'nilai'])->groupBy('id_siswa');

        $hasil = [];
        foreach ($data as $idSiswa => $baris) {
            $alasan = [];
            $bawah = $baris->groupBy('id_mapel')->map(fn($g) => [
                'nama' => $g->first()->mapel?->nama_mapel ?? $g->first()->id_mapel,
                'rata' => round($g->avg(fn($n) => (float) $n->nilai), 1),
                'kkm' => (float) ($g->first()->mapel?->kkm ?? 75),
            ])->filter(fn($m) => $m['rata'] < $m['kkm'])->sortBy('rata')->values();

            if ($bawah->isNotEmpty()) {
                $bobot = $bawah->count() >= 3 ? 4 : ($bawah->count() === 2 ? 3 : 2);
                $alasan[] = self::alasan('bawah-kkm', 'Nilai', $bobot,
                    $bawah->count() === 1 ? "Di bawah KKM: {$bawah[0]['nama']}" : "{$bawah->count()} mapel di bawah KKM",
                    $bawah->take(4)->map(fn($m) => "{$m['nama']} {$m['rata']} (KKM {$m['kkm']})")->implode(', ') . '.',
                    '/dashboard/nilai');
            }

            // Tren: rata-rata 3 nilai terbaru vs rata-rata nilai sebelumnya (minimal 6 nilai)
            if ($baris->count() >= 6) {
                $nilaiUrut = $baris->map(fn($n) => (float) $n->nilai)->values();
                $baru = $nilaiUrut->slice(-3)->avg();
                $lama = $nilaiUrut->slice(0, -3)->avg();
                if ($lama - $baru >= 10) {
                    $alasan[] = self::alasan('nilai-turun', 'Nilai', 2, 'Nilai menurun', 'Rata-rata 3 nilai terbaru ' . round($baru) . ', sebelumnya ' . round($lama) . '.', '/dashboard/nilai');
                }
            }
            $hasil[$idSiswa] = ['alasan' => $alasan, 'mapel_bawah' => $bawah->count(), 'rata' => round($baris->avg(fn($n) => (float) $n->nilai), 1)];
        }
        return $hasil;
    }

    /** Tes online semester aktif untuk kelas siswa yang sudah ditutup, tetapi siswa tidak mengerjakannya. */
    private function tesTerlewat(Collection $siswa): array
    {
        if (!$this->periode) return [];
        $paket = PaketSoal::with('mapel:id_mapel,nama_mapel')->where('online', true)->where('id_periode', $this->periode)
            ->whereIn('id_kelas', $siswa->pluck('id_kelas')->unique())
            ->whereNotNull('online_selesai')->where('online_selesai', '<', now())
            ->get(['id_paket', 'judul', 'id_mapel', 'id_kelas', 'online_selesai']);
        if ($paket->isEmpty()) return [];
        $sudah = PaketSoalJawaban::whereIn('id_paket', $paket->pluck('id_paket'))->whereIn('id_siswa', $siswa->pluck('id_siswa'))
            ->get(['id_paket', 'id_siswa'])->map(fn($j) => "{$j->id_paket}|{$j->id_siswa}")->flip();

        $hasil = [];
        foreach ($siswa as $s) {
            $lewat = $paket->where('id_kelas', $s->id_kelas)->filter(fn($p) => !isset($sudah["{$p->id_paket}|{$s->id_siswa}"]))->values();
            if ($lewat->isEmpty()) continue;
            $hasil[$s->id_siswa] = ['jumlah' => $lewat->count(), 'alasan' => [self::alasan('tes-terlewat', 'Tes', $lewat->count() >= 2 ? 3 : 2,
                "{$lewat->count()} tes online tidak dikerjakan",
                $lewat->take(3)->map(fn($p) => $p->judul . ($p->mapel ? " ({$p->mapel->nama_mapel})" : ''))->implode(', ') . '.',
                '/dashboard/bank-soal')]];
        }
        return $hasil;
    }

    /** Pembinaan kehadiran yang masih berjalan: menambah sedikit poin agar tetap terpantau. */
    private function pembinaan(array $id): array
    {
        $rencana = TransPembinaanPresensi::whereIn('id_siswa', $id)->whereIn('status', ['OTOMATIS', 'BERLANGSUNG'])->get();
        if ($rencana->isEmpty()) return [];
        $status = TransPembinaanPresensi::statusEfektif($rencana, $this->hariIni);
        $hasil = [];
        foreach ($rencana as $r) {
            if (!in_array($status[$r->id_pembinaan]['status'] ?? '', ['BERLANGSUNG', 'DIRENCANAKAN'], true) || isset($hasil[$r->id_siswa])) continue;
            $hasil[$r->id_siswa] = ['alasan' => [self::alasan('pembinaan', 'Pembinaan', 1, 'Pembinaan kehadiran berjalan',
                'Tindak lanjut berikutnya ' . self::tgl($r->tanggal_tindak_lanjut?->toDateString() ?? $this->hariIni) . '.',
                '/dashboard/presensi?' . http_build_query(['kelas' => $r->id_kelas, 'pembinaan' => 1]))]];
        }
        return $hasil;
    }

    /** Catatan jurnal 30 hari terakhir dengan skor Karakter/Skill negatif (isi catatan tidak ditampilkan: bisa sensitif). */
    private function karakter(array $id): array
    {
        $mulai = $this->sekarang->copy()->subDays(self::HARI_PRESENSI - 1)->toDateString();
        $data = TransJurnal::whereIn('id_siswa', $id)->whereBetween('tanggal', [$mulai, $this->hariIni])
            ->where(fn($q) => $q->where('val_K', '<', 0)->orWhere('val_S', '<', 0))
            ->get(['id_siswa', 'tanggal'])->groupBy('id_siswa');
        $hasil = [];
        foreach ($data as $idSiswa => $baris) {
            $n = $baris->count();
            $hasil[$idSiswa] = [self::alasan($n >= 2 ? 'karakter-berulang' : 'karakter', 'Karakter', $n >= 2 ? 3 : 2,
                "{$n} catatan perilaku negatif", self::HARI_PRESENSI . ' hari terakhir di jurnal; perlu pembinaan atau konseling.', '/dashboard/jurnal')];
        }
        return $hasil;
    }

    /** Semester Genap: rata-rata setahun di bawah KKM pada batas mapel kenaikan atau lebih → berisiko tidak naik kelas. */
    private function kenaikan(Collection $siswa): array
    {
        $p = $this->periode ? MasterPeriode::find($this->periode) : null;
        if (!$p || $p->semester !== 'Genap') return [];
        $hasil = [];
        foreach (PantauanKenaikan::hitungSiswa($siswa->pluck('id_siswa')->all(), $p) as $id => $h) {
            if ($h['tingkat'] !== 'TINGGI') continue;
            $hasil[$id] = [self::alasan('risiko-kenaikan', 'Kenaikan', 3, 'Berisiko tidak naik kelas',
                "{$h['mapel_bawah']} mapel di bawah KKM (rata-rata setahun): " . collect($h['mapel'])->where('status', 'BAWAH')->pluck('nama')->take(4)->implode(', ') . '.',
                '/dashboard/pantauan-kenaikan?' . http_build_query(['id_kelas' => $siswa->firstWhere('id_siswa', $id)?->id_kelas, 'siswa' => $id]))];
        }
        return $hasil;
    }

    private static function tgl(string $tgl): string
    {
        return Carbon::parse($tgl)->locale('id')->translatedFormat('j M');
    }
}

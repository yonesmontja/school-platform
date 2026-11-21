<?php

namespace App\Services;

use App\Models\Classes;
use App\Models\MasterPeriode;
use App\Models\Subject;
use App\Models\TransKenaikanPantau;
use App\Models\TransNilai;
use App\Models\TransPresensi;
use Illuminate\Support\Collection;

/**
 * Pantauan kenaikan kelas sepanjang tahun ajaran: aturan usulan kenaikan (KenaikanService::BATAS_MAPEL_BAWAH mapel
 * dengan rata-rata setahun di bawah KKM → Tidak naik) dihitung terus dari nilai yang sudah masuk, supaya wali kelas dan
 * orang tua tahu lebih awal, bukan baru di akhir semester Genap.
 *
 * Rumus rata-rata sama dengan KenaikanService::daftar (semua nilai efektif setahun, remedial dibatasi KKM), sehingga
 * status "Berisiko tinggi" hari ini sama dengan usulan "Tidak naik" bila tahun ajaran berakhir sekarang.
 *
 * Tingkat: TINGGI (≥ batas mapel di bawah KKM), WASPADA (kurang satu dari batas, atau bersama mapel "di tepi" KKM
 * mencapai batas), PANTAU (ada mapel di bawah KKM), AMAN.
 */
class PantauanKenaikan
{
    /** Rata-rata di antara KKM dan KKM + TEPI dianggap "di tepi": tuntas, tetapi mudah turun. */
    public const TEPI = 5;
    public const TINGKAT = ['TINGGI', 'WASPADA', 'PANTAU', 'AMAN'];
    /** Tindak lanjut dianggap masih baru selama sekian hari. */
    public const HARI_TINDAK = 30;

    /** Periode acuan: yang diminta, selain itu semester aktif. */
    public static function periode(?string $idPeriode = null): ?MasterPeriode
    {
        return $idPeriode ? MasterPeriode::find($idPeriode) : MasterPeriode::where('status_aktif', 'AKTIF')->first();
    }

    public static function tingkat(int $bawah, int $tepi): string
    {
        $batas = KenaikanService::BATAS_MAPEL_BAWAH;
        if ($bawah >= $batas) return 'TINGGI';
        if ($bawah >= $batas - 1 || ($bawah > 0 && $bawah + $tepi >= $batas)) return 'WASPADA';
        if ($bawah > 0) return 'PANTAU';
        return 'AMAN';
    }

    /**
     * Hitung pantauan untuk sekumpulan siswa pada tahun ajaran periode acuan.
     * @return array<string, array> id_siswa => hasil
     */
    public static function hitungSiswa(array $ids, MasterPeriode $periode): array
    {
        if (!$ids) return [];
        $periodeTahun = MasterPeriode::where('tahun_ajaran', $periode->tahun_ajaran)->pluck('semester', 'id_periode');
        $mapel = Subject::get(['id_mapel', 'nama_mapel', 'kkm'])->keyBy('id_mapel');
        $nilai = RemedialService::batasiNilai(TransNilai::efektif()->whereIn('id_periode', $periodeTahun->keys())->whereIn('id_siswa', $ids)
            ->get(['id_siswa', 'id_mapel', 'id_periode', 'tipe_nilai', 'nilai']))->groupBy('id_siswa');
        $hadir = TransPresensi::whereIn('id_periode', $periodeTahun->keys())->whereIn('id_siswa', $ids)
            ->selectRaw("id_siswa, count(*) as total, sum(case when status_kehadiran = 'HADIR' then 1 else 0 end) as hadir, sum(case when status_kehadiran = 'ALPA' then 1 else 0 end) as alpa")
            ->groupBy('id_siswa')->toBase()->get()->keyBy('id_siswa');
        $genap = $periode->semester === 'Genap';

        $hasil = [];
        foreach ($ids as $id) {
            $daftar = collect($nilai->get($id, []))->groupBy('id_mapel')->map(function ($g, $m) use ($mapel, $periodeTahun, $genap) {
                $kkm = (float) ($mapel[$m]->kkm ?? 75);
                $angka = $g->map(fn($n) => (float) $n->nilai);
                $ganjil = $g->filter(fn($n) => ($periodeTahun[$n->id_periode] ?? null) === 'Ganjil')->map(fn($n) => (float) $n->nilai);
                $gnp = $g->filter(fn($n) => ($periodeTahun[$n->id_periode] ?? null) === 'Genap')->map(fn($n) => (float) $n->nilai);
                $rata = round($angka->avg(), 1);
                $status = $rata < $kkm ? 'BAWAH' : ($rata < $kkm + self::TEPI ? 'TEPI' : 'TUNTAS');

                // Perkiraan rata-rata yang dibutuhkan pada sisa penilaian tahun ini agar rata-rata setahun mencapai KKM.
                // Sisa penilaian diperkirakan dari banyaknya nilai Ganjil (semester Genap dianggap sebanyak Ganjil).
                $target = null;
                if ($status === 'BAWAH') {
                    $n = $angka->count();
                    $sisa = $genap ? max(1, $ganjil->count() - $gnp->count()) : max(1, $n);
                    $target = (int) ceil(($kkm * ($n + $sisa) - $angka->sum()) / $sisa);
                }
                return [
                    'id_mapel' => $m, 'nama' => $mapel[$m]->nama_mapel ?? $m, 'kkm' => $kkm, 'rata' => $rata,
                    'rata_ganjil' => $ganjil->isEmpty() ? null : round($ganjil->avg(), 1),
                    'rata_genap' => $gnp->isEmpty() ? null : round($gnp->avg(), 1),
                    'jumlah_nilai' => $angka->count(), 'status' => $status, 'selisih' => round($rata - $kkm, 1),
                    'target' => $target, 'sulit' => $target !== null && $target > 100,
                ];
            })->sortBy([fn($a, $b) => $a['selisih'] <=> $b['selisih']])->values();

            $bawah = $daftar->where('status', 'BAWAH')->count();
            $tepi = $daftar->where('status', 'TEPI')->count();
            $h = $hadir->get($id);
            $hasil[$id] = [
                'tingkat' => self::tingkat($bawah, $tepi),
                'mapel_bawah' => $bawah,
                'mapel_tepi' => $tepi,
                'mapel_sulit' => $daftar->where('sulit', true)->count(),
                'rata_rata' => $daftar->isEmpty() ? null : round($daftar->avg('rata'), 1),
                'persen_hadir' => $h && $h->total ? (int) round($h->hadir / $h->total * 100) : null,
                'alpa' => (int) ($h->alpa ?? 0),
                'mapel' => $daftar->all(),
            ];
        }
        return $hasil;
    }

    /** Pantauan satu rombel (anggota pada periode acuan) beserta tindak lanjut tahun ajaran ini. */
    public static function kelas(Classes $kelas, MasterPeriode $periode): Collection
    {
        $siswa = RiwayatRombel::anggota($kelas->id_kelas, $periode->id_periode)->orderBy('nama_siswa')
            ->get(['id_siswa', 'nisn', 'nama_siswa', 'jenis_kelamin', 'foto_path', 'foto_diperbarui']);
        $hitung = self::hitungSiswa($siswa->pluck('id_siswa')->all(), $periode);
        $tindak = self::tindakLanjut($siswa->pluck('id_siswa')->all(), $periode->tahun_ajaran);
        $baru = now()->subDays(self::HARI_TINDAK);
        $urut = array_flip(self::TINGKAT);

        return $siswa->map(function ($s) use ($hitung, $tindak, $baru) {
            $t = $tindak->get($s->id_siswa, collect());
            $h = $hitung[$s->id_siswa];
            return [
                'id_siswa' => $s->id_siswa, 'nisn' => $s->nisn, 'nama_siswa' => $s->nama_siswa, 'jenis_kelamin' => $s->jenis_kelamin,
                'foto_url' => $s->foto_url,
            ] + $h + [
                'tindak_lanjut' => $t->map(fn($x) => self::barisTindak($x))->values()->all(),
                'dikabarkan_ortu' => $t->contains('jenis', 'KABARI_ORTU'),
                'perlu_tindak' => in_array($h['tingkat'], ['TINGGI', 'WASPADA'], true) && !$t->contains(fn($x) => $x->created_at->gte($baru)),
            ];
        })->sortBy([fn($a, $b) => $urut[$a['tingkat']] <=> $urut[$b['tingkat']], fn($a, $b) => $b['mapel_bawah'] <=> $a['mapel_bawah'],
            fn($a, $b) => strcmp($a['nama_siswa'], $b['nama_siswa'])])->values();
    }

    /** Jumlah siswa per tingkat untuk setiap rombel (ringkasan kepala sekolah/admin). */
    public static function ringkasanSekolah(MasterPeriode $periode, Collection $kelas): Collection
    {
        $anggota = $kelas->mapWithKeys(fn($k) => [$k->id_kelas => RiwayatRombel::anggota($k->id_kelas, $periode->id_periode)->pluck('id_siswa')->all()]);
        $hitung = self::hitungSiswa($anggota->flatten()->unique()->values()->all(), $periode);
        return $kelas->map(function ($k) use ($anggota, $hitung) {
            $per = collect($anggota[$k->id_kelas])->map(fn($id) => $hitung[$id]['tingkat'] ?? 'AMAN')->countBy();
            return ['id_kelas' => $k->id_kelas, 'nama_kelas' => $k->nama_kelas, 'siswa' => count($anggota[$k->id_kelas])]
                + collect(self::TINGKAT)->mapWithKeys(fn($t) => [strtolower($t) => (int) ($per[$t] ?? 0)])->all();
        })->values();
    }

    /** @return Collection<string, Collection<TransKenaikanPantau>> per id_siswa, terbaru dulu */
    public static function tindakLanjut(array $ids, string $tahunAjaran): Collection
    {
        return TransKenaikanPantau::with('pembuat:id,name,id_guru')->where('tahun_ajaran', $tahunAjaran)->whereIn('id_siswa', $ids)
            ->orderByDesc('created_at')->orderByDesc('id')->get()->groupBy('id_siswa');
    }

    public static function barisTindak(TransKenaikanPantau $x): array
    {
        return [
            'id' => $x->id, 'jenis' => $x->jenis, 'catatan' => $x->catatan, 'pada' => $x->created_at?->toIso8601String(),
            'pembuat' => $x->pembuat ? ['name' => $x->pembuat->name, 'id_guru' => $x->pembuat->id_guru] : null,
        ];
    }
}

<?php

namespace App\Services;

use App\Models\Classes;
use App\Models\MasterPeriode;
use App\Models\Student;
use App\Models\Subject;
use App\Models\TransKenaikan;
use App\Models\TransNilai;
use App\Models\TransPresensi;
use Illuminate\Support\Collection;

/**
 * Kenaikan kelas akhir tahun: usulan otomatis dari data setahun (ketuntasan mapel & kehadiran),
 * keputusan wali kelas yang disahkan kepala sekolah, dan penerapannya saat tahun ajaran berganti.
 */
class KenaikanService
{
    /** Mapel di bawah KKM sebanyak ini (rata-rata setahun) membuat usulan menjadi Tidak naik. */
    public const BATAS_MAPEL_BAWAH = 3;

    /** Tingkat tertinggi di sekolah (kelas terakhir sebelum lulus). */
    public static function tingkatAkhir(): int
    {
        return (int) (Classes::max('tingkat') ?: 6);
    }

    /** Semester Genap yang dipakai untuk kenaikan: semester aktif bila Genap, selain itu Genap terakhir. */
    public static function periodeKenaikan(?string $idPeriode = null): ?MasterPeriode
    {
        if ($idPeriode) return MasterPeriode::find($idPeriode);
        $aktif = MasterPeriode::where('status_aktif', 'AKTIF')->first();
        if ($aktif?->semester === 'Genap') return $aktif;
        return MasterPeriode::where('semester', 'Genap')->orderByDesc('tahun_ajaran')->first();
    }

    /**
     * Usulan per siswa satu rombel, beserta keputusan yang sudah tersimpan.
     * @return Collection<int, array>
     */
    public static function daftar(Classes $kelas, MasterPeriode $periode): Collection
    {
        $siswa = RiwayatRombel::anggota($kelas->id_kelas, $periode->id_periode)->orderBy('nama_siswa')->get(['id_siswa', 'nisn', 'nama_siswa', 'jenis_kelamin']);
        $ids = $siswa->pluck('id_siswa');
        $periodeTahun = MasterPeriode::where('tahun_ajaran', $periode->tahun_ajaran)->pluck('id_periode');
        $mapel = Subject::get(['id_mapel', 'nama_mapel', 'kkm'])->keyBy('id_mapel');

        $nilai = RemedialService::batasiNilai(TransNilai::efektif()->whereIn('id_periode', $periodeTahun)->whereIn('id_siswa', $ids)
            ->get(['id_siswa', 'id_mapel', 'tipe_nilai', 'nilai']))->groupBy('id_siswa');
        $alpa = TransPresensi::whereIn('id_periode', $periodeTahun)->whereIn('id_siswa', $ids)->where('status_kehadiran', 'ALPA')
            ->selectRaw('id_siswa, count(*) as n')->groupBy('id_siswa')->pluck('n', 'id_siswa');
        $hadir = TransPresensi::whereIn('id_periode', $periodeTahun)->whereIn('id_siswa', $ids)
            ->selectRaw("id_siswa, count(*) as total, sum(case when status_kehadiran = 'HADIR' then 1 else 0 end) as hadir")->groupBy('id_siswa')->get()->keyBy('id_siswa');
        $tersimpan = TransKenaikan::with('pengisi:id,name,id_guru', 'pengesah:id,name')
            ->where('id_periode', $periode->id_periode)->whereIn('id_siswa', $ids)->get()->keyBy('id_siswa');

        $tingkat = (int) ($kelas->tingkat ?: RiwayatRombel::tingkatDariNama($kelas->nama_kelas) ?: 0);
        $akhir = self::tingkatAkhir();

        return $siswa->map(function ($s) use ($nilai, $mapel, $alpa, $hadir, $tersimpan, $tingkat, $akhir) {
            $rata = collect($nilai->get($s->id_siswa, []))->groupBy('id_mapel')
                ->map(fn($g, $m) => ['id_mapel' => $m, 'nama' => $mapel[$m]->nama_mapel ?? $m, 'kkm' => (float) ($mapel[$m]->kkm ?? 75), 'rata' => round($g->avg(fn($n) => (float) $n->nilai), 1)]);
            $bawah = $rata->filter(fn($r) => $r['rata'] < $r['kkm'])->values();
            $h = $hadir->get($s->id_siswa);
            $persenHadir = $h && $h->total ? round($h->hadir / $h->total * 100) : null;

            $alasan = [];
            if ($bawah->isNotEmpty()) $alasan[] = $bawah->count() . ' mapel di bawah KKM: ' . $bawah->pluck('nama')->implode(', ');
            if ($rata->isEmpty()) $alasan[] = 'Belum ada nilai tahun ini';
            if ($persenHadir !== null) $alasan[] = "Kehadiran {$persenHadir}%" . (($alpa[$s->id_siswa] ?? 0) ? ', alpa ' . $alpa[$s->id_siswa] . ' hari' : '');

            $usulan = $bawah->count() >= self::BATAS_MAPEL_BAWAH ? 'TIDAK_NAIK' : ($tingkat && $tingkat >= $akhir ? 'LULUS' : 'NAIK');
            $k = $tersimpan->get($s->id_siswa);
            return [
                'id_siswa' => $s->id_siswa, 'nisn' => $s->nisn, 'nama_siswa' => $s->nama_siswa, 'jenis_kelamin' => $s->jenis_kelamin,
                'tingkat' => $tingkat ?: null,
                'usulan' => ['keputusan' => $usulan, 'ke_tingkat' => self::keTingkat($usulan, $tingkat), 'alasan' => $alasan,
                    'mapel_bawah' => $bawah->count(), 'rata_rata' => $rata->isEmpty() ? null : round($rata->avg('rata'), 1), 'persen_hadir' => $persenHadir],
                'keputusan' => $k ? $k->only(['keputusan', 'ke_tingkat', 'alasan', 'disahkan', 'disahkan_pada', 'diterapkan_pada']) + [
                    'pengisi' => $k->pengisi?->name, 'pengesah' => $k->pengesah?->name] : null,
            ];
        });
    }

    public static function keTingkat(string $keputusan, int $tingkat): ?int
    {
        if (!$tingkat) return null;
        return match ($keputusan) { 'NAIK' => $tingkat + 1, 'TIDAK_NAIK' => $tingkat, default => null };
    }

    /**
     * Terapkan keputusan yang sudah disahkan (dipanggil setelah semester aktif pindah ke Ganjil tahun ajaran baru):
     * LULUS → status lulus (dilepas dari rombel); NAIK → langsung ke rombel tingkat berikutnya bila hanya ada satu,
     * selain itu menunggu pemetaan rombel; TIDAK_NAIK → tetap di rombelnya.
     *
     * @return array{naik: int, langsung: int, menunggu: int, tinggal: int, lulus: int}
     */
    public static function terapkan(MasterPeriode $genap): array
    {
        $hasil = ['naik' => 0, 'langsung' => 0, 'menunggu' => 0, 'tinggal' => 0, 'lulus' => 0];
        $rombelPerTingkat = Classes::aktifSemester()->whereNotNull('tingkat')->get(['id_kelas', 'tingkat'])->groupBy('tingkat');

        TransKenaikan::where('id_periode', $genap->id_periode)->where('disahkan', true)->whereNull('diterapkan_pada')
            ->with('siswa')->get()->each(function (TransKenaikan $k) use (&$hasil, $rombelPerTingkat, $genap) {
                $s = $k->siswa;
                if (!$s || $s->status_siswa !== 'aktif') return;
                if ($k->keputusan === 'LULUS') {
                    $s->forceFill(['status_siswa' => 'lulus', 'keterangan_status' => "Lulus tahun ajaran {$genap->tahun_ajaran}", 'tingkat_tunggu' => null])->save();
                    $hasil['lulus']++;
                } elseif ($k->keputusan === 'NAIK' && $k->ke_tingkat) {
                    $tujuan = $rombelPerTingkat->get($k->ke_tingkat, collect());
                    $hasil['naik']++;
                    if ($tujuan->count() === 1) {
                        $s->forceFill(['id_kelas' => $tujuan->first()->id_kelas, 'tingkat_tunggu' => null])->save();
                        $hasil['langsung']++;
                    } else {
                        $s->forceFill(['id_kelas' => null, 'tingkat_tunggu' => $k->ke_tingkat])->save();
                        $hasil['menunggu']++;
                    }
                } else {
                    $hasil['tinggal']++;
                }
                $k->forceFill(['diterapkan_pada' => now()])->saveQuietly();
            });
        return $hasil;
    }

    /** Ringkasan kesiapan kenaikan per rombel (untuk Tutup Semester & notifikasi). */
    public static function ringkasan(MasterPeriode $genap): Collection
    {
        $kelas = Classes::aktifSemester($genap->id_periode)->orderBy('nama_kelas')->get(['id_kelas', 'nama_kelas', 'tingkat', 'wali_kelas']);
        $simpan = TransKenaikan::where('id_periode', $genap->id_periode)->get(['id_siswa', 'id_kelas', 'disahkan'])->keyBy('id_siswa');
        return $kelas->map(function ($k) use ($genap, $simpan) {
            $ids = RiwayatRombel::anggota($k->id_kelas, $genap->id_periode)->pluck('id_siswa');
            $ada = $ids->filter(fn($i) => $simpan->has($i));
            return ['id_kelas' => $k->id_kelas, 'nama_kelas' => $k->nama_kelas, 'wali_kelas' => $k->wali_kelas, 'siswa' => $ids->count(),
                'terisi' => $ada->count(), 'disahkan' => $ada->filter(fn($i) => $simpan[$i]->disahkan)->count()];
        });
    }

    /** Siswa aktif yang menunggu dipetakan ke rombel (naik kelas tetapi rombel tingkatnya lebih dari satu). */
    public static function jumlahMenunggu(): int
    {
        return Student::where('status_siswa', 'aktif')->whereNull('id_kelas')->whereNotNull('tingkat_tunggu')->count();
    }
}

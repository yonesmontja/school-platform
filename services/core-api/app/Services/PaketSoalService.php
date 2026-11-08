<?php

namespace App\Services;

use App\Models\BankSoal;
use App\Models\PaketSoal;
use App\Models\PaketSoalButir;
use App\Models\PaketSoalJawaban;
use Illuminate\Support\Collection;

/**
 * Penilaian dan analisis paket soal.
 *
 * Jawaban per bentuk (kunci jawaban: id butir):
 * - PG           indeks pilihan (int) atau null      → otomatis
 * - PG_KOMPLEKS  [indeks, ...]                       → otomatis, sebagian: (benar dipilih − salah dipilih) / jumlah kunci
 * - BENAR_SALAH  [true/false/null, ...]              → otomatis, sebanding pernyataan yang benar
 * - ISIAN        teks                                → otomatis bila cocok salah satu jawaban yang diterima
 * - LENGKAPI_GAMBAR [teks per bagian, ...]           → otomatis, sebanding bagian yang cocok
 * - MENJODOHKAN  online: [indeks pasangan kanan untuk tiap kiri]   → otomatis, sebanding pasangan benar
 * - MENGURUTKAN  online: [indeks langkah dalam urutan pilihan siswa] → otomatis, sebanding posisi benar
 *                kertas: teks catatan → skor diisi guru
 * - URAIAN                                           → skor diisi guru (jawaban boleh berupa catatan/transkrip)
 * - MEMBACA_NYARING online: url rekaman /storage/rekaman/… (hanya dari unggahan siswa); kertas: catatan → skor diisi guru
 * Skor yang ditetapkan guru selalu menggantikan skor otomatis.
 */
class PaketSoalService
{
    // Bentuk yang selalu dinilai otomatis (juga di koreksi kertas)
    public const OTOMATIS = ['PG', 'PG_KOMPLEKS', 'BENAR_SALAH', 'ISIAN', 'LENGKAPI_GAMBAR'];

    /** Bersihkan jawaban sesuai bentuk soal. */
    public static function normalisasiJawaban(array $soal, mixed $jawaban): mixed
    {
        $isi = $soal['isi'] ?? [];
        switch ($soal['bentuk']) {
            case 'PG':
                return is_numeric($jawaban) && isset($isi['pilihan'][(int) $jawaban]) ? (int) $jawaban : null;
            case 'PG_KOMPLEKS':
                $j = array_values(array_unique(array_map('intval', array_filter((array) $jawaban, 'is_numeric'))));
                $j = array_values(array_filter($j, fn($i) => isset($isi['pilihan'][$i])));
                sort($j);
                return $j;
            case 'BENAR_SALAH':
                $n = count($isi['pernyataan'] ?? []);
                $j = array_values((array) $jawaban);
                $hasil = [];
                for ($i = 0; $i < $n; $i++) {
                    $v = $j[$i] ?? null;
                    $hasil[] = $v === null || $v === '' ? null : filter_var($v, FILTER_VALIDATE_BOOLEAN);
                }
                return $hasil;
            case 'LENGKAPI_GAMBAR':
                $n = count($soal['kunci']['jawaban'] ?? []);
                $j = is_array($jawaban) ? array_values($jawaban) : [];
                $hasil = [];
                for ($i = 0; $i < $n; $i++) {
                    $t = trim((string) (is_scalar($j[$i] ?? null) ? $j[$i] : ''));
                    $hasil[] = $t === '' ? null : mb_substr($t, 0, 200);
                }
                return $hasil;
            case 'MENJODOHKAN':
            case 'MENGURUTKAN':
                // Online: daftar indeks; kertas: catatan teks
                if (is_array($jawaban)) {
                    $n = count($soal['isi'][$soal['bentuk'] === 'MENJODOHKAN' ? 'pasangan' : 'urutan'] ?? []);
                    return array_map(fn($v) => is_numeric($v) && (int) $v >= 0 && (int) $v < $n ? (int) $v : null, array_slice(array_values($jawaban), 0, $n));
                }
                $t = trim((string) (is_scalar($jawaban) ? $jawaban : ''));
                return $t === '' ? null : mb_substr($t, 0, 5000);
            default:
                $t = trim((string) (is_scalar($jawaban) ? $jawaban : ''));
                return $t === '' ? null : mb_substr($t, 0, 5000);
        }
    }

    /** Ubah jawaban tertulis (mis. "B", "AC", "BSB") menjadi bentuk simpanan; dipakai untuk hasil baca foto. */
    public static function dariTeks(array $soal, mixed $teks): mixed
    {
        if ($teks === null || (is_string($teks) && trim($teks) === '')) return self::normalisasiJawaban($soal, null);
        $t = mb_strtoupper(trim((string) (is_scalar($teks) ? $teks : json_encode($teks))));
        $huruf = fn($s) => preg_match_all('/[A-H]/', $s, $m) ? array_map(fn($c) => ord($c) - 65, $m[0]) : [];
        return match ($soal['bentuk']) {
            'PG' => self::normalisasiJawaban($soal, $huruf($t)[0] ?? null),
            'PG_KOMPLEKS' => self::normalisasiJawaban($soal, $huruf($t)),
            'BENAR_SALAH' => self::normalisasiJawaban($soal, array_map(
                fn($c) => in_array($c, ['B', 'T'], true) ? true : (in_array($c, ['S', 'F'], true) ? false : null),
                preg_match_all('/./', preg_replace('/BENAR/', 'B', preg_replace('/SALAH/', 'S', preg_replace('/[^A-Z?]/', '', $t))), $m) ? $m[0] : []
            )),
            'LENGKAPI_GAMBAR' => self::normalisasiJawaban($soal, preg_split('/\s*[;
]\s*|\s*,\s*/u', trim((string) $teks))),
            default => self::normalisasiJawaban($soal, (string) $teks),
        };
    }

    /** Skor otomatis satu butir; null bila bentuknya dinilai guru. */
    public static function skorOtomatis(array $soal, mixed $jawaban, int $maks): ?float
    {
        $kunci = $soal['kunci']['jawaban'] ?? null;
        switch ($soal['bentuk']) {
            case 'PG':
                return $jawaban !== null && (int) $jawaban === (int) $kunci ? (float) $maks : 0.0;
            case 'PG_KOMPLEKS':
                $k = (array) $kunci;
                if (!$k) return 0.0;
                $dipilih = (array) $jawaban;
                $benar = count(array_intersect($dipilih, $k));
                $salah = count(array_diff($dipilih, $k));
                return round(max(0, $benar - $salah) / count($k) * $maks, 2);
            case 'BENAR_SALAH':
                $k = array_values((array) $kunci);
                if (!$k) return 0.0;
                $j = array_values((array) $jawaban);
                $cocok = 0;
                foreach ($k as $i => $v) if (isset($j[$i]) && $j[$i] !== null && (bool) $j[$i] === (bool) $v) $cocok++;
                return round($cocok / count($k) * $maks, 2);
            case 'ISIAN':
                if ($jawaban === null) return 0.0;
                $j = self::ratakan((string) $jawaban);
                foreach ((array) $kunci as $terima) if (self::ratakan((string) $terima) === $j) return (float) $maks;
                return 0.0;
            case 'LENGKAPI_GAMBAR':
                $k = array_values((array) $kunci);
                if (!$k) return 0.0;
                $j = array_values((array) $jawaban);
                $cocok = 0;
                foreach ($k as $i => $terima) {
                    if (!isset($j[$i]) || $j[$i] === null) continue;
                    $t = self::ratakan((string) $j[$i]);
                    foreach ((array) $terima as $x) if (self::ratakan((string) $x) === $t) { $cocok++; break; }
                }
                return round($cocok / count($k) * $maks, 2);
            case 'MENJODOHKAN':
            case 'MENGURUTKAN':
                if (!is_array($jawaban)) return null; // kertas: dinilai guru
                $n = count($soal['isi'][$soal['bentuk'] === 'MENJODOHKAN' ? 'pasangan' : 'urutan'] ?? []);
                if (!$n) return 0.0;
                $benar = 0;
                // Menjodohkan: kiri ke-i dipasangkan dengan kanan ke-i; mengurutkan: posisi ke-i berisi langkah ke-i
                foreach (array_values($jawaban) as $i => $v) if ($v !== null && (int) $v === $i) $benar++;
                return round($benar / $n * $maks, 2);
        }
        return null;
    }

    /** Samakan penulisan jawaban isian: huruf kecil, spasi tunggal, tanpa titik akhir, koma desimal = titik. */
    private static function ratakan(string $t): string
    {
        $t = mb_strtolower(trim(preg_replace('/\s+/u', ' ', $t)));
        $t = rtrim($t, '.');
        if (preg_match('/^-?\d+(,\d+)?$/', $t)) $t = str_replace(',', '.', $t);
        return $t;
    }

    /**
     * Hitung ulang skor akhir, total, nilai, dan kelengkapan satu jawaban.
     * @param Collection<PaketSoalButir> $butir
     */
    public static function hitung(PaketSoalJawaban $jwb, Collection $butir): void
    {
        $jawaban = $jwb->jawaban ?? [];
        $manual = $jwb->skor_manual ?? [];
        $skor = [];
        $total = 0;
        $maks = 0;
        $lengkap = true;
        foreach ($butir as $b) {
            $maks += $b->skor_maks;
            $id = (string) $b->id;
            if (isset($manual[$id]) && is_numeric($manual[$id])) {
                $s = min(max((float) $manual[$id], 0), $b->skor_maks);
            } else {
                $s = self::skorOtomatis($b->soal, $jawaban[$id] ?? null, $b->skor_maks);
                // Tes online: menjodohkan/mengurutkan yang tidak dijawab bernilai 0 (di kertas, guru yang menilai)
                if ($s === null && $jwb->sumber === 'ONLINE' && in_array($b->soal['bentuk'], ['MENJODOHKAN', 'MENGURUTKAN'], true)) $s = 0.0;
            }
            if ($s === null) { $lengkap = false; continue; }
            $skor[$id] = round($s, 2);
            $total += $s;
        }
        $jwb->skor = $skor;
        $jwb->total = round($total, 2);
        $jwb->nilai = $maks > 0 ? round($total / $maks * 100, 2) : 0;
        $jwb->lengkap = $lengkap && $butir->isNotEmpty();
    }

    /**
     * Nilai per materi untuk Input Nilai: {id_materi: {id_siswa: {nilai, nilai_indikator}}}.
     * Materi yang semua butirnya ber-TP dikirim sebagai nilai per TP (nilai materi = rata-ratanya);
     * bila ada butir tanpa TP, dikirim sebagai satu nilai materi. Butir tanpa materi tidak dikirim.
     */
    public static function nilaiPerMateri(Collection $butir, Collection $jawaban): array
    {
        $hasil = [];
        foreach ($butir->groupBy(fn($b) => $b->soal['id_materi'] ?? '') as $idMateri => $kelompok) {
            if ($idMateri === '') continue;
            $perTp = $kelompok->every(fn($b) => !empty($b->soal['id_indikator']));
            foreach ($jawaban as $j) {
                $persen = function (Collection $bs) use ($j) {
                    $maks = $bs->sum('skor_maks');
                    return $maks > 0 ? round($bs->sum(fn($b) => (float) ($j->skor[(string) $b->id] ?? 0)) / $maks * 100, 2) : 0;
                };
                $hasil[$idMateri][$j->id_siswa] = $perTp
                    ? ['nilai_indikator' => $kelompok->groupBy(fn($b) => $b->soal['id_indikator'])->map($persen)->all()]
                    : ['nilai' => $persen($kelompok)];
            }
        }
        return $hasil;
    }

    /**
     * Analisis butir klasik untuk jawaban yang sudah lengkap dinilai:
     * tingkat kesukaran (p), daya beda (D, kelompok atas & bawah 27%), sebaran pilihan PG,
     * reliabilitas (Cronbach alpha), capaian per TP, dan profil STNKM.
     */
    public static function analisis(PaketSoal $paket, float $kkm): array
    {
        $butir = $paket->butir;
        $jawaban = $paket->jawaban->filter(fn($j) => $j->lengkap && !$j->sedangDikerjakan())->values();
        $n = $jawaban->count();
        $skorButir = fn($j, $b) => (float) ($j->skor[(string) $b->id] ?? 0);

        // Kelompok atas & bawah berdasarkan total skor
        $urut = $jawaban->sortByDesc('total')->values();
        $g = $n >= 4 ? max(1, (int) round($n * 0.27)) : 0;
        $atas = $urut->take($g);
        $bawah = $urut->reverse()->take($g);

        $hasilButir = $butir->values()->map(function ($b, $i) use ($jawaban, $n, $g, $atas, $bawah, $skorButir) {
            $soal = $b->soal;
            $maks = max(1, $b->skor_maks);
            $rata = $n ? $jawaban->avg(fn($j) => $skorButir($j, $b)) : null;
            $p = $rata !== null ? round($rata / $maks, 2) : null;
            $d = $g ? round(($atas->avg(fn($j) => $skorButir($j, $b)) - $bawah->avg(fn($j) => $skorButir($j, $b))) / $maks, 2) : null;

            $sebaran = null;
            if ($soal['bentuk'] === 'PG' && $n) {
                $sebaran = array_fill(0, count($soal['isi']['pilihan'] ?? []), 0);
                $kosong = 0;
                foreach ($jawaban as $j) {
                    $v = $j->jawaban[(string) $b->id] ?? null;
                    if ($v === null || !isset($sebaran[(int) $v])) $kosong++; else $sebaran[(int) $v]++;
                }
                $kunci = (int) ($soal['kunci']['jawaban'] ?? -1);
                // Pengecoh berfungsi bila dipilih minimal 5% siswa
                $lemah = collect($sebaran)->filter(fn($c, $k) => $k !== $kunci && $c < max(1, $n * 0.05))->keys()->values()->all();
                $sebaran = ['pilihan' => $sebaran, 'kosong' => $kosong, 'kunci' => $kunci, 'pengecoh_lemah' => $lemah];
            }

            return [
                'id' => $b->id,
                'nomor' => $i + 1,
                'id_soal' => $b->id_soal,
                'bentuk' => $soal['bentuk'],
                'pertanyaan' => mb_substr($soal['pertanyaan'] ?? '', 0, 160),
                'tp' => $soal['indikator']['deskripsi'] ?? null,
                'level_kognitif' => $soal['level_kognitif'] ?? null,
                'skor_maks' => $b->skor_maks,
                'rata' => $rata !== null ? round($rata, 2) : null,
                'p' => $p,
                'kesukaran' => $p === null ? null : ($p > 0.7 ? 'MUDAH' : ($p >= 0.3 ? 'SEDANG' : 'SUKAR')),
                'd' => $d,
                'daya_beda' => $d === null ? null : ($d >= 0.4 ? 'BAIK_SEKALI' : ($d >= 0.3 ? 'BAIK' : ($d >= 0.2 ? 'CUKUP' : 'JELEK'))),
                'saran' => self::saranButir($p, $d, $sebaran),
                'sebaran' => $sebaran,
            ];
        })->all();

        // Reliabilitas: Cronbach alpha
        $k = $butir->count();
        $alpha = null;
        if ($n >= 2 && $k >= 2) {
            $varians = function (array $xs) {
                $m = array_sum($xs) / count($xs);
                return array_sum(array_map(fn($x) => ($x - $m) ** 2, $xs)) / (count($xs) - 1);
            };
            $sumVar = $butir->sum(fn($b) => $varians($jawaban->map(fn($j) => $skorButir($j, $b))->all()));
            $varTotal = $varians($jawaban->pluck('total')->map(fn($t) => (float) $t)->all());
            if ($varTotal > 0) $alpha = round($k / ($k - 1) * (1 - $sumVar / $varTotal), 2);
        }

        // Capaian per TP
        $perTp = $butir->groupBy(fn($b) => $b->soal['id_indikator'] ?? '')->map(function ($bs, $idTp) use ($jawaban, $n, $kkm, $skorButir) {
            $maks = $bs->sum('skor_maks');
            $persen = $jawaban->map(fn($j) => $maks ? $bs->sum(fn($b) => $skorButir($j, $b)) / $maks * 100 : 0);
            $contoh = $bs->first()->soal;
            return [
                'id_indikator' => $idTp ?: null,
                'tp' => $contoh['indikator']['deskripsi'] ?? null,
                'materi' => $contoh['materi']['nama_materi'] ?? null,
                'jumlah_butir' => $bs->count(),
                'rata' => $n ? round($persen->avg(), 1) : null,
                'tuntas' => $n ? $persen->filter(fn($x) => $x >= $kkm)->count() : 0,
            ];
        })->values()->all();

        // Profil STNKM: capaian tertimbang bobot dimensi tiap butir
        $profil = fn($j) => collect(BankSoal::DIMENSI)->mapWithKeys(function ($d) use ($butir, $j, $skorButir) {
            $bobot = $butir->sum(fn($b) => (float) ($b->soal["dim_{$d}"] ?? 0));
            if ($bobot <= 0) return [$d => null];
            $capai = $butir->sum(fn($b) => (float) ($b->soal["dim_{$d}"] ?? 0) * $skorButir($j, $b) / max(1, $b->skor_maks));
            return [$d => round($capai / $bobot * 100, 1)];
        })->all();
        $profilSiswa = $jawaban->mapWithKeys(fn($j) => [$j->id_siswa => $profil($j)]);
        $stnkm = collect(BankSoal::DIMENSI)->mapWithKeys(fn($d) => [$d => $n && $profilSiswa->first()[$d] !== null
            ? round($profilSiswa->avg(fn($p) => $p[$d]), 1) : null])->all();

        return [
            'jumlah_siswa' => $n,
            'belum_lengkap' => $paket->jawaban->filter(fn($j) => !$j->lengkap && !$j->sedangDikerjakan())->count(),
            'sedang_mengerjakan' => $paket->jawaban->filter(fn($j) => $j->sedangDikerjakan())->count(),
            'kkm' => $kkm,
            'rata_nilai' => $n ? round($jawaban->avg('nilai'), 1) : null,
            'tertinggi' => $n ? (float) $jawaban->max('nilai') : null,
            'terendah' => $n ? (float) $jawaban->min('nilai') : null,
            'tuntas' => $jawaban->filter(fn($j) => $j->nilai >= $kkm)->count(),
            'reliabilitas' => $alpha,
            'butir' => $hasilButir,
            'per_tp' => $perTp,
            'stnkm' => $stnkm,
            'siswa' => $urut->map(fn($j) => [
                'id_siswa' => $j->id_siswa, 'nama_siswa' => $j->siswa?->nama_siswa, 'total' => $j->total, 'nilai' => $j->nilai,
                'stnkm' => $profilSiswa[$j->id_siswa],
            ])->values()->all(),
        ];
    }

    private static function saranButir(?float $p, ?float $d, ?array $sebaran): ?string
    {
        if ($p === null) return null;
        if ($d !== null && $d < 0) return 'Periksa kunci: siswa kelompok bawah lebih banyak menjawab benar.';
        if ($d !== null && $d < 0.2) return 'Daya beda rendah: perbaiki atau ganti soal.';
        if ($p > 0.9) return 'Terlalu mudah: hampir semua siswa benar.';
        if ($p < 0.2) return 'Terlalu sukar: periksa materi, bahasa soal, atau kuncinya.';
        if ($sebaran && $sebaran['pengecoh_lemah']) return 'Ganti pengecoh yang tidak dipilih siswa.';
        return 'Baik, layak disimpan.';
    }
}

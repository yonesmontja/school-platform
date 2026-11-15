<?php

namespace App\Services;

use App\Models\DokumenRujukan;
use Illuminate\Support\Facades\DB;

/**
 * Mencari bagian CP satu mata pelajaran di dokumen Pustaka (mis. Kepka BSKAP yang memuat CP semua mapel & jenjang).
 * Dokumen dipecah menurut judul "CAPAIAN PEMBELAJARAN <MAPEL>"; bila tidak ada judul seperti itu, dipakai jendela
 * potongan yang paling sering menyebut nama mapel.
 */
class CpDariDokumen
{
    public const MAKS_KARAKTER = 50000;
    private const SINGKATAN = [
        '~\bpjok\b~u' => 'jasmani olahraga kesehatan', '~\bppkn\b|\bpkn\b~u' => 'pancasila', '~\bipas\b~u' => 'ilmu pengetahuan alam sosial',
        '~\bipa\b~u' => 'ilmu pengetahuan alam', '~\bips\b~u' => 'ilmu pengetahuan sosial', '~\benglish\b~u' => 'bahasa inggris',
        '~\bsbdp\b~u' => 'seni', '~\bpai\b~u' => 'agama islam', '~\bmtk\b~u' => 'matematika', '~\bb\.?\s*(indonesia|inggris)\b~u' => 'bahasa $1',
    ];
    private const KATA_ABAIKAN = ['dan', 'budi', 'pekerti', 'pendidikan', 'untuk', 'pada', 'sd', 'mi', 'kelas', 'muatan', 'lokal', 'mapel'];

    /** @return array<int, array{dari:int, sampai:int, judul:string, karakter:int}> bagian per judul, urut dokumen */
    public static function daftarBagian(DokumenRujukan $d): array
    {
        $potongan = self::potongan($d);
        $awal = [];
        foreach ($potongan as $p) {
            preg_match_all('~CAPAIAN PEMBELAJARAN\s+((?:[A-Z(),/&\-]+[ \t]*){1,10})(?:\n[ \t]*(?!CAPAIAN)([A-Z(),/&\- ]{3,40})(?=\n|$))?~u', $p->teks, $semua, PREG_SET_ORDER);
            foreach ($semua as $m) {
                $lanjut = isset($m[2]) && preg_match('~^[A-Z ]+$~u', trim($m[2])) && mb_strlen(trim($m[2])) <= 20 ? ' ' . $m[2] : '';
                $judul = trim(preg_replace('~\s+~u', ' ', $m[1] . $lanjut));
                // judul umum dokumen/lampiran, bukan judul mapel
                if (preg_match('~^(PADA|UNTUK|FASE|PAUD|DI AKHIR)\b~u', $judul)) continue;
                $awal[] = ['dari' => (int) $p->urutan, 'judul' => self::rapiJudul($judul)];
                break;
            }
        }
        $akhir = $potongan->isEmpty() ? -1 : (int) $potongan->last()->urutan;
        $panjang = $potongan->mapWithKeys(fn($p) => [(int) $p->urutan => mb_strlen($p->teks)]);
        $bagian = [];
        foreach ($awal as $i => $a) {
            $sampai = isset($awal[$i + 1]) ? $awal[$i + 1]['dari'] - 1 : $akhir;
            if ($sampai < $a['dari']) $sampai = $a['dari'];
            $bagian[] = $a + ['sampai' => $sampai, 'karakter' => (int) $panjang->filter(fn($n, $u) => $u >= $a['dari'] && $u <= $sampai)->sum()];
        }
        return $bagian;
    }

    /** Pilih bagian yang paling cocok dengan nama mapel; null bila tidak ada yang cocok. */
    public static function cocokkan(array $bagian, string $namaMapel): ?int
    {
        $kata = self::kata($namaMapel);
        if (!$kata) return null;
        $terbaik = null;
        $skorTerbaik = 0;
        foreach ($bagian as $i => $b) {
            $kb = self::kata($b['judul']);
            $sama = count(array_intersect($kata, $kb));
            if ($sama === 0) continue;
            if ($sama / count($kata) < 0.6) continue; // mis. "Bahasa Inggris" tidak boleh jatuh ke "Bahasa Indonesia"
            $skor = $sama / count($kata) + $sama / max(1, count($kb)) - (str_contains(mb_strtolower($b['judul']), 'tingkat lanjut') ? 0.5 : 0);
            if ($skor > $skorTerbaik) { $skorTerbaik = $skor; $terbaik = $i; }
        }
        return $terbaik;
    }

    /**
     * Teks bagian untuk dikirim ke AI.
     * @return array{teks:string, dari:int, sampai:int, judul:?string, terpotong:bool}|null
     */
    public static function teksBagian(DokumenRujukan $d, ?int $dari, string $namaMapel): ?array
    {
        $potongan = self::potongan($d);
        if ($potongan->isEmpty()) return null;
        $bagian = self::daftarBagian($d);
        $pilih = $dari !== null ? collect($bagian)->firstWhere('dari', $dari) : (($i = self::cocokkan($bagian, $namaMapel)) !== null ? $bagian[$i] : null);
        if ($pilih) {
            $isi = $potongan->filter(fn($p) => $p->urutan >= $pilih['dari'] && $p->urutan <= $pilih['sampai']);
            return self::rangkai($isi, $pilih['judul']);
        }
        return self::jendelaSebutan($potongan, $namaMapel);
    }

    /** Cadangan tanpa judul: jendela potongan berturut-turut yang paling banyak menyebut nama mapel. */
    private static function jendelaSebutan($potongan, string $namaMapel): ?array
    {
        $kunci = mb_strtolower(trim(preg_replace('~\s+~u', ' ', $namaMapel)));
        if ($kunci === '') return null;
        $list = $potongan->values();
        $pola = '~(?<![\pL\pN])' . preg_quote($kunci, '~') . '(?![\pL\pN])~u'; // kata utuh: "ipa" tidak cocok dengan "partisipasi"
        $skor = $list->map(fn($p) => preg_match_all($pola, mb_strtolower(preg_replace('~\s+~u', ' ', $p->teks))))->all();
        if (!array_sum($skor)) return null;
        $panjang = $list->map(fn($p) => mb_strlen($p->teks))->all();
        [$terbaik, $bi, $bj, $i, $jumlah, $karakter] = [-1, 0, 0, 0, 0, 0];
        foreach ($skor as $j => $s) {
            $jumlah += $s;
            $karakter += $panjang[$j];
            while ($karakter > self::MAKS_KARAKTER && $i < $j) { $jumlah -= $skor[$i]; $karakter -= $panjang[$i]; $i++; }
            if ($jumlah > $terbaik) { [$terbaik, $bi, $bj] = [$jumlah, $i, $j]; }
        }
        return self::rangkai($list->slice($bi, $bj - $bi + 1), null);
    }

    private static function rangkai($isi, ?string $judul): array
    {
        $isi = $isi->values();
        $teks = '';
        $terpotong = false;
        foreach ($isi as $p) {
            if (mb_strlen($teks) + mb_strlen($p->teks) > self::MAKS_KARAKTER) { $terpotong = true; break; }
            $teks .= ($teks === '' ? '' : "\n\n") . $p->teks;
        }
        return ['teks' => $teks, 'dari' => (int) $isi->first()->urutan, 'sampai' => (int) $isi->last()->urutan, 'judul' => $judul, 'terpotong' => $terpotong];
    }

    private static function potongan(DokumenRujukan $d)
    {
        return DB::table('dokumen_potongan')->where('id_dokumen', $d->id_dokumen)->orderBy('urutan')->get(['urutan', 'teks']);
    }

    private static function kata(string $s): array
    {
        $s = mb_strtolower($s);
        foreach (self::SINGKATAN as $pola => $ganti) $s = preg_replace($pola, $ganti, $s);
        $kata = preg_split('~[^\pL\pN]+~u', $s, -1, PREG_SPLIT_NO_EMPTY);
        return array_values(array_unique(array_diff($kata, self::KATA_ABAIKAN)));
    }

    private static function rapiJudul(string $j): string
    {
        return mb_convert_case(mb_strtolower($j), MB_CASE_TITLE, 'UTF-8');
    }
}

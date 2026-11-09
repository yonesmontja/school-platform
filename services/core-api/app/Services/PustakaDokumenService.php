<?php

namespace App\Services;

use App\Models\DokumenPotongan;
use App\Models\DokumenRujukan;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Process;

/**
 * Pustaka dokumen resmi untuk AI: membaca teks berkas/tautan, memotongnya per bagian, dan mengambil bagian yang
 * paling relevan sebagai konteks permintaan AI (CP, ATP, modul ajar, soal). Hanya dokumen AKTIF yang dipakai.
 */
class PustakaDokumenService
{
    public const MAKS_TEKS = 400000;      // karakter teks yang disimpan per dokumen
    private const UKURAN_POTONGAN = 1500;
    private const MAKS_UNDUH = 15 * 1024 * 1024;
    private const KATA_UMUM = ['dan', 'yang', 'untuk', 'dengan', 'pada', 'dari', 'dalam', 'atau', 'ini', 'itu', 'oleh', 'serta', 'akan',
        'dapat', 'adalah', 'sebagai', 'tidak', 'juga', 'para', 'agar', 'bagi', 'secara', 'peserta', 'didik', 'siswa', 'kelas', 'the', 'and'];

    // ===== Membaca teks =====

    /** Teks dari berkas lokal; null bila jenis berkas tidak bisa dibaca di server (mis. PDF tanpa pdftotext). */
    public function teksBerkas(string $path, string $ekstensi): ?string
    {
        return match (strtolower($ekstensi)) {
            'pdf' => $this->teksPdf($path),
            'docx' => $this->teksDocx($path),
            'txt', 'md' => @file_get_contents($path) ?: null,
            default => null,
        };
    }

    public static function pdftotextAda(): bool
    {
        static $ada = null;
        return $ada ??= Process::run(['sh', '-c', 'command -v pdftotext'])->successful();
    }

    private function teksPdf(string $path): ?string
    {
        if (!self::pdftotextAda()) return null;
        $r = Process::timeout(60)->run(['pdftotext', '-enc', 'UTF-8', '-nopgbrk', $path, '-']);
        return $r->successful() ? $r->output() : null;
    }

    private function teksDocx(string $path): ?string
    {
        $r = Process::timeout(30)->run(['unzip', '-p', $path, 'word/document.xml']);
        if (!$r->successful() || $r->output() === '') return null;
        $xml = preg_replace(['~</w:p>~', '~<w:tab/>~', '~<w:br[^>]*/>~'], ["\n", "\t", "\n"], $r->output());
        return html_entity_decode(strip_tags($xml), ENT_QUOTES | ENT_XML1, 'UTF-8');
    }

    /**
     * Teks dari tautan (halaman HTML, PDF, atau teks). Hanya http(s) ke alamat publik (bukan jaringan internal).
     * @return array{teks: ?string, pesan: ?string}
     */
    public function teksTautan(string $url): array
    {
        $tujuan = $url;
        for ($i = 0; $i < 4; $i++) {
            if (!self::alamatPublik($tujuan)) return ['teks' => null, 'pesan' => 'Tautan harus http/https ke alamat publik.'];
            try {
                $res = Http::timeout(30)->withOptions(['allow_redirects' => false, 'stream' => false])
                    ->withHeaders(['User-Agent' => 'EduRapor-Pustaka/1.0'])->get($tujuan);
            } catch (\Throwable $e) {
                return ['teks' => null, 'pesan' => 'Tautan tidak bisa dibuka: ' . mb_substr($e->getMessage(), 0, 160)];
            }
            if ($res->redirect() && $res->header('Location')) {
                $tujuan = (string) \GuzzleHttp\Psr7\UriResolver::resolve(new \GuzzleHttp\Psr7\Uri($tujuan), new \GuzzleHttp\Psr7\Uri($res->header('Location')));
                continue;
            }
            if (!$res->successful()) return ['teks' => null, 'pesan' => "Tautan menjawab HTTP {$res->status()}."];
            $isi = $res->body();
            if (strlen($isi) > self::MAKS_UNDUH) return ['teks' => null, 'pesan' => 'Isi tautan terlalu besar (maks. 15 MB).'];
            $tipe = strtolower($res->header('Content-Type'));
            if (str_contains($tipe, 'pdf') || str_starts_with($isi, '%PDF')) {
                $tmp = tempnam(sys_get_temp_dir(), 'pdf');
                file_put_contents($tmp, $isi);
                $teks = $this->teksPdf($tmp);
                @unlink($tmp);
                return $teks ? ['teks' => $teks, 'pesan' => null]
                    : ['teks' => null, 'pesan' => 'Tautan berupa PDF yang belum bisa dibaca server. Unduh PDF-nya lalu unggah sebagai berkas.'];
            }
            if (str_contains($tipe, 'html') || preg_match('~<html~i', substr($isi, 0, 2000))) return ['teks' => self::teksHtml($isi), 'pesan' => null];
            return ['teks' => $isi, 'pesan' => null];
        }
        return ['teks' => null, 'pesan' => 'Terlalu banyak pengalihan tautan.'];
    }

    /** Penerjemah nama host → IP (bisa diganti di tes agar tidak bergantung DNS). */
    public static ?\Closure $resolver = null;

    public static function alamatPublik(string $url): bool
    {
        $p = parse_url($url);
        if (!in_array(strtolower($p['scheme'] ?? ''), ['http', 'https'], true) || empty($p['host'])) return false;
        $host = trim($p['host'], '[]');
        $ip = filter_var($host, FILTER_VALIDATE_IP) ? [$host] : ((self::$resolver ? (self::$resolver)($host) : gethostbynamel($host)) ?: []);
        if (!$ip) return false;
        foreach ($ip as $a) {
            if (!filter_var($a, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE)) return false;
        }
        return true;
    }

    private static function teksHtml(string $html): string
    {
        $html = preg_replace('~<(script|style|noscript|svg|nav|footer|header)\b[^>]*>.*?</\1>~is', ' ', $html);
        $html = preg_replace('~<(br|/p|/div|/li|/h[1-6]|/tr)\b[^>]*>~i', "\n", $html);
        return html_entity_decode(strip_tags($html), ENT_QUOTES | ENT_HTML5, 'UTF-8');
    }

    /** Rapikan spasi dan batasi panjang. */
    public static function rapikan(?string $teks): string
    {
        $teks = (string) $teks;
        if (!mb_check_encoding($teks, 'UTF-8')) $teks = mb_convert_encoding($teks, 'UTF-8', 'UTF-8, ISO-8859-1');
        $teks = preg_replace(["~\r\n?~", "~[ \t\x{00A0}]+~u", "~\n[ \t]+~", "~\n{3,}~"], ["\n", ' ', "\n", "\n\n"], $teks);
        return mb_substr(trim($teks), 0, self::MAKS_TEKS);
    }

    // ===== Potongan & pencarian =====

    /** Simpan teks dokumen dan potongannya (menggantikan yang lama). */
    public function simpanTeks(DokumenRujukan $d, ?string $teks): void
    {
        $teks = self::rapikan($teks);
        DB::transaction(function () use ($d, $teks) {
            $d->fill(['teks' => $teks ?: null, 'jumlah_karakter' => mb_strlen($teks), 'status_teks' => $teks !== '' ? 'TERBACA' : 'KOSONG'])->save();
            DokumenPotongan::where('id_dokumen', $d->id_dokumen)->delete();
            foreach (self::potong($teks) as $i => $p) {
                DokumenPotongan::create(['id_dokumen' => $d->id_dokumen, 'urutan' => $i, 'teks' => $p]);
            }
        });
    }

    /** Potong per paragraf menjadi bagian ± UKURAN_POTONGAN karakter. */
    public static function potong(string $teks): array
    {
        $hasil = [];
        $buf = '';
        foreach (preg_split("~\n\s*\n|\n(?=[A-Z0-9][^\n]{0,80}\n)~u", $teks) as $para) {
            $para = trim($para);
            if ($para === '') continue;
            while (mb_strlen($para) > self::UKURAN_POTONGAN * 1.5) {
                $hasil[] = mb_substr($para, 0, self::UKURAN_POTONGAN);
                $para = mb_substr($para, self::UKURAN_POTONGAN);
            }
            if ($buf !== '' && mb_strlen($buf) + mb_strlen($para) > self::UKURAN_POTONGAN) {
                $hasil[] = $buf;
                $buf = '';
            }
            $buf .= ($buf === '' ? '' : "\n") . $para;
        }
        if ($buf !== '') $hasil[] = $buf;
        return $hasil;
    }

    /**
     * Pasang rujukan pustaka ke layanan AI untuk permintaan berikutnya.
     * @return array daftar sumber yang dipakai (ditampilkan ke guru)
     */
    public function pasang(SoalAIService $ai, string $kueri, ?string $idMapel = null, ?string $fase = null): array
    {
        $k = $this->konteks($kueri, $idMapel, $fase);
        $ai->denganRujukan($k['teks']);
        return $k['sumber'];
    }

    /** Kalimat penutup pesan: dokumen pustaka yang ikut dibaca AI. */
    public static function catatanSumber(array $sumber): string
    {
        return $sumber ? ' Rujukan pustaka: ' . implode('; ', array_column($sumber, 'judul')) . '.' : '';
    }

    /**
     * Bagian dokumen AKTIF yang paling relevan dengan kueri, untuk disisipkan ke permintaan AI.
     * Dokumen mapel yang sama diutamakan; dokumen umum (tanpa mapel) tetap ikut.
     * @return array{teks: string, sumber: array<int, array{id_dokumen: string, judul: string, jenis: string}>}
     */
    public function konteks(string $kueri, ?string $idMapel = null, ?string $fase = null, int $maksKarakter = 12000): array
    {
        $kata = collect(preg_split('~[^\pL\pN]+~u', mb_strtolower($kueri)))
            ->filter(fn($k) => mb_strlen($k) >= 3 && !in_array($k, self::KATA_UMUM, true))->unique()->take(30)->values();
        if ($kata->isEmpty()) return ['teks' => '', 'sumber' => []];
        $tsquery = $kata->map(fn($k) => preg_replace('~[^\pL\pN]~u', '', $k))->filter()->implode(' | ');

        $baris = DB::select(
            "SELECT p.teks, d.id_dokumen, d.judul, d.jenis, ts_rank(p.cari, to_tsquery('simple', ?)) AS skor
               FROM dokumen_potongan p JOIN dokumen_rujukan d ON d.id_dokumen = p.id_dokumen
              WHERE d.status = 'AKTIF' AND p.cari @@ to_tsquery('simple', ?)
                AND (d.id_mapel IS NULL OR d.id_mapel = CAST(? AS text)) AND (d.fase IS NULL OR CAST(? AS text) IS NULL OR d.fase = ?)
              ORDER BY (d.id_mapel IS NOT NULL AND d.id_mapel = CAST(? AS text)) DESC, skor DESC
              LIMIT 16",
            [$tsquery, $tsquery, $idMapel, $fase, $fase, $idMapel]
        );

        $bagian = [];
        $sumber = [];
        $total = 0;
        foreach ($baris as $b) {
            if ($total + mb_strlen($b->teks) > $maksKarakter) continue;
            $bagian[] = "[{$b->judul}]\n{$b->teks}";
            $sumber[$b->id_dokumen] = ['id_dokumen' => $b->id_dokumen, 'judul' => $b->judul, 'jenis' => $b->jenis];
            $total += mb_strlen($b->teks);
        }
        return ['teks' => implode("\n\n---\n\n", $bagian), 'sumber' => array_values($sumber)];
    }
}

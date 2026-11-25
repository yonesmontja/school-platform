<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\SchoolSetting;
use App\Services\DiagramTeknis;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Dokumen Teknis SAPrapor (khusus Admin): konsep, analisis, perancangan, implementasi, dan pengujian sistem.
 * Isinya berkas Markdown di resources/dokumen-teknis (ikut repo), jadi dokumen ikut berubah setiap repo diperbarui.
 * Blok ```diagram digambar menjadi SVG oleh DiagramTeknis, dan penanda {{...}} diganti data yang dihitung dari
 * kode serta basis data yang sedang berjalan (statistik, daftar endpoint, daftar tabel, daftar tes).
 */
class DokumenTeknisController extends Controller
{
    private const PENANDA = ['statistik', 'ringkasan_endpoint', 'daftar_endpoint', 'daftar_tabel', 'daftar_tes', 'diperbarui'];

    public function index(Request $request)
    {
        // Khusus Admin: peninjau (yang biasanya boleh membaca rute admin) juga ditolak
        abort_unless($request->user()?->role === 'admin', 403, 'Dokumen Teknis hanya dapat dibuka Admin.');
        $folder = resource_path('dokumen-teknis');
        $berkas = glob($folder . '/*.md') ?: [];
        sort($berkas);
        $metaFile = $folder . '/meta.json';
        $waktu = array_map('filemtime', [...$berkas, ...(is_file($metaFile) ? [$metaFile] : [])]);
        $diperbarui = $waktu ? max($waktu) : time();

        // Kunci cache berubah bila salah satu berkas berubah; data hidup (statistik, endpoint) disegarkan tiap 10 menit
        $kunci = 'dokumen-teknis:' . md5(implode('|', $berkas) . implode('|', $waktu) . filemtime(__FILE__) . filemtime(app_path('Services/DiagramTeknis.php')));
        $hasil = Cache::remember($kunci, now()->addMinutes(10), function () use ($berkas, $diperbarui) {
            $hidup = $this->dataHidup($diperbarui);
            return [
                'bab' => array_map(fn($f) => $this->bab($f, $hidup), $berkas),
                'statistik' => $hidup['statistik_angka'],
                'dihitung' => now()->toIso8601String(),
            ];
        });

        $meta = is_file($metaFile) ? (json_decode(file_get_contents($metaFile), true) ?: []) : [];
        $meta['institusi'] = $meta['institusi'] ?? (SchoolSetting::query()->value('nama_sekolah') ?: config('app.name'));

        return response()->json([
            ...$hasil,
            'meta' => $meta,
            'diperbarui' => date(DATE_ATOM, $diperbarui),
        ]);
    }

    /** Satu bab: judul dari baris "# …", isi HTML dengan id per subbab untuk daftar isi. */
    private function bab(string $file, array $hidup): array
    {
        $md = file_get_contents($file);
        $judul = preg_match('/^#\s+(.+)$/m', $md, $m) ? trim($m[1]) : basename($file, '.md');
        $md = preg_replace('/^#\s+.+$/m', '', $md, 1);
        $slugBab = Str::slug(preg_replace('/^\d+-/', '', basename($file, '.md')));

        // Penanda data hidup; "\{{…}}" ditulis apa adanya (untuk menyebut penanda di dalam teks)
        $md = preg_replace_callback('/(?<!\\\\)\{\{\s*(\w+)\s*\}\}/', fn($m) => in_array($m[1], self::PENANDA, true) ? $hidup[$m[1]] : $m[0], $md);
        $md = str_replace('\{{', '{{', $md);

        // Diagram diganti token dulu agar tidak diolah CommonMark
        $diagram = [];
        $md = preg_replace_callback('/^```diagram\s*\n(.*?)\n```\s*$/ms', function ($m) use (&$diagram) {
            $diagram[] = DiagramTeknis::render($m[1]);
            return "\n<div data-diagram=\"" . (count($diagram) - 1) . "\"></div>\n";
        }, $md);

        $html = Str::markdown($md, ['html_input' => 'allow', 'allow_unsafe_links' => false]);
        $html = preg_replace_callback('/<div data-diagram="(\d+)"><\/div>/', fn($m) => $diagram[(int) $m[1]] ?? '', $html);
        $html = preg_replace('/<table>/', '<div class="dt-tabel"><table>', $html);
        $html = preg_replace('/<\/table>/', '</table></div>', $html);

        $bagian = [];
        $dipakai = [];
        $html = preg_replace_callback('/<h([23])>(.*?)<\/h\1>/s', function ($m) use (&$bagian, &$dipakai, $slugBab) {
            $teks = trim(strip_tags($m[2]));
            $id = $slugBab . '-' . Str::slug($teks);
            $dasar = $id;
            for ($i = 2; isset($dipakai[$id]); $i++) $id = "$dasar-$i";
            $dipakai[$id] = true;
            $bagian[] = ['id' => $id, 'judul' => html_entity_decode($teks), 'level' => (int) $m[1]];
            return "<h{$m[1]} id=\"{$id}\">{$m[2]}</h{$m[1]}>";
        }, $html);

        return ['slug' => $slugBab, 'judul' => $judul, 'html' => $html, 'bagian' => $bagian];
    }

    /** Data yang dihitung dari kode dan basis data yang sedang berjalan. */
    private function dataHidup(int $diperbarui): array
    {
        $endpoint = app(DokumentasiApiController::class)->endpoint();
        $tabel = $this->tabel();
        $tes = $this->tes();
        $hitungFile = fn(string $pola) => count(glob(base_path($pola)) ?: []);
        // Baris kode dihitung sekali sehari (membaca ratusan berkas lewat bind mount Windows cukup lambat)
        $barisPhp = Cache::remember('dokumen-teknis:baris-php:' . date('Y-m-d'), now()->addDay(), function () {
            $n = 0;
            foreach (new \RecursiveIteratorIterator(new \RecursiveDirectoryIterator(app_path(), \FilesystemIterator::SKIP_DOTS)) as $f) {
                if ($f->getExtension() === 'php') $n += substr_count(file_get_contents($f->getPathname()), "\n");
            }
            return $n;
        });
        $jumlah = fn(string $t, ?callable $q = null) => \Illuminate\Support\Facades\Schema::hasTable($t) ? ($q ? $q(DB::table($t)) : DB::table($t))->count() : 0;

        $angka = [
            ['label' => 'Endpoint API', 'nilai' => $endpoint->count()],
            ['label' => 'Tabel basis data', 'nilai' => count($tabel)],
            ['label' => 'Berkas migrasi', 'nilai' => $hitungFile('database/migrations/*.php')],
            ['label' => 'Model Eloquent', 'nilai' => $hitungFile('app/Models/*.php')],
            ['label' => 'Controller API', 'nilai' => $hitungFile('app/Http/Controllers/Api/*.php')],
            ['label' => 'Service (logika bisnis)', 'nilai' => $hitungFile('app/Services/*.php')],
            ['label' => 'Perintah terjadwal & konsol', 'nilai' => $hitungFile('app/Console/Commands/*.php')],
            ['label' => 'Baris kode PHP (app/)', 'nilai' => $barisPhp],
            ['label' => 'Berkas tes backend', 'nilai' => count($tes)],
            ['label' => 'Kasus tes backend', 'nilai' => array_sum(array_column($tes, 'jumlah'))],
        ];
        $data = [
            ['label' => 'Siswa aktif', 'nilai' => $jumlah('students', fn($q) => \Illuminate\Support\Facades\Schema::hasColumn('students', 'status_siswa') ? $q->where(fn($w) => $w->whereNull('status_siswa')->orWhere('status_siswa', 'AKTIF')->orWhere('status_siswa', 'aktif')) : $q)],
            ['label' => 'Guru', 'nilai' => $jumlah('teachers')],
            ['label' => 'Rombel', 'nilai' => $jumlah('classes')],
            ['label' => 'Akun pengguna', 'nilai' => $jumlah('users')],
            ['label' => 'Nilai tercatat', 'nilai' => $jumlah('trans_nilai')],
            ['label' => 'Entri jurnal', 'nilai' => $jumlah('trans_jurnal')],
        ];

        $fmt = fn($n) => number_format($n, 0, ',', '.');
        $statistik = "| Ukuran | Jumlah |\n|---|---:|\n";
        foreach ($angka as $a) $statistik .= "| {$a['label']} | {$fmt($a['nilai'])} |\n";
        $statistik .= "\n| Data sekolah yang tercatat | Jumlah |\n|---|---:|\n";
        foreach ($data as $a) $statistik .= "| {$a['label']} | {$fmt($a['nilai'])} |\n";

        $ringkas = "| Kelompok | Endpoint | Butuh login | Khusus admin |\n|---|---:|---:|---:|\n";
        foreach ($endpoint->groupBy('kelompok')->sortKeys() as $k => $g) {
            $ringkas .= '| ' . $k . ' | ' . $g->count() . ' | ' . $g->where('butuh_login', true)->count() . ' | ' . $g->filter(fn($e) => $e['peran'] === ['admin'])->count() . " |\n";
        }
        $ringkas .= '| **Jumlah** | **' . $endpoint->count() . '** | **' . $endpoint->where('butuh_login', true)->count() . "** | |\n";

        $daftar = '';
        foreach ($endpoint->groupBy('kelompok')->sortKeys() as $k => $g) {
            $daftar .= "\n#### {$k}\n\n| Metode | Jalur | Akses | Keterangan |\n|---|---|---|---|\n";
            foreach ($g as $e) {
                $daftar .= '| ' . $e['metode'] . ' | `' . $e['uri'] . '` | ' . $this->sel($e['akses_label']) . ' | ' . $this->sel(Str::limit($e['deskripsi'], 160)) . " |\n";
            }
        }

        $daftarTabel = "| Tabel | Kolom | Keterangan |\n|---|---:|---|\n";
        foreach ($tabel as $t) $daftarTabel .= '| `' . $t['nama'] . '` | ' . $t['kolom'] . ' | ' . $this->sel($t['keterangan']) . " |\n";

        $daftarTes = "| Berkas tes | Kasus | Yang diuji (ringkasan dari nama tes) |\n|---|---:|---|\n";
        foreach ($tes as $t) $daftarTes .= '| `' . $t['nama'] . '` | ' . $t['jumlah'] . ' | ' . $this->sel(Str::limit($t['contoh'], 180)) . " |\n";

        return [
            'statistik' => $statistik,
            'statistik_angka' => [...$angka, ...$data],
            'ringkasan_endpoint' => $ringkas,
            'daftar_endpoint' => $daftar,
            'daftar_tabel' => $daftarTabel,
            'daftar_tes' => $daftarTes,
            'diperbarui' => \Carbon\Carbon::createFromTimestamp($diperbarui, config('app.zona_sekolah', 'Asia/Jayapura'))->locale('id')->translatedFormat('j F Y'),
        ];
    }

    private function sel(?string $s): string
    {
        return str_replace(['|', "\n"], ['\\|', ' '], (string) $s);
    }

    /** Daftar tabel skema public beserta jumlah kolom dan komentar tabel bila ada. */
    private function tabel(): array
    {
        if (DB::getDriverName() !== 'pgsql') return [];
        $baris = DB::select("
            select c.relname as nama, obj_description(c.oid, 'pg_class') as keterangan,
                   (select count(*) from information_schema.columns k where k.table_schema = 'public' and k.table_name = c.relname) as kolom
            from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public' and c.relkind = 'r'
            order by c.relname");
        return array_map(fn($b) => ['nama' => $b->nama, 'kolom' => (int) $b->kolom, 'keterangan' => $b->keterangan ?? $this->tebakKeterangan($b->nama)], $baris);
    }

    private function tebakKeterangan(string $nama): string
    {
        $peta = [
            'users' => 'Akun pengguna & peran', 'students' => 'Master siswa', 'teachers' => 'Master guru', 'classes' => 'Rombongan belajar',
            'subjects' => 'Mata pelajaran & KKM', 'master_periode' => 'Semester / periode akademik', 'trans_nilai' => 'Nilai bertanggal & poin STNKM',
            'trans_jurnal' => 'Jurnal anekdotal & skor STNKM', 'trans_presensi' => 'Presensi harian', 'trans_jadwal' => 'Sesi jadwal pembelajaran',
            'bank_soal' => 'Bank soal', 'paket_soal' => 'Paket / naskah soal', 'log_aktivitas' => 'Audit trail (hanya-tambah)', 'school_settings' => 'Pengaturan sekolah (API key terenkripsi)',
            'personal_access_tokens' => 'Token login Sanctum', 'migrations' => 'Riwayat migrasi', 'cache' => 'Cache aplikasi', 'jobs' => 'Antrean tugas',
        ];
        return $peta[$nama] ?? '';
    }

    /** Berkas tes backend dan jumlah kasusnya (method test_… atau atribut #[Test]). */
    private function tes(): array
    {
        $hasil = [];
        foreach (glob(base_path('tests/Feature/*.php')) ?: [] as $f) {
            $isi = file_get_contents($f);
            preg_match_all('/function\s+(test_?\w+)\s*\(/', $isi, $m);
            $jumlah = count($m[1]) + preg_match_all('/#\[Test\]/', $isi);
            $contoh = implode('; ', array_slice(array_map(fn($n) => str_replace('_', ' ', preg_replace('/^test_?/', '', Str::snake($n))), $m[1]), 0, 3));
            $hasil[] = ['nama' => basename($f, '.php'), 'jumlah' => $jumlah, 'contoh' => $contoh];
        }
        return $hasil;
    }
}

<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Routing\Route as RuteLaravel;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\Str;

/**
 * Dokumentasi API yang selalu sesuai kode: daftar rute dibaca langsung dari router, aksesnya dari middleware,
 * dan keterangannya dari (1) komentar dokumentasi method controller, (2) tabel endpoint README
 * (resources/dokumentasi/api_readme.json, dibuat ulang dengan infra/perbarui-dokumentasi-api.py), atau
 * (3) nama aksi. Tersedia juga dalam format OpenAPI 3 untuk Postman/Insomnia.
 */
class DokumentasiApiController extends Controller
{
    private const PERAN = ['admin' => 'Admin', 'kepsek' => 'Kepala sekolah', 'guru' => 'Guru', 'siswa' => 'Siswa', 'ortu' => 'Orang tua', 'wakakur' => 'Wakasek kurikulum (lihat saja)', 'wakasis' => 'Wakasek kesiswaan (lihat saja)', 'yayasan' => 'Yayasan (lihat saja)'];
    private const NAMA_SUMBER = ['classes' => 'kelas', 'students' => 'siswa', 'teachers' => 'guru', 'subjects' => 'mata pelajaran', 'users' => 'pengguna', 'settings' => 'pengaturan sekolah'];
    private const AKSI_CRUD = ['index' => 'Daftar', 'store' => 'Tambah', 'show' => 'Detail', 'update' => 'Ubah', 'destroy' => 'Hapus'];

    public function index()
    {
        $data = $this->endpoint();
        return response()->json([
            'data' => $data->groupBy('kelompok')->map(fn($g, $k) => ['kelompok' => $k, 'endpoint' => $g->values()])->values(),
            'jumlah' => $data->count(),
            'versi' => config('app.version', '1.0'),
        ]);
    }

    /** Spesifikasi OpenAPI 3.0 (impor ke Postman/Insomnia/Swagger UI). */
    public function openapi()
    {
        $paths = [];
        foreach ($this->endpoint() as $e) {
            $params = [];
            preg_match_all('/\{(\w+)\??\}/', $e['uri'], $m);
            foreach ($m[1] as $p) $params[] = ['name' => $p, 'in' => 'path', 'required' => true, 'schema' => ['type' => 'string']];
            $paths[preg_replace('/\{(\w+)\?\}/', '{$1}', $e['uri'])][strtolower($e['metode'])] = array_filter([
                'tags' => [$e['kelompok']],
                'summary' => Str::limit($e['deskripsi'], 120),
                'description' => $e['deskripsi'] . "\n\nAkses: " . $e['akses_label'] . ($e['batas'] ? "\nBatas laju: {$e['batas']}" : ''),
                'operationId' => $e['aksi'],
                'parameters' => $params ?: null,
                'security' => $e['butuh_login'] ? [['bearerAuth' => []]] : [],
                'responses' => ['200' => ['description' => 'Berhasil'], '401' => ['description' => 'Belum masuk'], '403' => ['description' => 'Tidak berhak'], '422' => ['description' => 'Data tidak valid']],
            ], fn($v) => $v !== null);
        }
        ksort($paths);
        return response()->json([
            'openapi' => '3.0.3',
            'info' => ['title' => 'EduRapor API', 'version' => config('app.version', '1.0'), 'description' => 'API sekolah: rapor, penilaian STNKM, jadwal, jurnal, bank soal, tes online, dan perangkat ajar.'],
            'servers' => [['url' => rtrim(config('app.url'), '/') . '/api']],
            'components' => ['securitySchemes' => ['bearerAuth' => ['type' => 'http', 'scheme' => 'bearer', 'description' => 'Token dari POST /login']]],
            'paths' => $paths,
        ], 200, [], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    }

    /** Disimpan di cache; kunci berubah bila daftar rute atau berkas keterangan README berubah. */
    private function endpoint()
    {
        $rute = collect(Route::getRoutes()->getRoutes())->map(fn(RuteLaravel $r) => implode('|', $r->methods()) . ' ' . $r->uri() . ' ' . $r->getActionName())->implode("
");
        $file = resource_path('dokumentasi/api_readme.json');
        $kunci = 'dokumentasi-api:' . md5($rute . (is_file($file) ? filemtime($file) : '') . filemtime(__FILE__));
        return collect(\Illuminate\Support\Facades\Cache::remember($kunci, now()->addDay(), fn() => $this->bacaEndpoint()->all()));
    }

    private function bacaEndpoint()
    {
        $readme = $this->readme();
        return collect(Route::getRoutes()->getRoutes())
            ->filter(fn(RuteLaravel $r) => Str::startsWith($r->uri(), 'api/') && !Str::startsWith($r->uri(), 'api/dokumentasi'))
            ->flatMap(fn(RuteLaravel $r) => collect($r->methods())->reject(fn($m) => $m === 'HEAD')->map(fn($m) => $this->satu($r, $m, $readme)))
            ->sortBy(fn($e) => $e['kelompok'] . ' ' . $e['uri'] . ' ' . array_search($e['metode'], ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']))
            ->values();
    }

    private function satu(RuteLaravel $r, string $metode, array $readme): array
    {
        $uri = '/' . Str::after($r->uri(), 'api/');
        // Middleware dari definisi rute saja (gatherMiddleware membuat objek controller untuk setiap rute: lambat)
        $mw = $r->middleware();
        $butuhLogin = collect($mw)->contains(fn($m) => is_string($m) && Str::contains($m, ['auth:sanctum', 'Authenticate:sanctum']));
        $peran = collect($mw)->map(fn($m) => is_string($m) && preg_match('/(?:role|EnsureRole):([\w,]+)/', $m, $x) ? explode(',', $x[1]) : null)->filter()->last();
        $batas = collect($mw)->map(fn($m) => is_string($m) && preg_match('/(?:throttle|ThrottleRequests):(\d+),(\d+)/', $m, $x) ? "{$x[1]} permintaan per {$x[2]} menit" : null)->filter()->last();
        $aksi = $r->getActionName();
        [$kelas, $method] = Str::contains($aksi, '@') ? explode('@', $aksi) : [$aksi, null];

        return [
            'metode' => $metode,
            'uri' => $uri,
            'kelompok' => $this->kelompok($uri),
            'deskripsi' => $this->deskripsi($kelas, $method, $metode, $uri, $readme),
            'butuh_login' => $butuhLogin,
            'peran' => $peran ?: ($butuhLogin ? ['admin', 'kepsek', 'guru'] : []),
            'akses_label' => Str::startsWith($uri, '/internal/') ? 'Layanan internal (kunci RENDER_SECRET)' : (!$butuhLogin ? 'Publik (tanpa login)'
                : ($peran ? collect($peran)->map(fn($p) => self::PERAN[$p] ?? $p)->implode(', ') : 'Staf (admin, kepala sekolah, guru)')),
            'batas' => $batas,
            'aksi' => class_basename($kelas) . ($method ? "@{$method}" : ''),
        ];
    }

    private function deskripsi(string $kelas, ?string $method, string $metode, string $uri, array $readme): string
    {
        // 1. Komentar dokumentasi method
        if ($method && method_exists($kelas, $method)) {
            $doc = (new \ReflectionMethod($kelas, $method))->getDocComment();
            if ($doc) {
                $teks = trim(preg_replace(['#^/\*\*|\*/$#', '#^\s*\* ?#m'], '', $doc));
                $paragraf = trim(preg_split('/\n\s*\n|\n\s*@/', $teks)[0]);
                if ($paragraf !== '') return preg_replace('/\s+/', ' ', $paragraf);
            }
        }
        // 2. Tabel endpoint README
        $kunci = $metode . ' ' . preg_replace('/\{[^}]+\}/', '{}', $uri);
        $dariReadme = $readme[$kunci] ?? ($metode === 'PATCH' ? ($readme['PUT ' . Str::after($kunci, ' ')] ?? null) : null);
        // Baris README sering menggabungkan beberapa metode untuk satu jalur; awali dengan aksinya agar terbedakan
        if ($dariReadme) {
            $jalur = Str::after($kunci, ' ');
            $ganda = collect(['GET', 'POST', 'PUT', 'PATCH', 'DELETE'])->filter(fn($m) => isset($readme["{$m} {$jalur}"]))->count() > 1;
            if (!$ganda) return $dariReadme;
            $verba = match ($metode) { 'GET' => Str::endsWith($jalur, '{}') ? 'Detail' : 'Daftar', 'POST' => 'Tambah', 'DELETE' => 'Hapus', default => 'Ubah' };
            return "{$verba}: {$dariReadme}";
        }
        // 3. Nama aksi (apiResource: Daftar/Tambah/Detail/Ubah/Hapus + sumber daya)
        $sumber = str_replace('-', ' ', Str::of($uri)->explode('/')->filter(fn($s) => $s !== '' && !Str::startsWith($s, '{'))->last() ?? '');
        $sumber = self::NAMA_SUMBER[$sumber] ?? $sumber;
        if ($method && isset(self::AKSI_CRUD[$method])) return self::AKSI_CRUD[$method] . ' ' . $sumber;
        $nama = (string) Str::of($method ?? 'aksi')->snake(' ');
        return Str::ucfirst(Str::contains($nama, $sumber) ? $nama : "{$nama} ({$sumber})");
    }

    private function kelompok(string $uri): string
    {
        $awal = Str::of($uri)->explode('/')->filter()->first() ?? '';
        return match (true) {
            in_array($awal, ['login', 'logout', 'me', 'user', 'akun', 'health', 'signature'], true) => 'Akun & sistem',
            in_array($awal, ['bank-soal', 'kisi-kisi', 'paket-soal'], true) => 'Bank soal & paket',
            in_array($awal, ['video-belajar', 'internal'], true) => 'Video belajar',
            $awal === 'ujian' => 'Tes online (siswa)',
            $awal === 'perangkat-ajar' => 'Perangkat ajar',
            in_array($awal, ['nilai', 'nilai-indikator', 'remedial', 'import'], true) => 'Penilaian',
            in_array($awal, ['rapor', 'laporan', 'dashboard'], true) => 'Rapor & laporan',
            in_array($awal, ['jadwal', 'ruangan'], true) => 'Jadwal',
            in_array($awal, ['jurnal', 'presensi', 'diagnostik', 'proyek', 'p5'], true) => 'Kegiatan kelas',
            in_array($awal, ['portal', 'notifikasi'], true) => 'Portal & notifikasi',
            default => 'Data induk & pengaturan',
        };
    }

    private function readme(): array
    {
        $file = resource_path('dokumentasi/api_readme.json');
        return is_file($file) ? (json_decode(file_get_contents($file), true) ?: []) : [];
    }
}

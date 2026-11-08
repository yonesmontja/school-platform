<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * Dasbor pemakaian aplikasi untuk masa pakai nyata (Fase 18): siapa memakai fitur apa, fitur mana yang belum
 * disentuh, jejak kerja nyata (nilai, jurnal, presensi, modul, tes), hambatan (permintaan gagal & lambat),
 * dan pemakaian portal. Sumber: Log Aktivitas dan tabel kerja. Hanya admin & kepala sekolah.
 */
class PemakaianController extends Controller
{
    // Fitur inti alur kerja guru → nama modul di Log Aktivitas (menu yang dibuka & data yang disimpan)
    public const FITUR = [
        'jadwal' => ['label' => 'Jadwal', 'ikon' => 'bi-calendar3-week', 'modul' => ['Jadwal']],
        'nilai' => ['label' => 'Input Nilai', 'ikon' => 'bi-pencil-square', 'modul' => ['Input Nilai', 'Nilai', 'Import Excel']],
        'jurnal' => ['label' => 'Jurnal', 'ikon' => 'bi-journal-text', 'modul' => ['Jurnal']],
        'presensi' => ['label' => 'Presensi', 'ikon' => 'bi-calendar-check', 'modul' => ['Presensi']],
        'perangkat' => ['label' => 'Perangkat Ajar', 'ikon' => 'bi-journal-richtext', 'modul' => ['Perangkat Ajar']],
        'soal' => ['label' => 'Bank & Paket Soal', 'ikon' => 'bi-patch-question', 'modul' => ['Bank Soal', 'Kisi Kisi', 'Paket Soal']],
        'remedial' => ['label' => 'Remedial', 'ikon' => 'bi-arrow-repeat', 'modul' => ['Remedial', 'Perlu Tindakan']],
        'diagnostik' => ['label' => 'Asesmen Diagnostik', 'ikon' => 'bi-clipboard2-pulse', 'modul' => ['Asesmen Diagnostik']],
        'rapor' => ['label' => 'Rapor', 'ikon' => 'bi-file-earmark-text', 'modul' => ['Rapor']],
    ];
    private const AKSI_KERJA = ['SIMPAN', 'TAMBAH', 'UBAH', 'HAPUS', 'IMPORT', 'CETAK', 'EKSPOR', 'KIRIM_WA', 'AI'];

    public function index(Request $request)
    {
        abort_unless($request->user()->isPengelola(), 403, 'Dasbor pemakaian hanya untuk admin dan kepala sekolah.');
        $request->validate(['hari' => 'nullable|integer|in:7,14,30,60,90']);
        $hari = $request->integer('hari', 30);
        $sejak = now()->subDays($hari - 1)->startOfDay();
        $log = fn() => DB::table('log_aktivitas')->where('waktu', '>=', $sejak);

        $modulKeFitur = [];
        foreach (self::FITUR as $k => $f) foreach ($f['modul'] as $m) $modulKeFitur[$m] = $k;

        // ===== Per guru =====
        $guru = User::where('role', 'guru')->where('aktif', true)->orderBy('name')->get(['id', 'name', 'id_guru']);
        $baris = $log()->whereIn('user_id', $guru->pluck('id'))->whereIn('modul', array_keys($modulKeFitur))
            ->selectRaw("user_id, modul, SUM(CASE WHEN kategori = 'NAVIGASI' THEN 1 ELSE 0 END) as buka, SUM(CASE WHEN aksi IN ('" . implode("','", self::AKSI_KERJA) . "') THEN 1 ELSE 0 END) as kerja")
            ->groupBy('user_id', 'modul')->get();
        $hariAktif = $log()->whereIn('user_id', $guru->pluck('id'))->selectRaw('user_id, COUNT(DISTINCT DATE(waktu)) as hari')->groupBy('user_id')->pluck('hari', 'user_id');
        $terakhir = DB::table('log_aktivitas')->whereIn('user_id', $guru->pluck('id'))->selectRaw('user_id, MAX(waktu) as waktu')->groupBy('user_id')->pluck('waktu', 'user_id');

        $perGuru = $guru->map(function ($g) use ($baris, $modulKeFitur, $hariAktif, $terakhir) {
            $fitur = array_fill_keys(array_keys(self::FITUR), ['buka' => 0, 'kerja' => 0]);
            foreach ($baris->where('user_id', $g->id) as $b) {
                $k = $modulKeFitur[$b->modul];
                $fitur[$k]['buka'] += (int) $b->buka;
                $fitur[$k]['kerja'] += (int) $b->kerja;
            }
            return [
                'id' => $g->id, 'nama' => $g->name,
                'hari_aktif' => (int) ($hariAktif[$g->id] ?? 0),
                'terakhir_aktif' => isset($terakhir[$g->id]) ? Carbon::parse($terakhir[$g->id])->toIso8601String() : null,
                'fitur' => $fitur,
                'fitur_dipakai' => collect($fitur)->filter(fn($f) => $f['buka'] + $f['kerja'] > 0)->count(),
            ];
        })->values();

        $jumlahGuru = max(1, $guru->count());
        $adopsi = collect(self::FITUR)->map(fn($f, $k) => [
            'kunci' => $k, 'label' => $f['label'], 'ikon' => $f['ikon'],
            'guru_memakai' => $perGuru->filter(fn($g) => $g['fitur'][$k]['buka'] + $g['fitur'][$k]['kerja'] > 0)->count(),
            'guru_bekerja' => $perGuru->filter(fn($g) => $g['fitur'][$k]['kerja'] > 0)->count(),
            'persen' => (int) round($perGuru->filter(fn($g) => $g['fitur'][$k]['buka'] + $g['fitur'][$k]['kerja'] > 0)->count() / $jumlahGuru * 100),
        ])->values();

        // ===== Aktivitas harian (pengguna aktif per peran) =====
        $harian = $log()->whereNotNull('user_id')->whereIn('peran', ['admin', 'kepsek', 'guru', 'siswa', 'ortu'])
            ->selectRaw('DATE(waktu) as tanggal, peran, COUNT(DISTINCT user_id) as pengguna')->groupBy('tanggal', 'peran')->orderBy('tanggal')->get();

        // ===== Jejak kerja nyata dari tabel kerja =====
        $jejak = [
            ['label' => 'Nilai dicatat', 'ikon' => 'bi-pencil-square', 'jumlah' => DB::table('trans_nilai')->where('created_at', '>=', $sejak)->count()],
            ['label' => 'Jurnal ditulis', 'ikon' => 'bi-journal-text', 'jumlah' => DB::table('trans_jurnal')->where('created_at', '>=', $sejak)->count()],
            ['label' => 'Hari presensi kelas', 'ikon' => 'bi-calendar-check', 'jumlah' => DB::table('trans_presensi')->where('tanggal', '>=', $sejak->toDateString())->distinct()->count(DB::raw("id_kelas || '-' || tanggal"))],
            ['label' => 'Sesi jadwal selesai', 'ikon' => 'bi-calendar3-week', 'jumlah' => DB::table('trans_jadwal')->where('mulai', '>=', $sejak)->where('status_sesi', 'Selesai')->count()],
            ['label' => 'Modul ajar disetujui', 'ikon' => 'bi-journal-richtext', 'jumlah' => DB::table('modul_ajar')->where('disetujui_pada', '>=', $sejak)->count()],
            ['label' => 'Soal disetujui', 'ikon' => 'bi-patch-check', 'jumlah' => DB::table('bank_soal')->where('disetujui_pada', '>=', $sejak)->count()],
            ['label' => 'Tes online dikerjakan siswa', 'ikon' => 'bi-phone', 'jumlah' => DB::table('paket_soal_jawaban')->where('sumber', 'ONLINE')->where('selesai_pada', '>=', $sejak)->count()],
            ['label' => 'Remedial selesai', 'ikon' => 'bi-arrow-repeat', 'jumlah' => DB::table('trans_rencana_remedial')->where('status', 'SELESAI')->where('tanggal_selesai', '>=', $sejak->toDateString())->count()],
        ];

        // ===== Hambatan: permintaan gagal (selain sesi habis & isian tidak valid) dan rute lambat =====
        $gagal = $log()->where('berhasil', false)->whereNotIn('aksi', ['LOGIN_GAGAL'])->where(fn($q) => $q->whereNull('status_http')->orWhereNotIn('status_http', [401, 422]))
            ->selectRaw('modul, rute, COUNT(*) as jumlah, COUNT(DISTINCT user_id) as pengguna')->groupBy('modul', 'rute')->orderByDesc('jumlah')->limit(8)->get();
        // Rute AI memang menunggu penyedia AI (puluhan detik); yang dicari di sini halaman biasa yang lambat
        $lambat = $log()->whereNotNull('durasi_ms')->whereNotNull('rute')->where('rute', 'not like', '%/ai%')->where('rute', 'not like', '%generate%')->where('rute', 'not like', '%/analyze%')
            ->selectRaw('rute, COUNT(*) as jumlah, ROUND(AVG(durasi_ms)) as rata_ms, PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY durasi_ms) as p90_ms')
            ->groupBy('rute')->havingRaw('COUNT(*) >= 3')->orderByDesc('p90_ms')->limit(8)->get()
            ->map(fn($r) => ['rute' => $r->rute, 'jumlah' => (int) $r->jumlah, 'rata_ms' => (int) $r->rata_ms, 'p90_ms' => (int) round($r->p90_ms)]);

        // ===== Portal siswa & orang tua =====
        $portal = collect(['siswa', 'ortu'])->mapWithKeys(fn($p) => [$p => [
            'akun' => User::where('role', $p)->where('aktif', true)->count(),
            'aktif' => $log()->where('peran', $p)->whereNotNull('user_id')->distinct()->count('user_id'),
            'login' => $log()->where('peran', $p)->where('aksi', 'LOGIN')->count(),
        ]])->all();

        return response()->json([
            'hari' => $hari,
            'sejak' => $sejak->toDateString(),
            'fitur' => collect(self::FITUR)->map(fn($f, $k) => ['kunci' => $k, 'label' => $f['label'], 'ikon' => $f['ikon']])->values(),
            'ringkasan' => [
                'guru' => $guru->count(),
                'guru_aktif' => $perGuru->where('hari_aktif', '>', 0)->count(),
                'guru_aktif_7_hari' => DB::table('log_aktivitas')->whereIn('user_id', $guru->pluck('id'))->where('waktu', '>=', now()->subDays(7))->distinct()->count('user_id'),
                'rata_hari_aktif' => round($perGuru->avg('hari_aktif') ?? 0, 1),
            ],
            'per_guru' => $perGuru,
            'adopsi' => $adopsi,
            'harian' => $harian,
            'jejak' => $jejak,
            'hambatan' => ['gagal' => $gagal, 'lambat' => $lambat],
            'portal' => $portal,
        ]);
    }
}

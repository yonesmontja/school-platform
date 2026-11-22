<?php

namespace App\Console\Commands;

use App\Models\Classes;
use App\Models\HariLibur;
use App\Models\MasterPeriode;
use App\Models\User;
use App\Services\Pengampu;
use App\Services\RiwayatRombel;
use Illuminate\Console\Command;
use Illuminate\Contracts\Http\Kernel as HttpKernel;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * Gladi Tutup Semester: jalankan wizard Tutup Semester (lewat API, seperti tombol admin) pada SALINAN database,
 * lalu periksa hasilnya: periode, rombel & wali, pengampu, jadwal, data semester lama utuh & terkunci,
 * dan halaman penting tetap terbuka untuk tiap peran.
 *
 * Hanya mau berjalan bila nama database berakhiran "_gladi". Dipanggil oleh infra/gladi-tutup-semester.sh,
 * yang membuat salinan dari dump terbaru lalu menghapusnya kembali.
 */
class GladiTutupSemester extends Command
{
    protected $signature = 'semester:gladi
        {--tanggal-mulai= : Tanggal mulai semester tujuan (Y-m-d); kosong = tanggal di data/perkiraan}
        {--tanggal-selesai= : Tanggal selesai semester tujuan (Y-m-d)}
        {--tanpa-jadwal : Jangan salin pola jadwal mingguan}';

    protected $description = 'Gladi Tutup Semester pada salinan database (nama database harus berakhiran _gladi)';

    private array $token = [];
    private array $masalah = [];

    public function handle(): int
    {
        $db = DB::connection()->getDatabaseName();
        if (! str_ends_with((string) $db, '_gladi')) {
            $this->error("Ditolak: database \"{$db}\" bukan salinan gladi (harus berakhiran _gladi).");
            return self::FAILURE;
        }
        $this->line("Database: {$db}");

        $admin = User::where('role', 'admin')->first();
        $kepsek = User::where('role', 'kepsek')->first();
        $guru = User::where('role', 'guru')->orderBy('name')->get();
        $lama = MasterPeriode::where('status_aktif', 'AKTIF')->first();
        if (! $admin || ! $lama) {
            $this->error('Butuh akun admin dan semester aktif.');
            return self::FAILURE;
        }
        $this->line("Semester aktif: {$lama->tahun_ajaran} {$lama->semester} ({$lama->id_periode})");

        // ===== SEBELUM =====
        $this->judul('Daftar periksa (seperti di layar wizard)');
        [$s, $periksa] = $this->panggil($admin, 'GET', '/semester/tutup');
        $this->cek($s === 200, "daftar periksa terbuka ({$s})");
        foreach ($periksa['periksa'] ?? [] as $i) {
            $this->line("   - [{$i['tingkat']}] {$i['judul']}" . (isset($i['rincian']) ? " ({$i['rincian']})" : ''));
        }
        if (empty($periksa['periksa'])) $this->line('   (tidak ada catatan)');
        $this->line('   Akan disalin: ' . json_encode($periksa['salin'] ?? null));

        $kelas = Classes::aktifSemester($lama->id_periode)->orderBy('nama_kelas')->get();
        $anggotaLama = $kelas->mapWithKeys(fn ($k) => [$k->id_kelas => $this->anggota($k->id_kelas, $lama->id_periode)]);
        $raporLama = [];
        foreach ($kelas as $k) {
            [$s, $r] = $this->panggil($admin, 'GET', "/rapor/data?id_kelas={$k->id_kelas}&id_periode={$lama->id_periode}");
            $raporLama[$k->id_kelas] = [$s, $this->sidik($r)];
        }
        $nilaiLama = DB::table('trans_nilai')->where('id_periode', $lama->id_periode)->count();
        $pengampuLama = $this->pengampu($lama->id_periode);
        $waliLama = Classes::pluck('wali_kelas', 'id_kelas')->all();
        $contohNilai = DB::table('trans_nilai')->where('id_periode', $lama->id_periode)->first();

        // ===== TUTUP SEMESTER =====
        $usulan = $periksa['usulan'] ?? [];
        $denganJadwal = ! $this->option('tanpa-jadwal');
        $this->judul('Menjalankan Tutup Semester (opsi bawaan' . ($denganJadwal ? ' + salin jadwal' : '') . ')');
        $mulai = microtime(true);
        [$s, $hasil] = $this->panggil($admin, 'POST', '/semester/tutup', array_filter([
            'id_periode_tujuan' => $usulan['id_periode'] ?? null,
            'tahun_ajaran' => $usulan['tahun_ajaran'] ?? null,
            'semester' => $usulan['semester'] ?? null,
            'tanggal_mulai' => $this->option('tanggal-mulai'),
            'tanggal_selesai' => $this->option('tanggal-selesai'),
        ]) + ['salin_rombel' => true, 'salin_pengampu' => true, 'salin_jadwal' => $denganJadwal, 'kunci_lama' => true, 'terapkan_kenaikan' => true]);
        $this->cek($s === 200, "Tutup Semester berhasil ({$s}) dalam " . round(microtime(true) - $mulai, 1) . ' detik');
        $this->line('   ' . ($hasil['message'] ?? json_encode($hasil)));
        $this->line('   Ringkasan: ' . json_encode($hasil['ringkasan'] ?? null));
        if ($s !== 200) return $this->selesai();

        // ===== SESUDAH =====
        $lama->refresh();
        $baru = MasterPeriode::where('status_aktif', 'AKTIF')->first();
        $naikTahun = $lama->semester === 'Genap';

        $this->judul('Periode');
        $this->cek(MasterPeriode::where('status_aktif', 'AKTIF')->count() === 1, 'tepat satu semester aktif');
        $this->cek(empty($usulan['id_periode']) ||$baru->id_periode === $usulan['id_periode'], "semester aktif sekarang {$baru->tahun_ajaran} {$baru->semester}");
        $this->cek($lama->status_aktif === 'TUTUP' && (bool) $lama->terkunci, 'semester lama TUTUP dan terkunci');
        [$awal, $akhir] = $baru->rentang();
        $this->line("   Rentang semester baru: {$awal->toDateString()} s.d. {$akhir->toDateString()}"
            . ($baru->tanggal_mulai ? '' : ' (PERKIRAAN: tanggal belum diisi di menu Periode)'));
        if (! $baru->tanggal_mulai) $this->peringatan('Tanggal semester baru belum diisi; isi di menu Periode atau di wizard sebelum menutup sungguhan.');

        $this->judul('Rombel, wali, pengampu');
        $kelasBaru = Classes::aktifSemester($baru->id_periode)->orderBy('nama_kelas')->get();
        if (! $naikTahun) {
            $this->cek($kelasBaru->pluck('id_kelas')->all() === $kelas->pluck('id_kelas')->all(), "rombel aktif sama dengan semester lama ({$kelasBaru->count()} kelas)");
        }
        foreach ($kelas as $k) {
            $a = $this->anggota($k->id_kelas, $lama->id_periode);
            $this->cek($a === $anggotaLama[$k->id_kelas], "{$k->nama_kelas}: anggota {$lama->semester} tetap (" . count($a) . ' siswa, dibaca dari riwayat)');
            if (! $naikTahun) {
                $b = $this->anggota($k->id_kelas, $baru->id_periode);
                $this->cek($b === $anggotaLama[$k->id_kelas], "{$k->nama_kelas}: anggota {$baru->semester} = {$lama->semester} (" . count($b) . ' siswa)');
            }
        }
        $this->cek(DB::table('siswa_rombel')->where('id_periode', $lama->id_periode)->count() === array_sum(array_map('count', $anggotaLama->all())), 'potret anggota rombel semester lama lengkap');
        $this->cek(DB::table('wali_kelas_periode')->where('id_periode', $lama->id_periode)->count() >= collect($waliLama)->filter()->count(), 'potret wali kelas semester lama tersimpan');
        if (! $naikTahun) {
            $this->cek(Classes::pluck('wali_kelas', 'id_kelas')->all() === $waliLama, 'wali kelas aktif tidak berubah');
            $this->cek($this->pengampu($baru->id_periode) === $pengampuLama, 'pembagian mengajar disalin sama (' . count($pengampuLama) . ' baris)');
        }
        $this->line('   Pengampu semester lama dibekukan: ' . DB::table('pengampu_mapel')->where('id_periode', $lama->id_periode)->count() . ' pasangan kelas×mapel');

        $this->judul('Jadwal semester baru');
        $sesi = DB::table('trans_jadwal')->where('id_periode', $baru->id_periode)->get(['mulai', 'id_kelas']);
        $this->line("   {$sesi->count()} sesi dibuat" . ($sesi->count() ? ' (' . $sesi->min('mulai') . ' s.d. ' . $sesi->max('mulai') . ')' : ''));
        if (! $sesi->count() && ($periksa['salin']['jadwal_seri'] ?? 0) === 0 && $denganJadwal) {
            $this->peringatan('Semester lama tidak punya pola jadwal berulang untuk disalin; buat jadwal semester baru lewat Peta Tema → Buat Jadwal atau menu Jadwal.');
        }
        $tgl = fn ($j) => Carbon::parse($j->mulai);
        $this->cek($sesi->filter(fn ($j) => HariLibur::namaPada($tgl($j)))->isEmpty(), 'tidak ada sesi di hari libur');
        $this->cek($sesi->filter(fn ($j) => $tgl($j)->isWeekend())->isEmpty(), 'tidak ada sesi Sabtu/Minggu');
        $this->cek($sesi->filter(fn ($j) => $tgl($j)->lt($awal) || $tgl($j)->gt($akhir))->isEmpty(), 'semua sesi di dalam rentang semester baru');
        $this->cek($sesi->groupBy(fn ($j) => $j->id_kelas . '|' . $j->mulai)->filter(fn ($g) => $g->count() > 1)->isEmpty(), 'tidak ada dua sesi kelas yang sama pada jam yang sama');

        $this->judul('Data semester lama utuh & terkunci');
        $this->cek(DB::table('trans_nilai')->where('id_periode', $lama->id_periode)->count() === $nilaiLama, "nilai semester lama tetap {$nilaiLama} baris");
        foreach ($kelas as $k) {
            [$s, $r] = $this->panggil($admin, 'GET', "/rapor/data?id_kelas={$k->id_kelas}&id_periode={$lama->id_periode}");
            $this->cek($s === $raporLama[$k->id_kelas][0] && $this->sidik($r) === $raporLama[$k->id_kelas][1], "{$k->nama_kelas}: data rapor sama persis seperti sebelum ditutup ({$s})");
        }
        if ($contohNilai) {
            // Guru pengampu mapel itu di semester lama, agar yang diuji memang kunci semester (bukan hak akses mapel)
            $idGuru = Pengampu::guru($contohNilai->id_kelas, $contohNilai->id_mapel, $lama->id_periode);
            $pengampu = User::where('role', 'guru')->where('id_guru', $idGuru)->first();
            if ($pengampu) {
                [$s] = $this->panggil($pengampu, 'POST', '/nilai/batch', [
                    'id_kelas' => $contohNilai->id_kelas, 'id_mapel' => $contohNilai->id_mapel, 'id_periode' => $lama->id_periode,
                    'id_jenis' => $contohNilai->id_jenis, 'id_materi' => $contohNilai->id_materi, 'tanggal' => substr($contohNilai->tanggal, 0, 10),
                    'records' => [['id_siswa' => $contohNilai->id_siswa, 'nilai' => 1]],
                ]);
                $this->cek($s === 423, "guru pengampu ({$pengampu->name}) tidak bisa mengubah nilai semester lama (status {$s})");
                $this->cek((float) DB::table('trans_nilai')->where('id_nilai', $contohNilai->id_nilai)->value('nilai') === (float) $contohNilai->nilai, 'nilai semester lama tidak berubah');
            } else {
                $this->line('   (lewati uji kunci: guru pengampu contoh nilai tidak punya akun)');
            }
        }

        $this->judul('Halaman penting setelah pindah semester');
        $p = $baru->id_periode;
        $k1 = $kelas->first()?->id_kelas;
        $daftar = array_filter([
            '/me', '/notifikasi', '/classes', '/nilai/filters', "/dashboard?id_periode={$p}&id_kelas=ALL", '/hari-ini', '/kenaikan',
            '/pantauan-kenaikan', '/analitik/lintas-semester', '/peringatan-dini', '/pengampu/saya', '/semester/tutup', "/laporan/stnkm?id_periode={$p}",
            "/jadwal?start={$awal->toDateString()}&end={$awal->copy()->addDays(6)->toDateString()}",
            $k1 ? "/presensi?id_kelas={$k1}&id_periode={$p}" : null, $k1 ? "/presensi?id_kelas={$k1}&id_periode={$lama->id_periode}" : null,
            $k1 ? "/nilai?id_kelas={$k1}&id_periode={$p}" : null, $k1 ? "/rapor/data?id_kelas={$k1}&id_periode={$p}" : null,
        ]);
        foreach (array_filter([$admin, $kepsek, ...$guru->all()]) as $u) {
            $gagal = [];
            foreach ($daftar as $uri) {
                [$s, $r] = $this->panggil($u, 'GET', $uri);
                // 403/422 = memang bukan haknya atau parameter tidak berlaku untuk peran itu; yang dicari galat server & rusak
                if ($s >= 500 || ($s >= 400 && ! in_array($s, [403, 422], true))) $gagal[] = "{$uri} → {$s} " . substr(json_encode($r['message'] ?? $r), 0, 160);
            }
            $this->cek(! $gagal, "{$u->role} {$u->name}: " . count($daftar) . ' halaman tanpa galat' . ($gagal ? "\n        " . implode("\n        ", $gagal) : ''));
        }
        $siswa1 = $anggotaLama->flatten()->first();
        if ($siswa1) {
            foreach ([$lama, $baru] as $per) {
                [$s, $r] = $this->panggil($admin, 'GET', "/portal/rapor?id_siswa={$siswa1}&id_periode={$per->id_periode}");
                $this->cek($s === 200, "dashboard pribadi siswa terbuka untuk {$per->tahun_ajaran} {$per->semester} ({$s})" . ($s !== 200 ? ' ' . json_encode($r['message'] ?? null) : ''));
            }
            [$s] = $this->panggil($admin, 'GET', "/siswa/{$siswa1}/rekam-jejak");
            $this->cek($s === 200, "rekam jejak siswa terbuka ({$s})");
        }

        return $this->selesai();
    }

    /** Panggil API seperti dari halaman (token Sanctum milik akun itu, dibuat di salinan). */
    private function panggil(User $u, string $method, string $uri, array $body = []): array
    {
        $this->token[$u->id] ??= $u->createToken('gladi')->plainTextToken;
        $req = Request::create('/api' . $uri, $method, [], [], [], [
            'HTTP_AUTHORIZATION' => 'Bearer ' . $this->token[$u->id], 'HTTP_ACCEPT' => 'application/json',
            'CONTENT_TYPE' => 'application/json', 'REMOTE_ADDR' => '127.0.0.1',
        ], $method === 'GET' ? null : json_encode($body));
        $kernel = app(HttpKernel::class);
        $res = $kernel->handle($req);
        $kernel->terminate($req, $res);
        app('auth')->forgetGuards();
        return [$res->getStatusCode(), json_decode($res->getContent(), true)];
    }

    private function anggota(string $idKelas, string $idPeriode): array
    {
        return RiwayatRombel::anggota($idKelas, $idPeriode)->orderBy('id_siswa')->pluck('id_siswa')->all();
    }

    private function pengampu(string $idPeriode): array
    {
        return DB::table('pengampu_mapel')->where('id_periode', $idPeriode)->orderBy('id_kelas')->orderBy('id_mapel')
            ->get(['id_kelas', 'id_mapel', 'id_guru'])->map(fn ($r) => "{$r->id_kelas}|{$r->id_mapel}|{$r->id_guru}")->all();
    }

    /** Sidik jari isi rapor tanpa bidang yang wajar berubah saat semester dikunci (status, waktu, tautan bertanda tangan). */
    private function sidik($v): string
    {
        $bersih = function ($v) use (&$bersih) {
            if (! is_array($v)) return $v;
            $o = [];
            foreach ($v as $k => $x) {
                if (is_string($k) && preg_match('/terkunci|dikunci_pada|status_aktif|updated_at|created_at|url|_pada$|waktu|token|kode/', $k)) continue;
                $o[$k] = $bersih($x);
            }
            return $o;
        };
        return md5(json_encode($bersih($v)));
    }

    private function judul(string $t): void
    {
        $this->newLine();
        $this->line("== {$t}");
    }

    private function cek(bool $ok, string $pesan): void
    {
        $this->line(($ok ? '  <info>OK</info>    ' : '  <error>GAGAL</error> ') . $pesan);
        if (! $ok) $this->masalah[] = $pesan;
    }

    private function peringatan(string $pesan): void
    {
        $this->line("  <comment>PERHATIAN</comment> {$pesan}");
    }

    private function selesai(): int
    {
        $this->newLine();
        if (! $this->masalah) {
            $this->info('== HASIL: semua pemeriksaan lulus. Tutup Semester aman dijalankan di data asli.');
            return self::SUCCESS;
        }
        $this->error('== HASIL: ' . count($this->masalah) . ' masalah — jangan tutup semester di data asli sebelum diperiksa.');
        foreach ($this->masalah as $m) $this->line(" - {$m}");
        return self::FAILURE;
    }
}

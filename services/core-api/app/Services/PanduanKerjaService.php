<?php

namespace App\Services;

use App\Models\Atp;
use App\Models\Classes;
use App\Models\KisiKisi;
use App\Models\MasterIndikator;
use App\Models\MasterMateri;
use App\Models\MasterPeriode;
use App\Models\ModulAjar;
use App\Models\PetaTema;
use App\Models\Student;
use App\Models\Subject;
use App\Models\Teacher;
use App\Models\TransCatatanWali;
use App\Models\TransDiagnostikNonkognitif;
use App\Models\TransJadwal;
use App\Models\TransJurnal;
use App\Models\TransNilai;
use App\Models\TransPresensi;
use App\Models\TransRencanaRemedial;
use Carbon\Carbon;
use Illuminate\Support\Collection;

/**
 * Peta kerja guru: alur kerja satu semester (persiapan → rutin mingguan → akhir semester) dengan progres nyata dari data,
 * agar guru tahu harus mulai dari mana, sudah sampai mana, dan apa langkah berikutnya.
 *
 * "Unit ajar" = pasangan mapel–kelas yang diampu guru pada semester aktif (dari jadwal, ATP, atau materi).
 * Status langkah: selesai | proses | menunggu (diajukan ke kepala sekolah) | belum | opsional.
 */
class PanduanKerjaService
{
    private const HARI_RUTIN = 14; // jendela langkah rutin

    private Carbon $sekarang;
    private ?MasterPeriode $periode;
    private array $mapel;      // id_mapel => nama
    private array $kelasBinaan; // id_kelas
    private Collection $unit;  // [{id_mapel, id_kelas, mapel, kelas}]

    public function __construct(private Teacher $guru)
    {
        $this->sekarang = now(config('app.zona_sekolah'));
        $this->periode = MasterPeriode::where('status_aktif', 'AKTIF')->first();
        $this->mapel = Subject::where('id_guru', $guru->id_guru)->orderBy('nama_mapel')->pluck('nama_mapel', 'id_mapel')->all();
        // Rombel yang dinonaktifkan admin untuk semester aktif tidak masuk peta kerja
        $this->kelasBinaan = Classes::where('wali_kelas', $guru->id_guru)->aktifSemester($this->periode?->id_periode)->pluck('id_kelas')->all();
        $this->unit = $this->unitAjar();
    }

    public function hitung(): array
    {
        $tahap = [
            ['id' => 'persiapan', 'label' => 'Persiapan semester', 'ikon' => 'bi-diagram-3',
                'keterangan' => 'Dikerjakan di awal semester, sekali untuk tiap mapel–kelas.',
                'langkah' => array_values(array_filter([
                    $this->langkahTp(), $this->langkahAtp(), $this->langkahJadwal(), $this->langkahModul(),
                    $this->langkahDiagnostik(), $this->langkahPetaTema(), $this->langkahKisi(),
                ]))],
            ['id' => 'rutin', 'label' => 'Rutin mingguan', 'ikon' => 'bi-arrow-repeat',
                'keterangan' => 'Dikerjakan terus selama semester berjalan (dihitung ' . self::HARI_RUTIN . ' hari terakhir).',
                'langkah' => array_values(array_filter([
                    $this->langkahPresensi(), $this->langkahSesi(), $this->langkahJurnal(), $this->langkahNilai(), $this->langkahTindakLanjut(),
                ]))],
            ['id' => 'akhir', 'label' => 'Akhir semester', 'ikon' => 'bi-flag',
                'keterangan' => 'Menjelang pembagian rapor.',
                'langkah' => array_values(array_filter([$this->langkahCatatanWali(), $this->langkahRapor()]))],
        ];

        // Persen keseluruhan: rata-rata kemajuan langkah wajib
        $wajib = collect($tahap)->flatMap(fn($t) => $t['langkah'])->filter(fn($l) => $l['wajib']);
        $persen = $wajib->isEmpty() ? 0 : (int) round($wajib->avg(fn($l) => $this->rasio($l)) * 100);

        // Langkah berikutnya: wajib pertama yang belum selesai (yang menunggu persetujuan dilewati)
        $berikutnya = $wajib->first(fn($l) => in_array($l['status'], ['belum', 'proses']));

        [$mulai, $selesai] = $this->periode ? $this->periode->rentang() : [null, null];
        $mingguKe = $mulai ? max(1, (int) floor($mulai->diffInDays($this->sekarang, false) / 7) + 1) : null;
        $jumlahMinggu = $mulai ? (int) ceil($mulai->diffInDays($selesai) / 7) : null;

        return [
            'guru' => ['id_guru' => $this->guru->id_guru, 'nama' => $this->guru->nama_guru],
            'periode' => $this->periode ? [
                'id_periode' => $this->periode->id_periode, 'nama' => "{$this->periode->tahun_ajaran} {$this->periode->semester}",
                'minggu_ke' => $mingguKe, 'jumlah_minggu' => $jumlahMinggu,
            ] : null,
            'mapel' => array_values($this->mapel),
            'kelas_binaan' => Classes::whereIn('id_kelas', $this->kelasBinaan)->pluck('nama_kelas')->all(),
            'unit' => $this->unit->map(fn($u) => "{$u['mapel']} · {$u['kelas']}")->values()->all(),
            'persen' => $persen,
            'berikutnya' => $berikutnya,
            'tahap' => $tahap,
            'dihitung_pada' => $this->sekarang->toIso8601String(),
        ];
    }

    private function rasio(array $l): float
    {
        if ($l['status'] === 'selesai') return 1;
        if ($l['total'] > 0) return min(1, $l['selesai'] / $l['total']);
        return in_array($l['status'], ['proses', 'menunggu']) ? 0.5 : 0;
    }

    private function langkah(string $id, string $judul, string $tujuan, int $selesai, int $total, string $info, string $tautan, string $tombol, array $lain = []): array
    {
        $status = $lain['status'] ?? ($total > 0 && $selesai >= $total ? 'selesai' : ($selesai > 0 ? 'proses' : 'belum'));
        return [
            'id' => $id, 'judul' => $judul, 'tujuan' => $tujuan, 'status' => $status, 'selesai' => $selesai, 'total' => $total,
            'info' => $info, 'tautan' => $tautan, 'tombol' => $tombol, 'wajib' => $lain['wajib'] ?? true, 'rincian' => $lain['rincian'] ?? [],
        ];
    }

    /** Pasangan mapel–kelas semester aktif. */
    private function unitAjar(): Collection
    {
        if (!$this->mapel) return collect();
        $idMapel = array_keys($this->mapel);
        $p = $this->periode?->id_periode;
        $pasang = collect()
            ->merge(TransJadwal::whereIn('id_mapel', $idMapel)->whereNotNull('id_kelas')->when($p, fn($q) => $q->where('id_periode', $p))->distinct()->get(['id_mapel', 'id_kelas'])->toArray())
            ->merge(Atp::whereIn('id_mapel', $idMapel)->whereNotNull('id_kelas')->when($p, fn($q) => $q->where('id_periode', $p))->distinct()->get(['id_mapel', 'id_kelas'])->toArray())
            ->merge(MasterMateri::whereIn('id_mapel', $idMapel)->whereNotNull('id_kelas')->when($p, fn($q) => $q->where(fn($w) => $w->where('id_periode', $p)->orWhereNull('id_periode')))->distinct()->get(['id_mapel', 'id_kelas'])->toArray())
            ->unique(fn($x) => "{$x['id_mapel']}|{$x['id_kelas']}");
        $kelas = Classes::whereIn('id_kelas', $pasang->pluck('id_kelas'))->aktifSemester($p)->pluck('nama_kelas', 'id_kelas');
        return $pasang->filter(fn($x) => isset($kelas[$x['id_kelas']]))
            ->map(fn($x) => $x + ['mapel' => $this->mapel[$x['id_mapel']], 'kelas' => $kelas[$x['id_kelas']]])
            ->sortBy(fn($x) => "{$x['mapel']} {$x['kelas']}")->values();
    }

    private function kunci(array $x): string { return "{$x['id_mapel']}|{$x['id_kelas']}"; }

    /** Daftar unit dengan tanda ok/belum untuk rincian. */
    private function rincianUnit(callable $ok, ?callable $catatan = null): array
    {
        return $this->unit->map(fn($u) => ['label' => "{$u['mapel']} · {$u['kelas']}", 'ok' => (bool) $ok($u), 'catatan' => $catatan ? $catatan($u) : null])->values()->all();
    }

    private function tanpaUnit(string $id, string $judul, string $tujuan, string $tautan, string $tombol): ?array
    {
        if ($this->unit->isNotEmpty()) return null;
        $info = $this->mapel
            ? 'Belum ada kelas untuk mapel Anda di semester ini. Mulai dengan menyusun Materi & TP (pilih kelasnya) atau ATP.'
            : 'Akun Anda belum terhubung ke mata pelajaran mana pun. Minta admin mengisi guru pengampu di menu Mata Pelajaran.';
        return $this->langkah($id, $judul, $tujuan, 0, 0, $info, $tautan, $tombol);
    }

    // ===================== PERSIAPAN =====================

    private function langkahTp(): array
    {
        $judul = 'Materi & Tujuan Pembelajaran (TP)';
        $tujuan = 'TP adalah dasar semuanya: ATP, modul, soal, dan nilai memakai TP ini.';
        if ($kosong = $this->tanpaUnit('tp', $judul, $tujuan, '/dashboard/master-materi', 'Buka Materi')) return $kosong;
        $p = $this->periode?->id_periode;
        $ada = MasterMateri::whereIn('id_mapel', array_keys($this->mapel))
            ->when($p, fn($q) => $q->where(fn($w) => $w->where('id_periode', $p)->orWhereNull('id_periode')))
            ->whereIn('id_materi', MasterIndikator::where('aktif', true)->select('id_materi'))
            ->get(['id_mapel', 'id_kelas'])->map(fn($m) => "{$m->id_mapel}|{$m->id_kelas}")->unique()->flip();
        $n = $this->unit->filter(fn($u) => isset($ada[$this->kunci($u)]))->count();
        return $this->langkah('tp', $judul, $tujuan, $n, $this->unit->count(),
            "{$n} dari {$this->unit->count()} mapel–kelas sudah punya materi dengan TP aktif.", '/dashboard/master-materi', 'Buka Materi',
            ['rincian' => $this->rincianUnit(fn($u) => isset($ada[$this->kunci($u)]))]);
    }

    private function langkahAtp(): array
    {
        $judul = 'Alur Tujuan Pembelajaran (ATP)';
        $tujuan = 'Urutan TP selama semester, lengkap dengan alokasi JP; disetujui kepala sekolah. Prota & Promes dibentuk dari ATP.';
        if ($kosong = $this->tanpaUnit('atp', $judul, $tujuan, '/dashboard/perangkat-ajar', 'Buka ATP')) return $kosong;
        $atp = Atp::whereIn('id_mapel', array_keys($this->mapel))->when($this->periode, fn($q) => $q->where('id_periode', $this->periode->id_periode))
            ->get(['id_mapel', 'id_kelas', 'status'])->groupBy(fn($a) => "{$a->id_mapel}|{$a->id_kelas}");
        $status = fn($u) => ($atp[$this->kunci($u)] ?? collect())->pluck('status');
        $ok = $this->unit->filter(fn($u) => $status($u)->contains('DISETUJUI'))->count();
        $diajukan = $this->unit->filter(fn($u) => !$status($u)->contains('DISETUJUI') && $status($u)->contains('DIAJUKAN'))->count();
        $revisi = $this->unit->filter(fn($u) => !$status($u)->contains('DISETUJUI') && $status($u)->contains('REVISI'))->count();
        $total = $this->unit->count();
        $info = "{$ok} dari {$total} disetujui" . ($diajukan ? ", {$diajukan} menunggu persetujuan" : '') . ($revisi ? ", {$revisi} perlu direvisi" : '') . '.';
        $lain = ['rincian' => $this->rincianUnit(fn($u) => $status($u)->contains('DISETUJUI'), fn($u) => $status($u)->isEmpty() ? 'belum dibuat' : strtolower($status($u)->first()))];
        if ($ok < $total && $ok + $diajukan >= $total && !$revisi) $lain['status'] = 'menunggu';
        return $this->langkah('atp', $judul, $tujuan, $ok, $total, $info, $revisi ? '/dashboard/perangkat-ajar?status=REVISI' : '/dashboard/perangkat-ajar', $revisi ? 'Revisi ATP' : 'Buka ATP', $lain);
    }

    private function langkahJadwal(): array
    {
        $judul = 'Jadwal mengajar semester';
        $tujuan = 'Sesi mengajar di kalender. Paling cepat: "Paket dari Promes" mengisi seluruh semester dengan TP yang sudah tertaut.';
        if ($kosong = $this->tanpaUnit('jadwal', $judul, $tujuan, '/dashboard/jadwal', 'Buka Jadwal')) return $kosong;
        $sesi = TransJadwal::whereIn('id_mapel', array_keys($this->mapel))->where('status_sesi', '!=', 'Batal')
            ->when($this->periode, fn($q) => $q->where('id_periode', $this->periode->id_periode))
            ->where('mulai', '>=', $this->sekarang->copy()->startOfDay()->format('Y-m-d H:i:s'))
            ->get(['id_mapel', 'id_kelas'])->countBy(fn($s) => "{$s->id_mapel}|{$s->id_kelas}");
        $n = $this->unit->filter(fn($u) => ($sesi[$this->kunci($u)] ?? 0) > 0)->count();
        $total = $this->unit->count();
        return $this->langkah('jadwal', $judul, $tujuan, $n, $total,
            "{$n} dari {$total} mapel–kelas punya sesi ke depan (" . $sesi->sum() . ' sesi).', '/dashboard/jadwal', 'Buka Jadwal',
            ['rincian' => $this->rincianUnit(fn($u) => ($sesi[$this->kunci($u)] ?? 0) > 0, fn($u) => ($sesi[$this->kunci($u)] ?? 0) . ' sesi ke depan')]);
    }

    private function langkahModul(): array
    {
        $judul = 'Modul ajar';
        $tujuan = 'Rencana pembelajaran mendalam per TP/materi dari ATP; disetujui kepala sekolah lalu ditautkan ke sesi jadwal.';
        if ($kosong = $this->tanpaUnit('modul', $judul, $tujuan, '/dashboard/perangkat-ajar?tab=modul', 'Buka Modul')) return $kosong;
        $modul = ModulAjar::whereIn('id_mapel', array_keys($this->mapel))->when($this->periode, fn($q) => $q->where('id_periode', $this->periode->id_periode))
            ->get(['id_mapel', 'id_kelas', 'status'])->groupBy(fn($m) => "{$m->id_mapel}|{$m->id_kelas}");
        $st = fn($u) => ($modul[$this->kunci($u)] ?? collect())->pluck('status');
        $ok = $this->unit->filter(fn($u) => $st($u)->contains('DISETUJUI'))->count();
        $ada = $this->unit->filter(fn($u) => $st($u)->isNotEmpty())->count();
        $total = $this->unit->count();
        $jumlah = $modul->flatten()->count();
        $lain = ['rincian' => $this->rincianUnit(fn($u) => $st($u)->contains('DISETUJUI'), fn($u) => $st($u)->count() . ' modul, ' . $st($u)->filter(fn($s) => $s === 'DISETUJUI')->count() . ' disetujui')];
        if ($ok < $total && $ada >= $total) $lain['status'] = $modul->flatten()->contains('status', 'DIAJUKAN') ? 'menunggu' : 'proses';
        return $this->langkah('modul', $judul, $tujuan, $ok, $total,
            "{$jumlah} modul; {$ok} dari {$total} mapel–kelas sudah punya modul disetujui.", '/dashboard/perangkat-ajar?tab=modul', 'Buka Modul', $lain);
    }

    private function siswaBinaan(): Collection
    {
        return Student::whereIn('id_kelas', $this->kelasBinaan)->pluck('id_siswa');
    }

    private function langkahDiagnostik(): ?array
    {
        if (!$this->kelasBinaan || !$this->periode) return null;
        $siswa = $this->siswaBinaan();
        $n = TransDiagnostikNonkognitif::where('id_periode', $this->periode->id_periode)->whereIn('id_siswa', $siswa)->count();
        return $this->langkah('diagnostik', 'Asesmen diagnostik siswa (wali kelas)',
            'Gaya belajar, minat, dan kondisi tiap siswa di awal semester untuk pembelajaran berdiferensiasi.',
            $n, $siswa->count(), "{$n} dari {$siswa->count()} siswa kelas binaan sudah diisi.", '/dashboard/diagnostik', 'Isi Diagnostik');
    }

    private function langkahPetaTema(): ?array
    {
        if (!$this->kelasBinaan) return null;
        $peta = PetaTema::whereIn('id_kelas', $this->kelasBinaan)->when($this->periode, fn($q) => $q->where('id_periode', $this->periode->id_periode))->pluck('status');
        $info = $peta->isEmpty() ? 'Belum ada peta tema untuk kelas binaan semester ini.'
            : $peta->count() . ' peta tema; ' . $peta->filter(fn($s) => $s === 'DISETUJUI')->count() . ' disetujui.';
        $status = $peta->contains('DISETUJUI') ? 'selesai' : ($peta->contains('DIAJUKAN') ? 'menunggu' : ($peta->isNotEmpty() ? 'proses' : 'opsional'));
        return $this->langkah('peta_tema', 'Peta Tema PBPM (spider web)', 'Tema lintas mapel untuk kelas binaan, dengan pola mingguan Realita → Imajinasi → Makna → Produk.',
            0, 0, $info, '/dashboard/perangkat-ajar?tab=tema', 'Buka Peta Tema', ['status' => $status, 'wajib' => false]);
    }

    private function langkahKisi(): ?array
    {
        if ($this->unit->isEmpty()) return null;
        $kisi = KisiKisi::whereIn('id_mapel', array_keys($this->mapel))->when($this->periode, fn($q) => $q->where('id_periode', $this->periode->id_periode))
            ->get(['id_mapel', 'id_kelas'])->map(fn($k) => "{$k->id_mapel}|{$k->id_kelas}")->unique()->flip();
        $n = $this->unit->filter(fn($u) => isset($kisi[$this->kunci($u)]))->count();
        return $this->langkah('kisi', 'Kisi-kisi & bank soal', 'Untuk asesmen sumatif dan tes online; soal tersambung ke TP.',
            $n, $this->unit->count(), "{$n} dari {$this->unit->count()} mapel–kelas punya kisi-kisi.", '/dashboard/bank-soal', 'Buka Bank Soal',
            ['wajib' => false, 'status' => $n ? ($n >= $this->unit->count() ? 'selesai' : 'proses') : 'opsional']);
    }

    // ===================== RUTIN =====================

    private function awalRutin(): Carbon
    {
        $awal = $this->sekarang->copy()->subDays(self::HARI_RUTIN)->startOfDay();
        $mulai = $this->periode?->rentang()[0];
        if ($mulai && $mulai->lte($this->sekarang)) $awal = $awal->max($mulai);
        return $awal;
    }

    private function langkahPresensi(): ?array
    {
        if (!$this->kelasBinaan) return null;
        $awal = $this->awalRutin();
        $hari = TransJadwal::whereIn('id_kelas', $this->kelasBinaan)->where('status_sesi', '!=', 'Batal')
            ->whereBetween('mulai', [$awal->format('Y-m-d H:i:s'), $this->sekarang->format('Y-m-d H:i:s')])
            ->get(['id_kelas', 'mulai'])->map(fn($s) => $s->id_kelas . '|' . $s->mulai->toDateString())->unique();
        $sudah = TransPresensi::whereIn('id_kelas', $this->kelasBinaan)->whereDate('tanggal', '>=', $awal->toDateString())->whereDate('tanggal', '<=', $this->sekarang->toDateString())
            ->get(['id_kelas', 'tanggal'])->map(fn($p) => $p->id_kelas . '|' . Carbon::parse($p->tanggal)->toDateString())->unique()->flip();
        $n = $hari->filter(fn($k) => isset($sudah[$k]))->count();
        $info = $hari->isEmpty() ? 'Belum ada hari bersekolah (sesi jadwal) kelas binaan dalam ' . self::HARI_RUTIN . ' hari terakhir.'
            : "{$n} dari {$hari->count()} hari sekolah kelas binaan sudah dipresensi.";
        return $this->langkah('presensi', 'Presensi harian kelas binaan', 'Setiap hari sekolah; dasar rekap kehadiran, pembinaan, dan rapor.',
            $n, $hari->count(), $info, '/dashboard/presensi', 'Isi Presensi', $hari->isEmpty() ? ['status' => 'opsional', 'wajib' => false] : []);
    }

    private function sesiLalu(): Collection
    {
        if (!$this->mapel) return collect();
        return TransJadwal::whereIn('id_mapel', array_keys($this->mapel))->where('status_sesi', '!=', 'Batal')
            ->where('mulai', '>=', $this->awalRutin()->format('Y-m-d H:i:s'))->where('selesai', '<', $this->sekarang->format('Y-m-d H:i:s'))
            ->where(fn($q) => $q->whereNull('judul')->orWhere('judul', 'not like', 'Remedial ·%'))
            ->get(['id_jadwal', 'id_mapel', 'id_kelas', 'id_materi', 'mulai', 'status_sesi']);
    }

    private function langkahSesi(): ?array
    {
        $sesi = $this->sesiLalu();
        if ($this->unit->isEmpty()) return null;
        $n = $sesi->where('status_sesi', 'Selesai')->count();
        $info = $sesi->isEmpty() ? 'Belum ada sesi mengajar yang lewat dalam ' . self::HARI_RUTIN . ' hari terakhir.'
            : "{$n} dari {$sesi->count()} sesi yang sudah lewat ditandai Selesai.";
        return $this->langkah('sesi', 'Tutup sesi mengajar', 'Tandai sesi Selesai (atau Batal) setelah mengajar, agar rekap pembelajaran dan Promes akurat.',
            $n, $sesi->count(), $info, '/dashboard/jadwal', 'Buka Jadwal', $sesi->isEmpty() ? ['status' => 'opsional', 'wajib' => false] : []);
    }

    private function langkahJurnal(): ?array
    {
        if ($this->unit->isEmpty() && !$this->kelasBinaan) return null;
        $n = TransJurnal::where(fn($q) => $q->where('id_guru', $this->guru->id_guru))
            ->whereDate('tanggal', '>=', $this->awalRutin()->toDateString())->whereDate('tanggal', '<=', $this->sekarang->toDateString())->count();
        return $this->langkah('jurnal', 'Jurnal kejadian siswa', 'Catat perkembangan, kejadian, dan pembinaan siswa; menjadi bahan deskripsi rapor.',
            0, 0, $n ? "{$n} catatan jurnal dalam " . self::HARI_RUTIN . ' hari terakhir.' : 'Belum ada catatan jurnal dalam ' . self::HARI_RUTIN . ' hari terakhir.',
            '/dashboard/jurnal', 'Buka Jurnal', ['wajib' => false, 'status' => $n ? 'selesai' : 'opsional']);
    }

    /** TP/materi yang sudah diajarkan (sesi lewat dengan materi) vs yang sudah punya nilai di kelas itu. */
    private function langkahNilai(): ?array
    {
        if ($this->unit->isEmpty() || !$this->periode) return null;
        $diajar = TransJadwal::whereIn('id_mapel', array_keys($this->mapel))->where('id_periode', $this->periode->id_periode)
            ->where('status_sesi', '!=', 'Batal')->whereNotNull('id_materi')->whereNotNull('id_kelas')
            ->where('selesai', '<', $this->sekarang->format('Y-m-d H:i:s'))
            ->get(['id_materi', 'id_kelas'])->map(fn($s) => "{$s->id_materi}|{$s->id_kelas}")->unique();
        $dinilai = TransNilai::efektif()->where('id_periode', $this->periode->id_periode)->whereIn('id_mapel', array_keys($this->mapel))
            ->get(['id_materi', 'id_kelas'])->map(fn($n) => "{$n->id_materi}|{$n->id_kelas}")->unique()->flip();
        if ($diajar->isEmpty()) {
            $n = $dinilai->count();
            return $this->langkah('nilai', 'Input nilai per TP', 'Nilai STNKM tiap TP yang sudah diajarkan; dasar rapor dan remedial.',
                $n ? 1 : 0, 1, $n ? "{$n} materi–kelas sudah dinilai." : 'Belum ada nilai semester ini. Sesi jadwal yang ditautkan ke materi akan dihitung otomatis di sini.',
                '/dashboard/nilai', 'Input Nilai', ['status' => $n ? 'proses' : 'belum']);
        }
        $n = $diajar->filter(fn($k) => isset($dinilai[$k]))->count();
        return $this->langkah('nilai', 'Input nilai per TP', 'Nilai STNKM tiap TP yang sudah diajarkan; dasar rapor dan remedial.',
            $n, $diajar->count(), "{$n} dari {$diajar->count()} materi yang sudah diajarkan sudah dinilai.", '/dashboard/nilai', 'Input Nilai');
    }

    private function langkahTindakLanjut(): ?array
    {
        if (!$this->mapel || !$this->periode) return null;
        $idMapel = array_keys($this->mapel);
        $kkm = Subject::whereIn('id_mapel', $idMapel)->pluck('kkm', 'id_mapel');
        $bawah = TransNilai::efektif()->where('id_periode', $this->periode->id_periode)->whereIn('id_mapel', $idMapel)
            ->get(['id_nilai', 'id_mapel', 'nilai'])->filter(fn($n) => (float) $n->nilai < (float) ($kkm[$n->id_mapel] ?? 75));
        $punyaRencana = TransRencanaRemedial::whereIn('id_nilai_asal', $bawah->pluck('id_nilai'))->pluck('id_nilai_asal')->unique()->flip();
        $terlambat = TransRencanaRemedial::where('status', 'DIRENCANAKAN')->whereIn('id_mapel', $idMapel)
            ->where('tanggal_rencana', '<', $this->sekarang->toDateString())->count();
        $n = $bawah->filter(fn($b) => isset($punyaRencana[$b->id_nilai]))->count();
        $info = $bawah->isEmpty() ? 'Tidak ada nilai di bawah KKM.' : "{$n} dari {$bawah->count()} nilai di bawah KKM sudah punya rencana tindak lanjut.";
        if ($terlambat) $info .= " {$terlambat} rencana remedial lewat tanggal.";
        $lain = $bawah->isEmpty() ? ['status' => 'selesai'] : [];
        if ($terlambat && $n >= $bawah->count()) $lain['status'] = 'proses';
        return $this->langkah('tindak_lanjut', 'Tindak lanjut & remedial', 'Nilai di bawah KKM dibuatkan rencana (remedial, pengayaan, pendampingan) lalu dinilai ulang.',
            $n, $bawah->count(), $info, '/dashboard/notifikasi', 'Lihat yang perlu ditindaklanjuti', $lain);
    }

    // ===================== AKHIR SEMESTER =====================

    private function langkahCatatanWali(): ?array
    {
        if (!$this->kelasBinaan || !$this->periode) return null;
        $siswa = $this->siswaBinaan();
        $n = TransCatatanWali::where('id_periode', $this->periode->id_periode)->whereIn('id_siswa', $siswa)->count();
        return $this->langkah('catatan_wali', 'Catatan wali kelas di rapor', 'Catatan perkembangan tiap siswa kelas binaan yang tampil di rapor.',
            $n, $siswa->count(), "{$n} dari {$siswa->count()} siswa sudah diberi catatan.", '/dashboard/rapor', 'Buka Rapor');
    }

    private function langkahRapor(): ?array
    {
        if ($this->unit->isEmpty()) return null;
        return $this->langkah('rapor', 'Periksa rapor & laporan STNKM', 'Cek deskripsi capaian tiap siswa sebelum rapor dicetak.',
            0, 0, 'Buka rapor/STNKM untuk memeriksa capaian siswa di mapel Anda.', '/dashboard/laporan-stnkm', 'Buka STNKM', ['status' => 'opsional', 'wajib' => false]);
    }
}

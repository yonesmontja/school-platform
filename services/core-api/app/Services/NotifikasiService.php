<?php

namespace App\Services;

use App\Models\Atp;
use App\Models\ModulAjar;
use App\Models\BankSoal;
use App\Models\Classes;
use App\Models\LogAktivitas;
use App\Models\MasterPeriode;
use App\Models\Student;
use App\Models\TransCatatanWali;
use App\Models\TransDiagnostikNonkognitif;
use App\Models\TransJadwal;
use App\Models\TransNilai;
use App\Models\TransPresensi;
use App\Models\TransRencanaRemedial;
use App\Models\User;
use App\Services\PesanService;
use Carbon\Carbon;
use Illuminate\Support\Collection;

/**
 * Pusat notifikasi "Perlu Tindakan". Notifikasi dihitung dari data saat diminta, disesuaikan dengan peran:
 * - guru: remedial terlambat/terdekat, nilai di bawah KKM tanpa tindak lanjut, jadwal hari ini & sesi yang belum
 *   ditutup, presensi kelas binaan, catatan wali kelas;
 * - admin & kepsek: rekap remedial terlambat, nilai belum ditindaklanjuti, kelas belum presensi, login gagal (admin);
 * - siswa & orang tua: jadwal & hasil remedial anak, ketidakhadiran tanpa keterangan.
 * Setiap item: kunci (berubah bila isinya berubah), tingkat, kategori, ikon, judul, pesan, jumlah, tautan, waktu.
 */
class NotifikasiService
{
    // Kolom nilai yang menentukan satu lembar Input Nilai (untuk tautan langsung)
    private const KOLOM_LEMBAR = 'id_nilai,id_siswa,id_kelas,id_mapel,id_periode,id_jenis,id_materi,tanggal';

    private Carbon $sekarang;
    private string $hariIni;
    private ?string $periode;

    public function __construct(private User $user)
    {
        $this->sekarang = now(config('app.zona_sekolah'));
        $this->hariIni = $this->sekarang->toDateString();
        $this->periode = MasterPeriode::where('status_aktif', 'AKTIF')->value('id_periode');
    }

    public function semua(): Collection
    {
        $u = $this->user;
        $item = collect();

        if ($u->isPortal()) {
            $item = $item->merge($this->untukPortal());
            $item = $item->merge($this->pesanBaru());
        } else {
            $mapel = $u->isPengelola() ? null : $u->mapelDiampu(); // null = semua mapel
            if ($u->isPengelola() || $mapel) {
                $item = $item->merge($this->remedial($mapel))->merge($this->belumTindakLanjut($mapel));
            }
            if ($u->id_guru) $item = $item->merge($this->jadwalGuru());
            if ($kelas = $u->kelasBinaan()) $item = $item->merge($this->kelasBinaan($kelas));
            if ($u->isPengelola()) $item = $item->merge($this->presensiSekolah());
            if ($u->isAdmin() || $u->isKepsek() || $u->kelasBinaan()) $item = $item->merge($this->kenaikan($u));
            if ($u->isAdmin() || $u->isKepsek()) $item = $item->merge($this->raporSahkan());
            if ($u->isAdmin()) $item = $item->merge($this->loginGagal());
            $item = $item->merge($this->bankSoal());
            $item = $item->merge($this->atp());
            $item = $item->merge($this->pembinaanPresensi());
            if ($u->isPengelola() || $u->kelasBinaan()) $item = $item->merge($this->peringatanDini());
            if ($u->isAdmin() || $u->isKepsek() || $u->kelasBinaan()) $item = $item->merge($this->pesanBaru());
            if (!$u->isPeninjau() && $u->bolehAdministrasi('SPMB')) $item = $item->merge($this->spmb());
            if (!$u->isPeninjau() && $u->bolehAdministrasi('KEUANGAN')) $item = $item->merge($this->keuangan());
            if (!$u->isPeninjau() && $u->bolehAdministrasi('SURAT')) $item = $item->merge($this->surat($u));
            if (!$u->isPeninjau() && $u->bolehAdministrasi('INVENTARIS')) $item = $item->merge($this->inventaris($u));
            if (!$u->isPeninjau()) $item = $item->merge($this->disposisiSaya($u));
        }

        $urutan = ['danger' => 0, 'warning' => 1, 'info' => 2, 'success' => 3];
        return $item->sortBy([fn($a, $b) => $urutan[$a['tingkat']] <=> $urutan[$b['tingkat']], fn($a, $b) => strcmp($b['waktu'], $a['waktu'])])->values();
    }

    private function buat(string $jenis, array $isiKunci, array $data): array
    {
        return $data + [
            'kunci' => $jenis . ':' . substr(md5(json_encode($isiKunci)), 0, 16),
            'jenis' => $jenis,
            'jumlah' => null,
            'waktu' => $this->sekarang->toIso8601String(),
        ];
    }

    private static function daftarNama(Collection $nama, int $maks = 4): string
    {
        $unik = $nama->filter()->unique()->values();
        return $unik->take($maks)->implode(', ') . ($unik->count() > $maks ? ', dan ' . ($unik->count() - $maks) . ' lainnya' : '');
    }

    /** "Kelas 4A, 4B" — tanpa mengulang kata "Kelas" bila sudah ada di namanya. */
    private static function daftarKelas(Collection $nama, int $maks = 4): string
    {
        $daftar = self::daftarNama($nama, $maks);
        return str_starts_with(mb_strtolower($daftar), 'kelas') ? $daftar : "Kelas {$daftar}";
    }

    private function tanggal(string $tgl): string
    {
        return Carbon::parse($tgl)->locale('id')->translatedFormat('l, j F');
    }

    // ===== STAF =====

    private function remedial(?array $mapel): array
    {
        $rencana = TransRencanaRemedial::with(['siswa:id_siswa,nama_siswa', 'mapel:id_mapel,nama_mapel', 'nilaiAsal:' . self::KOLOM_LEMBAR])
            ->where('status', 'DIRENCANAKAN')
            ->when($mapel !== null, fn($q) => $q->whereIn('id_mapel', $mapel))
            ->where('tanggal_rencana', '<=', $this->sekarang->copy()->addDay()->toDateString())
            ->orderBy('tanggal_rencana')->get();

        $hasil = [];
        $terlambat = $rencana->filter(fn($r) => $r->tanggal_rencana->toDateString() < $this->hariIni);
        if ($terlambat->isNotEmpty()) {
            $hasil[] = $this->buat('remedial-terlambat', $terlambat->pluck('id_rencana')->all(), [
                'tingkat' => 'danger', 'kategori' => 'Remedial', 'ikon' => 'bi-alarm',
                'judul' => "{$terlambat->count()} rencana remedial lewat tanggal",
                'pesan' => 'Belum ada nilai remedial untuk ' . self::daftarNama($terlambat->map(fn($r) => $r->siswa?->nama_siswa))
                    . ' (' . self::daftarNama($terlambat->map(fn($r) => $r->mapel?->nama_mapel), 3) . '). Isi nilainya lewat mode Remedial di Input Nilai, atau jadwalkan ulang.',
                'jumlah' => $terlambat->count(), 'tautan' => self::tautanNilai($terlambat->pluck('nilaiAsal'), true),
                'waktu' => $terlambat->first()->tanggal_rencana->toDateString() . 'T00:00:00',
            ]);
        }
        foreach ($rencana->diff($terlambat)->groupBy(fn($r) => $r->tanggal_rencana->toDateString()) as $tgl => $grup) {
            $hariIni = $tgl === $this->hariIni;
            $hasil[] = $this->buat('remedial-jadwal', [$tgl, $grup->pluck('id_rencana')->all()], [
                'tingkat' => $hariIni ? 'warning' : 'info', 'kategori' => 'Remedial', 'ikon' => 'bi-life-preserver',
                'judul' => ($hariIni ? 'Hari ini' : 'Besok') . ": remedial {$grup->count()} siswa",
                'pesan' => self::daftarNama($grup->map(fn($r) => "{$r->siswa?->nama_siswa} ({$r->opsi_tindakan}, {$r->mapel?->nama_mapel})"), 3) . '.',
                'jumlah' => $grup->count(), 'tautan' => self::tautanNilai($grup->pluck('nilaiAsal'), true), 'waktu' => "{$tgl}T00:00:00",
            ]);
        }
        return $hasil;
    }

    /** Nilai efektif di bawah KKM pada semester aktif yang belum punya rencana tindak lanjut, per kelas & mapel. */
    private function belumTindakLanjut(?array $mapel): array
    {
        if (!$this->periode) return [];
        $nilai = TransNilai::efektif()->with(['siswa:id_siswa,nama_siswa', 'mapel:id_mapel,nama_mapel,kkm', 'kelas:id_kelas,nama_kelas'])
            ->where('id_periode', $this->periode)
            ->when($mapel !== null, fn($q) => $q->whereIn('id_mapel', $mapel))
            ->whereDoesntHave('rencana')
            ->get(explode(',', self::KOLOM_LEMBAR . ',nilai'))
            ->filter(fn($n) => (float) $n->nilai < (float) ($n->mapel?->kkm ?? 75));

        return $nilai->groupBy(fn($n) => "{$n->id_kelas}|{$n->id_mapel}")->map(function ($grup) {
            $n = $grup->first();
            return $this->buat('tindak-lanjut', $grup->pluck('id_nilai')->sort()->values()->all(), [
                'tingkat' => 'warning', 'kategori' => 'Nilai', 'ikon' => 'bi-person-exclamation',
                'judul' => "{$grup->count()} nilai di bawah KKM belum ditindaklanjuti ({$grup->pluck('id_siswa')->unique()->count()} siswa)",
                'pesan' => "{$n->mapel?->nama_mapel} · {$n->kelas?->nama_kelas}: " . self::daftarNama($grup->map(fn($x) => $x->siswa?->nama_siswa))
                    . '. Buat rencana lewat tombol Tindak Lanjut di Input Nilai.',
                'jumlah' => $grup->count(), 'tautan' => self::tautanNilai($grup),
                'waktu' => Carbon::parse($grup->max('tanggal'))->toDateString() . 'T00:00:00',
            ]);
        })->values()->all();
    }

    private function jadwalGuru(): array
    {
        $hasil = [];
        $sesi = TransJadwal::with(['kelas:id_kelas,nama_kelas', 'mapel:id_mapel,nama_mapel'])
            ->where('id_guru', $this->user->id_guru)->where('status_sesi', '!=', 'Batal')
            ->whereDate('mulai', $this->hariIni)->orderBy('mulai')->get();
        if ($sesi->isNotEmpty()) {
            $hasil[] = $this->buat('jadwal-hari-ini', [$this->hariIni, $sesi->pluck('id_jadwal')->all()], [
                'tingkat' => 'info', 'kategori' => 'Jadwal', 'ikon' => 'bi-calendar-event',
                'judul' => "{$sesi->count()} sesi mengajar hari ini",
                'pesan' => self::daftarNama($sesi->map(fn($j) => $j->mulai->format('H:i') . ' ' . ($j->mapel?->nama_mapel ?? $j->judul) . ($j->kelas ? " ({$j->kelas->nama_kelas})" : '')), 5) . '.',
                'jumlah' => $sesi->count(), 'tautan' => '/dashboard/jadwal', 'waktu' => $this->hariIni . 'T00:00:01',
            ]);
        }

        // Sesi yang sudah lewat 14 hari terakhir tetapi statusnya belum ditutup (Selesai/Batal)
        $terbuka = TransJadwal::where('id_guru', $this->user->id_guru)
            ->whereIn('status_sesi', ['Menunggu', 'Berlangsung'])
            ->where('selesai', '<', $this->sekarang->format('Y-m-d H:i:s'))
            ->where('selesai', '>=', $this->sekarang->copy()->subDays(14)->toDateString())
            ->where(fn($q) => $q->whereNull('judul')->orWhere('judul', 'not like', 'Remedial ·%')) // sesi remedial selesai otomatis
            ->orderBy('mulai')->get(['id_jadwal', 'mulai']);
        if ($terbuka->isNotEmpty()) {
            $hasil[] = $this->buat('jadwal-terbuka', $terbuka->pluck('id_jadwal')->all(), [
                'tingkat' => 'warning', 'kategori' => 'Jadwal', 'ikon' => 'bi-calendar-x',
                'judul' => "{$terbuka->count()} sesi lalu belum ditandai Selesai/Batal",
                'pesan' => 'Sejak ' . $this->tanggal($terbuka->first()->mulai->toDateString()) . '. Perbarui status sesinya di Jadwal agar rekap pembelajaran akurat.',
                'jumlah' => $terbuka->count(), 'tautan' => '/dashboard/jadwal',
                'waktu' => $terbuka->last()->mulai->toDateString() . 'T00:00:00',
            ]);
        }
        return $hasil;
    }

    /** Kelas yang punya sesi jadwal hari ini dianggap hari sekolah. */
    private function kelasBersesiHariIni(?array $kelas = null): Collection
    {
        if (Carbon::parse($this->hariIni)->isSunday()) return collect(); // Minggu libur umum: tidak ada pengingat presensi
        return TransJadwal::whereDate('mulai', $this->hariIni)->where('status_sesi', '!=', 'Batal')
            ->when($kelas, fn($q) => $q->whereIn('id_kelas', $kelas))->whereNotNull('id_kelas')
            ->when(Classes::idNonaktif(), fn($q, $nonaktif) => $q->whereNotIn('id_kelas', $nonaktif))
            ->distinct()->pluck('id_kelas');
    }

    private function kelasBinaan(array $kelas): array
    {
        $hasil = [];
        $sudahPresensi = TransPresensi::whereDate('tanggal', $this->hariIni)->whereIn('id_kelas', $kelas)->distinct()->pluck('id_kelas');
        $belum = $this->kelasBersesiHariIni($kelas)->diff($sudahPresensi);
        if ($belum->isNotEmpty()) {
            $nama = Classes::whereIn('id_kelas', $belum)->pluck('nama_kelas');
            $hasil[] = $this->buat('presensi-binaan', [$this->hariIni, $belum->values()->all()], [
                'tingkat' => 'warning', 'kategori' => 'Presensi', 'ikon' => 'bi-calendar-check',
                'judul' => 'Presensi hari ini belum diisi',
                'pesan' => self::daftarKelas($nama) . ' ada jadwal hari ini, tetapi presensinya belum tercatat.',
                'jumlah' => $belum->count(), 'tautan' => '/dashboard/presensi', 'waktu' => $this->hariIni . 'T00:00:02',
            ]);
        }

        if ($this->periode) {
            $siswa = Student::whereIn('id_kelas', $kelas)->pluck('id_siswa');

            // Diagnostik non-kognitif semester ini (gaya belajar, kesejahteraan, dukungan rumah)
            $sudahDiag = TransDiagnostikNonkognitif::where('id_periode', $this->periode)->whereIn('id_siswa', $siswa)->count();
            $kurangDiag = $siswa->count() - $sudahDiag;
            if ($siswa->isNotEmpty() && $kurangDiag > 0) {
                $hasil[] = $this->buat('diagnostik', [$this->periode, $kurangDiag], [
                    'tingkat' => 'info', 'kategori' => 'Diagnostik', 'ikon' => 'bi-clipboard2-pulse',
                    'judul' => "Diagnostik non-kognitif: {$kurangDiag} siswa belum diisi",
                    'pesan' => "Sudah {$sudahDiag} dari {$siswa->count()} siswa kelas binaan Anda. Gaya belajar & kondisi siswa membantu guru menyiapkan pembelajaran berdiferensiasi.",
                    'jumlah' => $kurangDiag, 'tautan' => '/dashboard/diagnostik', 'waktu' => $this->hariIni . 'T00:00:00',
                ]);
            }

            $sudah = TransCatatanWali::where('id_periode', $this->periode)->whereIn('id_siswa', $siswa)->count();
            $kurang = $siswa->count() - $sudah;
            if ($siswa->isNotEmpty() && $kurang > 0) {
                $hasil[] = $this->buat('catatan-wali', [$this->periode, $kurang], [
                    'tingkat' => 'info', 'kategori' => 'Rapor', 'ikon' => 'bi-chat-square-quote',
                    'judul' => "Catatan wali kelas: {$kurang} siswa belum diisi",
                    'pesan' => "Sudah {$sudah} dari {$siswa->count()} siswa kelas binaan Anda. Catatan ini tampil di rapor semester aktif.",
                    'jumlah' => $kurang, 'tautan' => '/dashboard/rapor', 'waktu' => $this->hariIni . 'T00:00:00',
                ]);
            }
        }
        return $hasil;
    }

    /**
     * Kenaikan kelas: wali kelas diingatkan mengisi keputusan menjelang akhir semester Genap; kepala sekolah/admin
     * diingatkan mengesahkan rombel yang sudah lengkap; admin/kepala sekolah diingatkan memetakan siswa yang naik.
     */
    private function kenaikan(User $u): array
    {
        $hasil = [];
        if (($u->isAdmin() || $u->isKepsek()) && ($n = \App\Services\KenaikanService::jumlahMenunggu())) {
            $hasil[] = $this->buat('pemetaan-rombel', [$n], [
                'tingkat' => 'warning', 'kategori' => 'Kenaikan kelas', 'ikon' => 'bi-diagram-3',
                'judul' => "{$n} siswa menunggu pemetaan rombel",
                'pesan' => 'Siswa ini sudah naik kelas, tetapi rombel tingkatnya lebih dari satu. Tempatkan mereka di Pemetaan Rombel.',
                'jumlah' => $n, 'tautan' => '/dashboard/pemetaan-rombel', 'waktu' => $this->hariIni . 'T00:00:04',
            ]);
        }
        $p = $this->periode ? \App\Models\MasterPeriode::find($this->periode) : null;
        if (!$p || $p->semester !== 'Genap') return $hasil;
        // Sepanjang semester Genap: siswa berisiko tinggi tidak naik yang belum punya tindak lanjut dalam 30 hari
        foreach (Classes::whereIn('id_kelas', $u->kelasBinaan())->orderBy('nama_kelas')->get(['id_kelas', 'nama_kelas']) as $k) {
            $perlu = \App\Services\PantauanKenaikan::kelas($k, $p)->filter(fn($s) => $s['perlu_tindak'] && $s['tingkat'] === 'TINGGI');
            if ($perlu->isEmpty()) continue;
            $hasil[] = $this->buat('kenaikan-risiko', [$p->id_periode, $k->id_kelas, $perlu->pluck('id_siswa')->all()], [
                'tingkat' => 'warning', 'kategori' => 'Kenaikan kelas', 'ikon' => 'bi-signpost-split',
                'judul' => "{$k->nama_kelas}: {$perlu->count()} siswa berisiko tidak naik kelas",
                'pesan' => self::daftarNama($perlu->pluck('nama_siswa')) . ' belum punya tindak lanjut 30 hari terakhir. Catat remedial atau pembinaan, atau kabari orang tua.',
                'jumlah' => $perlu->count(), 'tautan' => '/dashboard/pantauan-kenaikan?id_kelas=' . $k->id_kelas, 'waktu' => $this->hariIni . 'T00:00:03',
            ]);
        }
        // Mulai 6 minggu sebelum semester Genap berakhir
        [, $selesai] = $p->rentang();
        if ($this->sekarang->lt($selesai->copy()->subWeeks(6))) return $hasil;

        $ringkas = \App\Services\KenaikanService::ringkasan($p);
        foreach ($ringkas->filter(fn($r) => in_array($r['id_kelas'], $u->kelasBinaan(), true)) as $r) {
            $kurang = $r['siswa'] - $r['terisi'];
            if ($kurang > 0) $hasil[] = $this->buat('kenaikan-isi', [$p->id_periode, $r['id_kelas'], $kurang], [
                'tingkat' => 'warning', 'kategori' => 'Kenaikan kelas', 'ikon' => 'bi-mortarboard',
                'judul' => "Kenaikan kelas {$r['nama_kelas']}: {$kurang} siswa belum diputuskan",
                'pesan' => 'Isi keputusan naik/tidak naik berdasarkan usulan dari nilai dan kehadiran setahun, lalu kepala sekolah mengesahkan.',
                'jumlah' => $kurang, 'tautan' => '/dashboard/kenaikan?id_kelas=' . $r['id_kelas'], 'waktu' => $this->hariIni . 'T00:00:04',
            ]);
        }
        if ($u->isAdmin() || $u->isKepsek()) {
            $siap = $ringkas->filter(fn($r) => $r['siswa'] > 0 && $r['terisi'] === $r['siswa'] && $r['disahkan'] < $r['siswa']);
            if ($siap->isNotEmpty()) $hasil[] = $this->buat('kenaikan-sahkan', [$p->id_periode, $siap->pluck('id_kelas')->all()], [
                'tingkat' => 'info', 'kategori' => 'Kenaikan kelas', 'ikon' => 'bi-patch-check',
                'judul' => "{$siap->count()} rombel menunggu pengesahan kenaikan kelas",
                'pesan' => self::daftarKelas($siap->pluck('nama_kelas')) . ' sudah lengkap diisi wali kelas.',
                'jumlah' => $siap->count(), 'tautan' => '/dashboard/kenaikan?id_kelas=' . $siap->first()['id_kelas'], 'waktu' => $this->hariIni . 'T00:00:04',
            ]);
        }
        return $hasil;
    }

    /**
     * Pembinaan presensi yang sudah tiba tanggal tindak lanjutnya dan belum selesai/batal: untuk pembuatnya dan wali kelas
     * siswa; admin & kepala sekolah melihat semuanya. Status Otomatis yang sudah pulih tidak ditampilkan.
     */
    /** Kepala sekolah/admin: rapor resmi yang sudah terbit tetapi belum disahkan, per kelas. */
    private function raporSahkan(): array
    {
        $belum = \App\Models\TransRaporTerbit::berlaku()->whereNull('disahkan_pada')
            ->when($this->periode, fn($q) => $q->where('id_periode', $this->periode))
            ->selectRaw('id_kelas, id_periode, count(*) as n')->groupBy('id_kelas', 'id_periode')->get();
        if ($belum->isEmpty()) return [];
        $kelas = \App\Models\Classes::whereIn('id_kelas', $belum->pluck('id_kelas'))->pluck('nama_kelas', 'id_kelas');
        $pertama = $belum->first();
        $n = (int) $belum->sum('n');
        return [$this->buat('rapor-sahkan', [$belum->map(fn($b) => "{$b->id_kelas}:{$b->n}")->all()], [
            'tingkat' => 'info', 'kategori' => 'Rapor', 'ikon' => 'bi-pen',
            'judul' => "{$n} rapor resmi menunggu pengesahan",
            'pesan' => 'Kelas ' . self::daftarKelas($belum->map(fn($b) => $kelas[$b->id_kelas] ?? $b->id_kelas)) . '. Periksa lalu sahkan agar tanda tangan elektronik kepala sekolah tercantum.',
            'jumlah' => $n, 'tautan' => '/dashboard/rapor?id_kelas=' . urlencode((string) $pertama->id_kelas) . '&id_periode=' . urlencode($pertama->id_periode),
            'waktu' => $this->hariIni . 'T00:00:05',
        ])];
    }

    private function pembinaanPresensi(): array
    {
        $u = $this->user;
        $rencana = \App\Models\TransPembinaanPresensi::with(['siswa:id_siswa,nama_siswa', 'kelas:id_kelas,nama_kelas'])
            ->whereIn('status', ['OTOMATIS', 'BERLANGSUNG'])
            ->where('tanggal_tindak_lanjut', '<=', $this->hariIni)
            ->when(!($u->isAdmin() || $u->isKepsek()), fn($q) => $q->where(fn($w) => $w->where('dibuat_oleh', $u->id)->orWhereIn('id_kelas', $u->kelasBinaan() ?: ['-'])))
            ->orderBy('tanggal_tindak_lanjut')->get();
        if ($rencana->isEmpty()) return [];
        $status = \App\Models\TransPembinaanPresensi::statusEfektif($rencana, $this->hariIni);
        $perlu = $rencana->filter(fn($r) => in_array($status[$r->id_pembinaan]['status'], ['DIRENCANAKAN', 'BERLANGSUNG'], true));
        if ($perlu->isEmpty()) return [];
        $kelas = $perlu->pluck('id_kelas')->unique();
        return [$this->buat('pembinaan-presensi', $perlu->pluck('id_pembinaan')->all(), [
            'tingkat' => 'warning', 'kategori' => 'Pembinaan', 'ikon' => 'bi-person-heart',
            'judul' => "Tindak lanjut pembinaan kehadiran: {$perlu->count()} siswa",
            'pesan' => self::daftarNama($perlu->map(fn($r) => $r->siswa?->nama_siswa)) . '. Catat hasilnya atau ubah statusnya sampai selesai.',
            'jumlah' => $perlu->count(),
            'tautan' => '/dashboard/presensi?' . http_build_query(array_filter(['kelas' => $kelas->count() === 1 ? $kelas->first() : null, 'pembinaan' => 1])),
            'waktu' => $perlu->first()->tanggal_tindak_lanjut->toDateString() . 'T00:00:00',
        ])];
    }

    /** Siswa berisiko TINGGI menurut peringatan dini yang belum ditindaklanjuti untuk alasan saat ini. */
    private function peringatanDini(): array
    {
        $data = (new PeringatanDiniService())->hitung(PeringatanDiniService::siswaUntuk($this->user))
            ->filter(fn($s) => $s['tingkat'] === 'TINGGI' && !($s['tindak_lanjut']['masih_berlaku'] ?? false));
        if ($data->isEmpty()) return [];
        return [$this->buat('peringatan-dini', $data->map(fn($s) => $s['id_siswa'] . $s['kunci'])->sort()->values()->all(), [
            'tingkat' => 'danger', 'kategori' => 'Peringatan Dini', 'ikon' => 'bi-activity',
            'judul' => "{$data->count()} siswa berisiko tinggi belum ditindaklanjuti",
            'pesan' => self::daftarNama($data->map(fn($s) => "{$s['nama_siswa']} ({$s['alasan'][0]['label']})"), 3) . '. Lihat alasannya dan catat tindak lanjut.',
            'jumlah' => $data->count(), 'tautan' => '/dashboard/peringatan-dini?tingkat=TINGGI',
            'waktu' => $this->hariIni . 'T00:00:03',
        ])];
    }

    /** Pesan dari orang tua/wali kelas yang belum dibaca akun ini. */
    private function pesanBaru(): array
    {
        $u = $this->user;
        $belum = PesanService::belumDibaca($u, PesanService::siswaUtas($u))->filter();
        if ($belum->isEmpty()) return [];
        $nama = Student::whereIn('id_siswa', $belum->keys())->pluck('nama_siswa', 'id_siswa');
        $satu = $belum->count() === 1 ? $belum->keys()->first() : null;
        $tautan = $u->isPortal()
            ? self::tautanPortal('pesan', $satu ?? $belum->keys()->first())
            : '/dashboard/pesan' . ($satu ? '?siswa=' . rawurlencode($satu) : '');
        return [$this->buat('pesan-baru', $belum->all(), [
            'tingkat' => 'warning', 'kategori' => 'Pesan', 'ikon' => 'bi-chat-dots',
            'judul' => $belum->sum() . ' pesan baru' . ($u->isPortal() ? ' dari sekolah' : ' dari orang tua'),
            'pesan' => ($u->isPortal() ? 'Tentang ' : 'Utas ') . self::daftarNama($belum->keys()->map(fn($id) => $nama[$id] ?? $id)) . '. Buka untuk membaca dan membalas.',
            'jumlah' => (int) $belum->sum(), 'tautan' => $tautan,
        ])];
    }

    /** Pendaftar SPMB yang menunggu verifikasi atau sudah daftar ulang (perlu dijadikan siswa). */
    private function spmb(): array
    {
        $jumlah = \App\Models\SpmbPendaftar::whereIn('status', ['DIAJUKAN', 'DAFTAR_ULANG'])->selectRaw('status, count(*) as n, max(updated_at) as terakhir')->groupBy('status')->get()->keyBy('status');
        $item = [];
        if ($a = $jumlah->get('DIAJUKAN')) {
            $item[] = $this->buat('spmb-verifikasi', [(int) $a->n, (string) $a->terakhir], [
                'tingkat' => 'warning', 'kategori' => 'SPMB', 'ikon' => 'bi-person-plus',
                'judul' => "{$a->n} pendaftar SPMB menunggu verifikasi",
                'pesan' => 'Periksa data dan berkasnya, lalu tandai terverifikasi atau minta perbaikan.',
                'jumlah' => (int) $a->n, 'tautan' => '/dashboard/administrasi/spmb?status=DIAJUKAN',
                'waktu' => \Carbon\Carbon::parse($a->terakhir)->toIso8601String(),
            ]);
        }
        if ($d = $jumlah->get('DAFTAR_ULANG')) {
            $item[] = $this->buat('spmb-daftar-ulang', [(int) $d->n, (string) $d->terakhir], [
                'tingkat' => 'info', 'kategori' => 'SPMB', 'ikon' => 'bi-person-check',
                'judul' => "{$d->n} pendaftar sudah daftar ulang",
                'pesan' => 'Selesaikan daftar ulangnya agar otomatis tercatat sebagai siswa beserta data orang tua.',
                'jumlah' => (int) $d->n, 'tautan' => '/dashboard/administrasi/spmb?status=DAFTAR_ULANG',
                'waktu' => \Carbon\Carbon::parse($d->terakhir)->toIso8601String(),
            ]);
        }
        return $item;
    }

    /** Tunggakan tagihan siswa (lewat jatuh tempo, belum lunas) untuk operator keuangan. */
    private function keuangan(): array
    {
        $t = \App\Models\KeuTagihan::whereIn('status', ['BELUM', 'SEBAGIAN'])->where('jatuh_tempo', '<', $this->hariIni)
            ->selectRaw('count(distinct id_siswa) as siswa, coalesce(sum(nominal - potongan - terbayar), 0) as total, max(jatuh_tempo) as terakhir')->first();
        if (!$t || !$t->siswa) return [];
        return [$this->buat('keuangan-tunggakan', [(int) $t->siswa, (int) $t->total], [
            'tingkat' => 'info', 'kategori' => 'Keuangan', 'ikon' => 'bi-cash-coin',
            'judul' => "{$t->siswa} siswa punya tunggakan " . \App\Support\Keuangan::rupiah((int) $t->total),
            'pesan' => 'Tagihan sudah lewat jatuh tempo. Kirim pengingat WhatsApp ke orang tua dari tab Tunggakan.',
            'jumlah' => (int) $t->siswa, 'tautan' => '/dashboard/administrasi/keuangan?tab=tunggakan',
            'waktu' => \Carbon\Carbon::parse($t->terakhir, config('app.zona_sekolah'))->toIso8601String(),
        ])];
    }

    /** Surat masuk belum didisposisi, surat menunggu tanda tangan (kepsek), dokumen legal mendekati habis masa berlaku. */
    private function surat(User $u): array
    {
        $item = [];
        $baru = \App\Models\SuratMasuk::where('status', 'BARU')->selectRaw('count(*) as n, max(updated_at) as t')->first();
        if ($baru?->n) {
            $item[] = $this->buat('surat-masuk', [(int) $baru->n, (string) $baru->t], [
                'tingkat' => 'info', 'kategori' => 'Surat & Arsip', 'ikon' => 'bi-envelope-open',
                'judul' => "{$baru->n} surat masuk belum didisposisi", 'pesan' => 'Teruskan ke guru/staf yang menangani lewat Disposisi.',
                'jumlah' => (int) $baru->n, 'tautan' => '/dashboard/administrasi/surat?tab=masuk',
            ]);
        }
        if ($u->isKepsek()) {
            $ttd = \App\Models\SuratKeluar::where('status', 'DIAJUKAN')->selectRaw('count(*) as n, max(updated_at) as t')->first();
            if ($ttd?->n) {
                $item[] = $this->buat('surat-ttd', [(int) $ttd->n, (string) $ttd->t], [
                    'tingkat' => 'warning', 'kategori' => 'Surat & Arsip', 'ikon' => 'bi-pen',
                    'judul' => "{$ttd->n} surat menunggu tanda tangan Anda", 'pesan' => 'Periksa isinya, lalu tekan Tandatangani & terbitkan.',
                    'jumlah' => (int) $ttd->n, 'tautan' => '/dashboard/administrasi/surat?tab=keluar&status=DIAJUKAN',
                ]);
            }
        }
        $batas = Carbon::parse($this->hariIni)->addDays(\App\Support\Surat::HARI_PENGINGAT)->toDateString();
        $legal = \App\Models\ArsipDokumen::where('jenis', 'LEGAL')->whereNotNull('berlaku_sampai')->where('berlaku_sampai', '<=', $batas)->orderBy('berlaku_sampai')->get(['judul', 'berlaku_sampai']);
        if ($legal->isNotEmpty()) {
            $habis = $legal->filter(fn($d) => $d->berlaku_sampai->toDateString() < $this->hariIni)->count();
            $item[] = $this->buat('dokumen-legal', [$legal->count(), $habis, (string) $legal->first()->berlaku_sampai], [
                'tingkat' => $habis ? 'danger' : 'warning', 'kategori' => 'Surat & Arsip', 'ikon' => 'bi-shield-exclamation',
                'judul' => $habis ? "{$habis} dokumen legal sudah habis masa berlaku" : "{$legal->count()} dokumen legal segera habis masa berlaku",
                'pesan' => self::daftarNama($legal->pluck('judul')) . '. Urus perpanjangannya sebelum kedaluwarsa.',
                'jumlah' => $legal->count(), 'tautan' => '/dashboard/administrasi/surat?tab=legal',
            ]);
        }
        return $item;
    }

    /** Stok habis pakai menipis, peminjaman lewat rencana kembali, pengadaan menunggu keputusan (kepsek). */
    private function inventaris(User $u): array
    {
        $item = [];
        $tipis = \App\Models\InvStok::where('aktif', true)->where('stok_minimum', '>', 0)->whereColumn('stok', '<=', 'stok_minimum')->orderBy('nama')->get(['nama', 'stok']);
        if ($tipis->isNotEmpty()) {
            $item[] = $this->buat('stok-menipis', [$tipis->pluck('stok', 'nama')->all()], [
                'tingkat' => 'warning', 'kategori' => 'Inventaris', 'ikon' => 'bi-box-seam',
                'judul' => "{$tipis->count()} barang habis pakai menipis", 'pesan' => self::daftarNama($tipis->pluck('nama')) . '. Ajukan pengadaan atau catat barang masuk.',
                'jumlah' => $tipis->count(), 'tautan' => '/dashboard/administrasi/inventaris?tab=stok',
            ]);
        }
        $telat = \App\Models\InvPeminjaman::with('barang:id,nama')->where('status', 'DIPINJAM')->whereNotNull('rencana_kembali')->where('rencana_kembali', '<', $this->hariIni)->get();
        if ($telat->isNotEmpty()) {
            $item[] = $this->buat('pinjam-terlambat', [$telat->pluck('id')->all()], [
                'tingkat' => 'warning', 'kategori' => 'Inventaris', 'ikon' => 'bi-arrow-return-left',
                'judul' => "{$telat->count()} peminjaman lewat tanggal kembali", 'pesan' => self::daftarNama($telat->map(fn($p) => "{$p->barang?->nama} ({$p->peminjam})")) . '.',
                'jumlah' => $telat->count(), 'tautan' => '/dashboard/administrasi/inventaris?tab=pinjam',
            ]);
        }
        if ($u->isKepsek()) {
            $aju = \App\Models\InvPengadaan::where('status', 'DIAJUKAN')->selectRaw('count(*) as n, max(updated_at) as t')->first();
            if ($aju?->n) {
                $item[] = $this->buat('pengadaan-keputusan', [(int) $aju->n, (string) $aju->t], [
                    'tingkat' => 'info', 'kategori' => 'Inventaris', 'ikon' => 'bi-cart-check',
                    'judul' => "{$aju->n} pengadaan menunggu keputusan Anda", 'pesan' => 'Setujui atau tolak pengajuan pengadaan barang.',
                    'jumlah' => (int) $aju->n, 'tautan' => '/dashboard/administrasi/inventaris?tab=pengadaan',
                ]);
            }
        }
        return $item;
    }

    /** Disposisi surat yang ditujukan ke akun ini dan belum selesai. */
    private function disposisiSaya(User $u): array
    {
        $d = \App\Models\SuratDisposisi::where('kepada_user', $u->id)->where('status', '<>', 'SELESAI')->selectRaw("count(*) as n, sum(case when status = 'BARU' then 1 else 0 end) as baru, max(updated_at) as t")->first();
        if (!$d?->n) return [];
        return [$this->buat('disposisi', [(int) $d->n, (string) $d->t], [
            'tingkat' => $d->baru ? 'warning' : 'info', 'kategori' => 'Surat & Arsip', 'ikon' => 'bi-envelope-paper',
            'judul' => "{$d->n} disposisi surat untuk Anda", 'pesan' => 'Baca suratnya dan catat tindak lanjut setelah dikerjakan.',
            'jumlah' => (int) $d->n, 'tautan' => '/dashboard/disposisi',
        ])];
    }

    private function presensiSekolah(): array
    {
        $bersesi = $this->kelasBersesiHariIni();
        $belum = $bersesi->diff(TransPresensi::whereDate('tanggal', $this->hariIni)->distinct()->pluck('id_kelas'));
        if ($belum->isEmpty()) return [];
        $nama = Classes::whereIn('id_kelas', $belum)->orderBy('nama_kelas')->pluck('nama_kelas');
        return [$this->buat('presensi-sekolah', [$this->hariIni, $belum->values()->all()], [
            'tingkat' => 'info', 'kategori' => 'Presensi', 'ikon' => 'bi-building-check',
            'judul' => "{$belum->count()} dari {$bersesi->count()} kelas belum presensi hari ini",
            'pesan' => self::daftarKelas($nama, 6) . '.',
            'jumlah' => $belum->count(), 'tautan' => '/dashboard/presensi', 'waktu' => $this->hariIni . 'T00:00:00',
        ])];
    }

    /** Akun yang gagal login berulang (≥ 3 kali) dalam 24 jam terakhir. */
    private function loginGagal(): array
    {
        $gagal = LogAktivitas::where('aksi', 'LOGIN_GAGAL')->where('waktu', '>=', now()->subDay())
            ->get(['meta', 'waktu', 'ip'])
            ->groupBy(fn($l) => mb_strtolower($l->meta['identitas'] ?? '?'))
            ->filter(fn($g) => $g->count() >= 3);
        if ($gagal->isEmpty()) return [];
        return [$this->buat('login-gagal', $gagal->map->count()->all(), [
            'tingkat' => 'danger', 'kategori' => 'Keamanan', 'ikon' => 'bi-shield-exclamation',
            'judul' => 'Percobaan login gagal berulang',
            'pesan' => self::daftarNama($gagal->map(fn($g, $id) => "{$id} ({$g->count()}×)")->values()) . ' dalam 24 jam terakhir. Periksa di Log Aktivitas.',
            'jumlah' => $gagal->sum(fn($g) => $g->count()), 'tautan' => '/dashboard/log-aktivitas',
            'waktu' => $gagal->flatten()->max('waktu')->toIso8601String(),
        ])];
    }

    // ===== PORTAL SISWA & ORANG TUA =====

    private function untukPortal(): array
    {
        $siswa = $this->user->siswaTerjangkau();
        if (!$siswa) return [];
        $hasil = [];

        $rencana = TransRencanaRemedial::with(['siswa:id_siswa,nama_siswa', 'mapel:id_mapel,nama_mapel,kkm', 'nilaiRemedial:id_nilai,id_rencana,nilai,tanggal', 'jadwal:id_jadwal,mulai', 'nilaiAsal:id_nilai,id_periode'])
            ->whereIn('id_siswa', $siswa)
            ->where(fn($q) => $q->where(fn($w) => $w->where('status', 'DIRENCANAKAN')->where('tanggal_rencana', '>=', $this->hariIni))
                ->orWhere(fn($w) => $w->where('status', 'SELESAI')->where('tanggal_selesai', '>=', $this->sekarang->copy()->subDays(7)->toDateString())))
            ->get();
        foreach ($rencana as $r) {
            $nama = $r->siswa?->nama_siswa;
            // "Buka" langsung ke kartu tindak lanjut ini di portal (anak & periode yang sesuai)
            $tautan = self::tautanPortal('tindak', $r->id_siswa, ['periode' => $r->nilaiAsal?->id_periode, 'rencana' => $r->id_rencana]);
            if ($r->status === 'DIRENCANAKAN') {
                $jam = $r->jadwal ? ', pukul ' . $r->jadwal->mulai->format('H:i') : '';
                $hasil[] = $this->buat('portal-remedial', [$r->id_rencana, $r->tanggal_rencana, $r->id_jadwal], [
                    'tingkat' => 'info', 'kategori' => 'Remedial', 'ikon' => 'bi-life-preserver',
                    'judul' => "{$nama}: tindak lanjut {$r->mapel?->nama_mapel}",
                    'pesan' => "{$r->opsi_tindakan} pada {$this->tanggal($r->tanggal_rencana->toDateString())}{$jam}. Mohon dampingi ananda belajar di rumah.",
                    'tautan' => $tautan, 'waktu' => $r->tanggal_rencana->toDateString() . 'T00:00:00',
                ]);
            } elseif ($r->nilaiRemedial) {
                $tuntas = (float) $r->nilaiRemedial->nilai >= (float) ($r->mapel?->kkm ?? 75);
                $hasil[] = $this->buat('portal-hasil', [$r->id_rencana, $r->nilaiRemedial->nilai], [
                    'tingkat' => $tuntas ? 'success' : 'warning', 'kategori' => 'Remedial', 'ikon' => $tuntas ? 'bi-patch-check' : 'bi-arrow-repeat',
                    'judul' => "{$nama}: hasil remedial {$r->mapel?->nama_mapel}",
                    'pesan' => $tuntas ? 'Ananda sudah tuntas. Terima kasih atas dukungannya.' : 'Ananda belum tuntas; guru akan menyiapkan tindak lanjut berikutnya.',
                    'tautan' => $tautan, 'waktu' => $r->tanggal_selesai?->toDateString() . 'T00:00:00',
                ]);
            }
        }

        // Rapor resmi terbit dan belum dikonfirmasi diterima
        $rapor = \App\Models\TransRaporTerbit::berlaku()->with('siswa:id_siswa,nama_siswa')->whereIn('id_siswa', $siswa)->whereNull('diterima_pada')->get();
        foreach ($rapor as $t) {
            $r = $t->ringkasan;
            $hasil[] = $this->buat('portal-rapor', [$t->id, $t->versi], [
                'tingkat' => 'info', 'kategori' => 'Rapor', 'ikon' => 'bi-file-earmark-check',
                'judul' => "{$t->siswa?->nama_siswa}: rapor resmi semester " . ($r['semester'] ?? '') . ' sudah terbit',
                'pesan' => 'Silakan baca rapornya, lalu tekan "Sudah menerima & membaca". Anda juga bisa menulis tanggapan untuk wali kelas.',
                'tautan' => self::tautanPortal('rapor', $t->id_siswa, ['periode' => $t->id_periode]), 'waktu' => $t->diterbitkan_pada->toIso8601String(),
            ]);
        }

        $kabar = \App\Models\TransKenaikanPantau::with('siswa:id_siswa,nama_siswa')->whereIn('id_siswa', $siswa)->where('jenis', 'KABARI_ORTU')
            ->where('created_at', '>=', $this->sekarang->copy()->subDays(14))->get();
        foreach ($kabar as $x) {
            $hasil[] = $this->buat('portal-pantauan', [$x->id], [
                'tingkat' => 'info', 'kategori' => 'Kenaikan kelas', 'ikon' => 'bi-signpost-split',
                'judul' => "{$x->siswa?->nama_siswa}: pesan wali kelas tentang ketuntasan belajar",
                'pesan' => \Illuminate\Support\Str::limit($x->catatan, 160),
                'tautan' => self::tautanPortal('ringkasan', $x->id_siswa), 'waktu' => $x->created_at->toIso8601String(),
            ]);
        }

        $alpa = TransPresensi::with('siswa:id_siswa,nama_siswa')->whereIn('id_siswa', $siswa)->where('status_kehadiran', 'ALPA')
            ->where('tanggal', '>=', $this->sekarang->copy()->subDays(7)->toDateString())->orderBy('tanggal')->get();
        foreach ($alpa->groupBy('id_siswa') as $grup) {
            $hasil[] = $this->buat('portal-alpa', $grup->map(fn($p) => $p->tanggal->toDateString())->all(), [
                'tingkat' => 'warning', 'kategori' => 'Presensi', 'ikon' => 'bi-person-x',
                'judul' => "{$grup->first()->siswa?->nama_siswa}: tidak hadir tanpa keterangan",
                'pesan' => "{$grup->count()} kali dalam 7 hari terakhir (" . self::daftarNama($grup->map(fn($p) => $this->tanggal($p->tanggal->toDateString())), 3) . '). Hubungi wali kelas bila ada keterangan.',
                'jumlah' => $grup->count(), 'tautan' => self::tautanPortal('presensi', $grup->first()->id_siswa), 'waktu' => $grup->last()->tanggal->toDateString() . 'T00:00:00',
            ]);
        }
        return $hasil;
    }

    private static function tautanPortal(string $tab, string $idSiswa, array $lain = []): string
    {
        return '/dashboard/portal?' . http_build_query(['tab' => $tab, 'siswa' => $idSiswa] + array_filter($lain));
    }

    /**
     * Tautan "Buka" ke Input Nilai: parameter lembar yang sama untuk semua nilai ikut dikirim (lengkap → lembar
     * itu langsung terbuka), beserta siswa & nilai yang dimaksud untuk disorot atau menyaring Riwayat.
     */
    private static function tautanNilai(Collection $nilai, bool $remedial = false): string
    {
        $nilai = $nilai->filter();
        $q = [];
        foreach (['id_kelas', 'id_mapel', 'id_periode', 'id_jenis', 'id_materi'] as $k) {
            $nilaiKolom = $nilai->pluck($k)->unique();
            if ($nilaiKolom->count() === 1 && $nilaiKolom->first()) $q[$k] = $nilaiKolom->first();
        }
        $tanggal = $nilai->map(fn($n) => Carbon::parse($n->tanggal)->toDateString())->unique();
        if ($remedial) $q['tipe'] = 'REMEDIAL';
        elseif ($tanggal->count() === 1) $q['tanggal'] = $tanggal->first();
        $q['siswa'] = $nilai->pluck('id_siswa')->unique()->take(50)->implode(',');
        $q['nilai'] = $nilai->pluck('id_nilai')->take(50)->implode(',');
        return '/dashboard/nilai?' . http_build_query($q);
    }

    /** Kepala sekolah: soal yang menunggu persetujuan. Guru: soalnya yang dikembalikan untuk direvisi. */
    private function bankSoal(): array
    {
        $hasil = [];
        $waktu = fn($grup) => Carbon::parse($grup->max('updated_at'))->timezone(config('app.zona_sekolah'))->format('Y-m-d\TH:i:s');
        if ($this->user->isKepsek()) {
            $diajukan = BankSoal::where('status', 'DIAJUKAN')->get(['id_soal', 'updated_at']);
            if ($diajukan->isNotEmpty()) {
                $hasil[] = $this->buat('soal-persetujuan', $diajukan->pluck('id_soal')->sort()->values()->all(), [
                    'tingkat' => 'warning', 'kategori' => 'Bank Soal', 'ikon' => 'bi-patch-question',
                    'judul' => "{$diajukan->count()} soal menunggu persetujuan",
                    'pesan' => 'Periksa soal yang diajukan guru, lalu setujui atau kembalikan dengan catatan perbaikan.',
                    'jumlah' => $diajukan->count(), 'tautan' => '/dashboard/bank-soal?status=DIAJUKAN', 'waktu' => $waktu($diajukan),
                ]);
            }
        }
        $revisi = BankSoal::where('status', 'REVISI')->where('dibuat_oleh', $this->user->id)->get(['id_soal', 'catatan_revisi', 'updated_at']);
        if ($revisi->isNotEmpty()) {
            $hasil[] = $this->buat('soal-revisi', $revisi->pluck('id_soal')->sort()->values()->all(), [
                'tingkat' => 'warning', 'kategori' => 'Bank Soal', 'ikon' => 'bi-pencil-square',
                'judul' => "{$revisi->count()} soal perlu direvisi",
                'pesan' => 'Catatan kepala sekolah: "' . \Illuminate\Support\Str::limit((string) $revisi->first()->catatan_revisi, 120) . '"',
                'jumlah' => $revisi->count(), 'tautan' => '/dashboard/bank-soal?status=REVISI&milik=1', 'waktu' => $waktu($revisi),
            ]);
        }
        return $hasil;
    }

    /** Kepala sekolah: ATP yang menunggu persetujuan. Guru: ATP-nya yang dikembalikan untuk direvisi. */
    private function atp(): array
    {
        $hasil = [];
        $waktu = fn($grup) => Carbon::parse($grup->max('updated_at'))->timezone(config('app.zona_sekolah'))->format('Y-m-d\TH:i:s');
        if ($this->user->isKepsek()) {
            $diajukan = Atp::where('status', 'DIAJUKAN')->get(['id_atp', 'updated_at']);
            if ($diajukan->isNotEmpty()) {
                $hasil[] = $this->buat('atp-persetujuan', $diajukan->pluck('id_atp')->sort()->values()->all(), [
                    'tingkat' => 'warning', 'kategori' => 'Perangkat Ajar', 'ikon' => 'bi-diagram-3',
                    'judul' => "{$diajukan->count()} ATP menunggu persetujuan",
                    'pesan' => 'Periksa alur tujuan pembelajaran yang diajukan guru, lalu setujui atau kembalikan dengan catatan.',
                    'jumlah' => $diajukan->count(), 'tautan' => '/dashboard/perangkat-ajar?status=DIAJUKAN', 'waktu' => $waktu($diajukan),
                ]);
            }
        }
        if ($this->user->isKepsek()) {
            $modul = ModulAjar::where('status', 'DIAJUKAN')->get(['id_modul', 'updated_at']);
            if ($modul->isNotEmpty()) {
                $hasil[] = $this->buat('modul-persetujuan', $modul->pluck('id_modul')->sort()->values()->all(), [
                    'tingkat' => 'warning', 'kategori' => 'Perangkat Ajar', 'ikon' => 'bi-journal-richtext',
                    'judul' => "{$modul->count()} modul ajar menunggu persetujuan",
                    'pesan' => 'Periksa modul ajar yang diajukan guru, lalu setujui atau kembalikan dengan catatan.',
                    'jumlah' => $modul->count(), 'tautan' => '/dashboard/perangkat-ajar?tab=modul&status=DIAJUKAN', 'waktu' => $waktu($modul),
                ]);
            }
        }
        if ($this->user->isKepsek()) {
            // Pola tema diubah lewat Jadwal (rangkaian sesi digeser guru) dalam 7 hari terakhir: dipantau kepala sekolah
            $berubah = \App\Models\PetaTema::whereNotNull('jadwal_dibuat_pada')->where('updated_at', '>=', now()->subDays(7))->get(['id_peta', 'judul', 'riwayat_pola', 'jumlah_perubahan', 'updated_at'])
                ->filter(fn($p) => collect($p->riwayat_pola ?? [])->contains(fn($r) => ($r['sumber'] ?? '') === 'JADWAL' && ($r['waktu'] ?? '') >= now(config('app.zona_sekolah'))->subDays(7)->format('Y-m-d H:i')));
            if ($berubah->isNotEmpty()) {
                $akhir = collect($berubah->first()->riwayat_pola)->last(fn($r) => ($r['sumber'] ?? '') === 'JADWAL');
                $hasil[] = $this->buat('tema-perubahan', $berubah->map(fn($p) => $p->id_peta . ':' . $p->jumlah_perubahan)->sort()->values()->all(), [
                    'tingkat' => 'info', 'kategori' => 'Perangkat Ajar', 'ikon' => 'bi-calendar2-week',
                    'judul' => "Pola {$berubah->count()} peta tema diubah dari Jadwal",
                    'pesan' => ($akhir['nama'] ?? 'Guru') . ': ' . \Illuminate\Support\Str::limit((string) ($akhir['ringkas'] ?? ''), 120) . " (perubahan {$berubah->first()->jumlah_perubahan}/" . \App\Models\PetaTema::BATAS_PERUBAHAN . ')',
                    'jumlah' => $berubah->count(), 'tautan' => '/dashboard/perangkat-ajar?tab=tema&tema=' . $berubah->first()->id_peta, 'waktu' => $waktu($berubah),
                ]);
            }
            $tema = \App\Models\PetaTema::where('status', 'DIAJUKAN')->get(['id_peta', 'updated_at']);
            if ($tema->isNotEmpty()) {
                $hasil[] = $this->buat('tema-persetujuan', $tema->pluck('id_peta')->sort()->values()->all(), [
                    'tingkat' => 'warning', 'kategori' => 'Perangkat Ajar', 'ikon' => 'bi-bezier2',
                    'judul' => "{$tema->count()} peta tema menunggu persetujuan",
                    'pesan' => 'Periksa spider web dan peta mingguan yang diajukan guru, lalu setujui atau kembalikan dengan catatan.',
                    'jumlah' => $tema->count(), 'tautan' => '/dashboard/perangkat-ajar?tab=tema&status=DIAJUKAN', 'waktu' => $waktu($tema),
                ]);
            }
        }
        if ($this->user->isKepsek()) {
            $video = \App\Models\VideoBelajar::where('status', 'DIAJUKAN')->get(['id_video', 'updated_at']);
            if ($video->isNotEmpty()) {
                $hasil[] = $this->buat('video-persetujuan', $video->pluck('id_video')->sort()->values()->all(), [
                    'tingkat' => 'warning', 'kategori' => 'Video Belajar', 'ikon' => 'bi-play-btn',
                    'judul' => "{$video->count()} video belajar menunggu persetujuan",
                    'pesan' => 'Tonton video yang diajukan guru, lalu setujui agar bisa dilihat siswa, atau kembalikan dengan catatan.',
                    'jumlah' => $video->count(), 'tautan' => '/dashboard/video-belajar?status=DIAJUKAN', 'waktu' => $waktu($video),
                ]);
            }
            $dokumen = \App\Models\DokumenRujukan::where('status', 'DIAJUKAN')->get(['id_dokumen', 'updated_at']);
            if ($dokumen->isNotEmpty()) {
                $hasil[] = $this->buat('dokumen-persetujuan', $dokumen->pluck('id_dokumen')->sort()->values()->all(), [
                    'tingkat' => 'warning', 'kategori' => 'Pustaka Dokumen', 'ikon' => 'bi-file-earmark-text',
                    'judul' => "{$dokumen->count()} dokumen rujukan menunggu persetujuan",
                    'pesan' => 'Periksa dokumen yang diunggah guru, lalu setujui agar dibaca AI, atau kembalikan dengan catatan.',
                    'jumlah' => $dokumen->count(), 'tautan' => '/dashboard/pustaka-dokumen?status=DIAJUKAN', 'waktu' => $waktu($dokumen),
                ]);
            }
        }
        $dokumenDitolak = \App\Models\DokumenRujukan::where('status', 'DITOLAK')->where('diunggah_oleh', $this->user->id)->get(['id_dokumen', 'updated_at']);
        if ($dokumenDitolak->isNotEmpty()) {
            $hasil[] = $this->buat('dokumen-dikembalikan', $dokumenDitolak->pluck('id_dokumen')->sort()->values()->all(), [
                'tingkat' => 'info', 'kategori' => 'Pustaka Dokumen', 'ikon' => 'bi-file-earmark-excel',
                'judul' => "{$dokumenDitolak->count()} dokumen rujukan dikembalikan kepala sekolah",
                'pesan' => 'Baca catatan kepala sekolah, perbaiki atau ganti berkasnya, lalu unggah ulang.',
                'jumlah' => $dokumenDitolak->count(), 'tautan' => '/dashboard/pustaka-dokumen', 'waktu' => $waktu($dokumenDitolak),
            ]);
        }
        $renderGagal = \App\Models\VideoBelajar::where('render_status', 'GAGAL')->where('dibuat_oleh', $this->user->id)->get(['id_video', 'judul', 'render_pesan', 'updated_at']);
        if ($renderGagal->isNotEmpty()) {
            $hasil[] = $this->buat('video-render-gagal', $renderGagal->pluck('id_video')->sort()->values()->all(), [
                'tingkat' => 'danger', 'kategori' => 'Video Belajar', 'ikon' => 'bi-exclamation-octagon',
                'judul' => "{$renderGagal->count()} video gagal dirender",
                'pesan' => '"' . \Illuminate\Support\Str::limit((string) $renderGagal->first()->judul, 60) . '": ' . \Illuminate\Support\Str::limit((string) $renderGagal->first()->render_pesan, 120) . ' Buka videonya lalu tekan Render ulang.',
                'jumlah' => $renderGagal->count(), 'tautan' => '/dashboard/video-belajar', 'waktu' => $waktu($renderGagal),
            ]);
        }
        $videoRevisi = \App\Models\VideoBelajar::where('status', 'REVISI')->where('dibuat_oleh', $this->user->id)->get(['id_video', 'catatan_revisi', 'updated_at']);
        if ($videoRevisi->isNotEmpty()) {
            $hasil[] = $this->buat('video-revisi', $videoRevisi->pluck('id_video')->sort()->values()->all(), [
                'tingkat' => 'warning', 'kategori' => 'Video Belajar', 'ikon' => 'bi-pencil-square',
                'judul' => "{$videoRevisi->count()} video belajar perlu direvisi",
                'pesan' => 'Catatan kepala sekolah: "' . \Illuminate\Support\Str::limit((string) $videoRevisi->first()->catatan_revisi, 120) . '"',
                'jumlah' => $videoRevisi->count(), 'tautan' => '/dashboard/video-belajar?status=REVISI', 'waktu' => $waktu($videoRevisi),
            ]);
        }
        $modulRevisi = ModulAjar::where('status', 'REVISI')->where('dibuat_oleh', $this->user->id)->get(['id_modul', 'catatan_revisi', 'updated_at']);
        if ($modulRevisi->isNotEmpty()) {
            $hasil[] = $this->buat('modul-revisi', $modulRevisi->pluck('id_modul')->sort()->values()->all(), [
                'tingkat' => 'warning', 'kategori' => 'Perangkat Ajar', 'ikon' => 'bi-pencil-square',
                'judul' => "{$modulRevisi->count()} modul ajar perlu direvisi",
                'pesan' => 'Catatan kepala sekolah: "' . \Illuminate\Support\Str::limit((string) $modulRevisi->first()->catatan_revisi, 120) . '"',
                'jumlah' => $modulRevisi->count(), 'tautan' => '/dashboard/perangkat-ajar?tab=modul&status=REVISI', 'waktu' => $waktu($modulRevisi),
            ]);
        }
        $temaRevisi = \App\Models\PetaTema::where('status', 'REVISI')->where('dibuat_oleh', $this->user->id)->get(['id_peta', 'catatan_revisi', 'updated_at']);
        if ($temaRevisi->isNotEmpty()) {
            $hasil[] = $this->buat('tema-revisi', $temaRevisi->pluck('id_peta')->sort()->values()->all(), [
                'tingkat' => 'warning', 'kategori' => 'Perangkat Ajar', 'ikon' => 'bi-pencil-square',
                'judul' => "{$temaRevisi->count()} peta tema perlu direvisi",
                'pesan' => 'Catatan kepala sekolah: "' . \Illuminate\Support\Str::limit((string) $temaRevisi->first()->catatan_revisi, 120) . '"',
                'jumlah' => $temaRevisi->count(), 'tautan' => '/dashboard/perangkat-ajar?tab=tema&status=REVISI', 'waktu' => $waktu($temaRevisi),
            ]);
        }
        $revisi = Atp::where('status', 'REVISI')->where('dibuat_oleh', $this->user->id)->get(['id_atp', 'catatan_revisi', 'updated_at']);
        if ($revisi->isNotEmpty()) {
            $hasil[] = $this->buat('atp-revisi', $revisi->pluck('id_atp')->sort()->values()->all(), [
                'tingkat' => 'warning', 'kategori' => 'Perangkat Ajar', 'ikon' => 'bi-pencil-square',
                'judul' => "{$revisi->count()} ATP perlu direvisi",
                'pesan' => 'Catatan kepala sekolah: "' . \Illuminate\Support\Str::limit((string) $revisi->first()->catatan_revisi, 120) . '"',
                'jumlah' => $revisi->count(), 'tautan' => '/dashboard/perangkat-ajar?status=REVISI', 'waktu' => $waktu($revisi),
            ]);
        }
        return $hasil;
    }
}

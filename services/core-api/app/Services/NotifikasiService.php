<?php

namespace App\Services;

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
        } else {
            $mapel = $u->isPengelola() ? null : $u->mapelDiampu(); // null = semua mapel
            if ($u->isPengelola() || $mapel) {
                $item = $item->merge($this->remedial($mapel))->merge($this->belumTindakLanjut($mapel));
            }
            if ($u->id_guru) $item = $item->merge($this->jadwalGuru());
            if ($kelas = $u->kelasBinaan()) $item = $item->merge($this->kelasBinaan($kelas));
            if ($u->isPengelola()) $item = $item->merge($this->presensiSekolah());
            if ($u->isAdmin()) $item = $item->merge($this->loginGagal());
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
        return TransJadwal::whereDate('mulai', $this->hariIni)->where('status_sesi', '!=', 'Batal')
            ->when($kelas, fn($q) => $q->whereIn('id_kelas', $kelas))->whereNotNull('id_kelas')
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
}

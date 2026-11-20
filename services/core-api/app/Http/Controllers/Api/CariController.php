<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\BankSoal;
use App\Models\Classes;
use App\Models\DokumenRujukan;
use App\Models\MasterMateri;
use App\Models\ModulAjar;
use App\Models\Student;
use App\Models\SuratKeluar;
use App\Models\SuratMasuk;
use App\Models\Teacher;
use App\Models\TransJadwal;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

/**
 * Pencarian global (Ctrl+K): siswa, guru, kelas, materi, soal, modul ajar, dokumen pustaka, dan surat —
 * masing-masing disaring menurut hak akses akun yang sama dengan halaman asalnya.
 */
class CariController extends Controller
{
    private const MAKS = 6;

    public function index(Request $request)
    {
        $request->validate(['q' => 'required|string|min:2|max:100']);
        $u = $request->user();
        $q = trim($request->q);
        $pola = '%' . str_replace(['\\', '%', '_'], ['\\\\', '\\%', '\\_'], mb_strtolower($q)) . '%';
        $like = fn($kolom) => fn($w) => $w->whereRaw("LOWER({$kolom}) LIKE ?", [$pola]);

        $hasil = collect()
            ->merge($this->siswa($u, $pola))
            ->merge($u->isPengelola() ? Teacher::where($like('nama_guru'))->orWhere($like('nip_nik'))->orderBy('nama_guru')->limit(self::MAKS)->get()
                ->map(fn($g) => self::item('Guru', 'bi-person-video3', $g->nama_guru, $g->nip_nik ? "NIP/NIK {$g->nip_nik}" : null, '/dashboard/master-guru?cari=' . rawurlencode($g->nama_guru))) : [])
            ->merge(Classes::where($like('nama_kelas'))->when(!$u->isPengelola(), fn($w) => $w->aktifSemester())->orderBy('nama_kelas')->limit(self::MAKS)->get()
                ->map(fn($k) => self::item('Kelas', 'bi-door-open', $k->nama_kelas, null, '/dashboard/presensi?kelas=' . rawurlencode($k->id_kelas))))
            ->merge(MasterMateri::with(['mapel:id_mapel,nama_mapel', 'kelas:id_kelas,nama_kelas'])->where($like('nama_materi'))
                ->when(!$u->isPengelola(), fn($w) => $w->whereIn('id_mapel', $u->mapelDiampu() ?: ['-']))->orderBy('nama_materi')->limit(self::MAKS)->get()
                ->map(fn($m) => self::item('Materi', 'bi-journal-bookmark', $m->nama_materi, trim(($m->mapel?->nama_mapel ?? '') . ' · ' . ($m->kelas?->nama_kelas ?? ''), ' ·'), '/dashboard/master-materi')))
            ->merge(BankSoal::with('mapel:id_mapel,nama_mapel')->where($like('pertanyaan'))
                ->when(!$u->isPengelola(), fn($w) => $w->where(fn($x) => $x->where('dibuat_oleh', $u->id)->orWhere(fn($y) => $y->where('status', 'DISETUJUI')->whereIn('id_mapel', $u->mapelDiampu()))))
                ->latest('updated_at')->limit(self::MAKS)->get(['id_soal', 'id_mapel', 'pertanyaan', 'status'])
                ->map(fn($s) => self::item('Soal', 'bi-patch-question', Str::limit(strip_tags($s->pertanyaan), 90), ($s->mapel?->nama_mapel ?? '') . ' · ' . ucfirst(mb_strtolower($s->status)), '/dashboard/bank-soal')))
            ->merge(ModulAjar::with(['mapel:id_mapel,nama_mapel', 'kelas:id_kelas,nama_kelas'])->where($like('judul'))
                ->when(!$u->isPengelola(), fn($w) => $w->where(fn($x) => $x->where('dibuat_oleh', $u->id)->orWhereIn('id_mapel', $u->mapelDiampu())))
                ->latest('updated_at')->limit(self::MAKS)->get(['id_modul', 'judul', 'id_mapel', 'id_kelas', 'status'])
                ->map(fn($m) => self::item('Modul ajar', 'bi-journal-richtext', $m->judul, trim(($m->mapel?->nama_mapel ?? '') . ' · ' . ($m->kelas?->nama_kelas ?? ''), ' ·'), '/dashboard/perangkat-ajar')))
            ->merge(DokumenRujukan::where($like('judul'))->when(!$u->isPengelola(), fn($w) => $w->where(fn($x) => $x->where('status', 'DISETUJUI')->orWhere('diunggah_oleh', $u->id)))
                ->latest('updated_at')->limit(self::MAKS)->get(['id_dokumen', 'judul', 'jenis'])
                ->map(fn($d) => self::item('Dokumen', 'bi-folder2-open', $d->judul, $d->jenis, '/dashboard/pustaka-dokumen?cari=' . rawurlencode($d->judul))))
            ->merge($u->bolehAdministrasi('SURAT') ? $this->surat($like) : []);

        return response()->json(['data' => $hasil->values(), 'q' => $q]);
    }

    private static function item(string $jenis, string $ikon, string $judul, ?string $sub, string $tautan, array $lain = []): array
    {
        return compact('jenis', 'ikon', 'judul', 'sub', 'tautan') + $lain;
    }

    /** Siswa: pengelola semua; guru siswa kelas binaan dan kelas yang ia ajar. Dashboard pribadi hanya admin, kepsek, wali. */
    private function siswa(User $u, string $pola): array
    {
        $kelas = null;
        if (!$u->isPengelola()) {
            $kelas = array_values(array_unique(array_merge($u->kelasBinaan(), $u->id_guru
                ? TransJadwal::where('id_guru', $u->id_guru)->whereNotNull('id_kelas')->distinct()->pluck('id_kelas')->all() : [])));
            if (!$kelas) return [];
        }
        return Student::with('kelas:id_kelas,nama_kelas')
            ->where(fn($w) => $w->whereRaw('LOWER(nama_siswa) LIKE ?', [$pola])->orWhereRaw('LOWER(nisn) LIKE ?', [$pola])->orWhereRaw('LOWER(panggilan) LIKE ?', [$pola]))
            ->when($kelas !== null, fn($w) => $w->whereIn('id_kelas', $kelas))
            ->orderBy('nama_siswa')->limit(8)->get(['id_siswa', 'nama_siswa', 'nisn', 'id_kelas', 'foto_path', 'foto_diperbarui'])
            ->map(function ($s) use ($u) {
                $pribadi = $u->bolehDashboardSiswa($s);
                return self::item('Siswa', 'bi-person', $s->nama_siswa, trim(($s->kelas?->nama_kelas ?? 'Tanpa kelas') . ($s->nisn ? " · NISN {$s->nisn}" : '')),
                    $pribadi ? '/dashboard/portal?siswa=' . rawurlencode($s->id_siswa) : '/dashboard/presensi?kelas=' . rawurlencode((string) $s->id_kelas),
                    ['foto_url' => $s->foto_url, 'id_siswa' => $s->id_siswa, 'dashboard_pribadi' => $pribadi, 'baru_tab' => $pribadi]);
            })->all();
    }

    private function surat(\Closure $like): array
    {
        $masuk = SuratMasuk::where(fn($w) => $w->where($like('perihal'))->orWhere($like('pengirim'))->orWhere($like('nomor_surat')))
            ->latest('tanggal_terima')->limit(self::MAKS)->get(['id', 'perihal', 'pengirim', 'nomor_surat'])
            ->map(fn($s) => self::item('Surat masuk', 'bi-envelope-open', $s->perihal, "Dari {$s->pengirim}" . ($s->nomor_surat ? " · {$s->nomor_surat}" : ''), '/dashboard/administrasi/surat?tab=masuk&cari=' . rawurlencode($s->perihal)));
        $keluar = SuratKeluar::where(fn($w) => $w->where($like('perihal'))->orWhere($like('tujuan'))->orWhere($like('nomor')))
            ->latest('tanggal')->limit(self::MAKS)->get(['id', 'perihal', 'tujuan', 'nomor'])
            ->map(fn($s) => self::item('Surat keluar', 'bi-send', $s->perihal, trim("Kepada {$s->tujuan}" . ($s->nomor ? " · {$s->nomor}" : '')), '/dashboard/administrasi/surat?tab=keluar&cari=' . rawurlencode($s->perihal)));
        return $masuk->merge($keluar)->all();
    }
}

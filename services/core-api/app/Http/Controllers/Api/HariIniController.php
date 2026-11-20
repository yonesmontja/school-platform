<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Classes;
use App\Models\HariLibur;
use App\Models\MasterPeriode;
use App\Models\Student;
use App\Models\TransJadwal;
use App\Models\TransNilai;
use App\Models\TransPresensi;
use App\Models\TransPresensiMapel;
use App\Services\NotifikasiService;
use App\Services\PeringatanDiniService;
use Illuminate\Http\Request;

/**
 * Mode "Hari ini" untuk guru di HP: satu permintaan berisi semua yang dibutuhkan pagi itu —
 * sesi mengajar hari ini (dengan status presensi mapel & nilai), presensi kelas binaan, dan pengingat teratas.
 */
class HariIniController extends Controller
{
    public function index(Request $request)
    {
        $u = $request->user();
        $sekarang = now(config('app.zona_sekolah'));
        $hariIni = $sekarang->toDateString();
        $periode = MasterPeriode::where('status_aktif', 'AKTIF')->value('id_periode');
        TransJadwal::perbaruiStatusOtomatis();

        $libur = HariLibur::namaPada($sekarang);
        $bukanHariPresensi = $sekarang->isWeekend() ? ($sekarang->isSunday() ? 'Hari Minggu' : 'Hari Sabtu') : null;

        // Sesi mengajar hari ini: guru melihat miliknya; pengelola tanpa id_guru melihat semua sesi hari ini
        $sesi = TransJadwal::with(['mapel:id_mapel,nama_mapel', 'kelas:id_kelas,nama_kelas', 'ruangan:id_ruangan,nama_ruangan', 'modul:id_modul,judul'])
            ->whereDate('mulai', $hariIni)->where('status_sesi', '!=', 'Batal')
            ->when($u->id_guru, fn($q) => $q->where('id_guru', $u->id_guru), fn($q) => $q->whereRaw($u->isPengelola() ? '1=1' : '1=0'))
            ->orderBy('mulai')->get();

        $presensiMapel = TransPresensiMapel::whereDate('tanggal', $hariIni)->whereIn('id_kelas', $sesi->pluck('id_kelas')->filter())
            ->selectRaw('id_kelas, id_mapel, count(*) as n')->groupBy('id_kelas', 'id_mapel')->get()->keyBy(fn($r) => "{$r->id_kelas}|{$r->id_mapel}");
        $nilai = TransNilai::whereDate('tanggal', $hariIni)->whereIn('id_kelas', $sesi->pluck('id_kelas')->filter())
            ->selectRaw('id_kelas, id_mapel, count(*) as n')->groupBy('id_kelas', 'id_mapel')->get()->keyBy(fn($r) => "{$r->id_kelas}|{$r->id_mapel}");

        $dataSesi = $sesi->map(fn($j) => [
            'id_jadwal' => $j->id_jadwal,
            'mulai' => $j->mulai->format('H:i'),
            'selesai' => $j->selesai->format('H:i'),
            'judul' => $j->mapel?->nama_mapel ?? $j->judul,
            'id_mapel' => $j->id_mapel,
            'id_kelas' => $j->id_kelas,
            'id_materi' => $j->id_materi,
            'nama_kelas' => $j->kelas?->nama_kelas,
            'ruangan' => $j->ruangan?->nama_ruangan,
            'modul' => $j->modul?->judul,
            'id_modul' => $j->id_modul,
            'pertemuan_ke' => $j->pertemuan_ke,
            'status_sesi' => $j->status_sesi,
            'presensi_mapel' => (int) ($presensiMapel["{$j->id_kelas}|{$j->id_mapel}"]->n ?? 0),
            'nilai' => (int) ($nilai["{$j->id_kelas}|{$j->id_mapel}"]->n ?? 0),
        ])->values();

        // Presensi harian kelas binaan
        $kelasBinaan = $u->kelasBinaan();
        $nonaktif = Classes::idNonaktif();
        $kelas = Classes::whereIn('id_kelas', $kelasBinaan)->when($nonaktif, fn($q) => $q->whereNotIn('id_kelas', $nonaktif))->orderBy('nama_kelas')->get(['id_kelas', 'nama_kelas']);
        $siswa = Student::whereIn('id_kelas', $kelas->pluck('id_kelas'))->orderBy('nama_siswa')->get(['id_siswa', 'nama_siswa', 'panggilan', 'id_kelas', 'foto_path', 'foto_diperbarui'])->groupBy('id_kelas');
        $presensi = TransPresensi::whereDate('tanggal', $hariIni)->whereIn('id_kelas', $kelas->pluck('id_kelas'))
            ->get(['id_siswa', 'status_kehadiran', 'keterangan'])->keyBy('id_siswa');

        $dataKelas = $kelas->map(fn($k) => [
            'id_kelas' => $k->id_kelas,
            'nama_kelas' => $k->nama_kelas,
            'siswa' => ($siswa[$k->id_kelas] ?? collect())->map(fn($s) => [
                'id_siswa' => $s->id_siswa,
                'nama_siswa' => $s->nama_siswa,
                'panggilan' => $s->panggilan,
                'foto_url' => $s->foto_url,
                'status' => $presensi[$s->id_siswa]->status_kehadiran ?? null,
                'keterangan' => $presensi[$s->id_siswa]->keterangan ?? null,
            ])->values(),
        ])->map(fn($k) => $k + ['terisi' => collect($k['siswa'])->whereNotNull('status')->count()])->values();

        // Pengingat teratas & peringatan dini (kelas binaan)
        $notif = (new NotifikasiService($u))->semua();
        $peringatan = $kelasBinaan
            ? (new PeringatanDiniService())->hitung(PeringatanDiniService::siswaUntuk($u))->whereIn('tingkat', ['TINGGI', 'SEDANG'])->count()
            : null;

        return response()->json([
            'tanggal' => $hariIni,
            'jam' => $sekarang->format('H:i'),
            'periode' => $periode,
            'libur' => $libur,
            'bukan_hari_presensi' => $bukanHariPresensi,
            'sesi' => $dataSesi,
            'kelas_binaan' => $dataKelas,
            'pengingat' => $notif->take(4)->values(),
            'jumlah_pengingat' => $notif->count(),
            'peringatan_dini' => $peringatan,
        ]);
    }
}

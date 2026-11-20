<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\MasterPeriode;
use App\Models\Student;
use App\Models\TransJadwal;
use App\Models\TransRencanaRemedial;
use Illuminate\Http\Request;

/**
 * Portal baca untuk siswa dan orang tua/wali: hanya data milik siswa yang terkait akun.
 */
class PortalController extends Controller
{
    /**
     * Daftar siswa yang bisa dipilih di portal. Akun siswa/ortu: dirinya/anaknya.
     * Staf (dashboard pribadi siswa): wajib menyebut id_siswa, dan hanya siswa itu yang dikembalikan bila boleh.
     */
    public function anak(Request $request)
    {
        $u = $request->user();
        $kolom = ['id_siswa', 'nisn', 'nama_siswa', 'id_kelas', 'jenis_kelamin', 'foto_path', 'foto_diperbarui'];
        if ($u->isPortal()) {
            $siswa = Student::with('kelas:id_kelas,nama_kelas')->whereIn('id_siswa', $u->siswaTerjangkau())->orderBy('nama_siswa')->get($kolom);
        } else {
            abort_unless(($u->isAdmin() || $u->isKepsek() || $u->isGuru()) && $request->filled('id_siswa'), 403,
                'Portal ini untuk akun siswa dan orang tua. Staf membuka dashboard pribadi siswa dari menu Siswa.');
            $satu = Student::with('kelas:id_kelas,nama_kelas,wali_kelas')->findOrFail($request->id_siswa, [...$kolom, 'tempat_lahir', 'tgl_lahir']);
            abort_unless($u->bolehDashboardSiswa($satu), 403, 'Dashboard pribadi siswa hanya untuk admin, kepala sekolah, dan wali kelasnya.');
            $siswa = collect([$satu]);
        }
        return response()->json([
            'siswa' => $siswa,
            'periodes' => MasterPeriode::orderByDesc('tahun_ajaran')->orderBy('semester')->get(),
        ]);
    }

    /**
     * Data rapor satu siswa (bentuk sama dengan /rapor/data agar perhitungan di frontend identik).
     * Narasi jurnal negatif tidak ditampilkan; skornya tetap dikirim agar nilai akhir sama dengan rapor guru.
     */
    public function rapor(Request $request)
    {
        $request->validate([
            'id_siswa' => 'required|string',
            'id_periode' => 'required|exists:master_periode,id_periode',
        ]);
        $siswa = Student::find($request->id_siswa);
        abort_unless($siswa && $request->user()->bolehDashboardSiswa($siswa), 403, 'Data siswa ini tidak dapat diakses dari akun Anda.');
        if (!$siswa?->id_kelas) {
            return response()->json(['message' => 'Siswa belum terdaftar di kelas mana pun.'], 422);
        }

        $data = RaporController::kumpulkanData($siswa->id_kelas, $request->id_periode, [$siswa->id_siswa]);
        $data['jurnal'] = $data['jurnal']->map(function ($j) {
            $total = $j->val_S + $j->val_T + $j->val_N + $j->val_K + $j->val_M;
            $item = $j->toArray();
            $item['positif'] = $total >= 0;
            if ($total < 0) $item['narasi_kejadian'] = null;
            return $item;
        })->values();

        $data['remedial'] = $this->remedial($siswa->id_siswa, $request->id_periode);
        $data['jadwal_pekan'] = $this->jadwalPekan($siswa->id_kelas, $data['remedial']);

        return response()->json($data);
    }

    /**
     * Rapor berjalan: ringkasan satu pekan (Senin–Minggu) untuk orang tua — kehadiran, nilai baru, catatan positif,
     * tindak lanjut — beserta teks siap kirim. Staf (admin, kepsek, wali kelas) juga mendapat tautan WhatsApp ke orang tua.
     */
    public function pekan(Request $request)
    {
        $request->validate(['id_siswa' => 'required|string', 'minggu' => 'nullable|integer|min:-26|max:0']);
        $u = $request->user();
        $siswa = Student::with(['kelas:id_kelas,nama_kelas', 'ortu', 'wali'])->find($request->id_siswa);
        abort_unless($siswa && $u->bolehDashboardSiswa($siswa), 403, 'Data siswa ini tidak dapat diakses dari akun Anda.');

        $zona = config('app.zona_sekolah');
        $senin = now($zona)->startOfWeek(\Carbon\CarbonInterface::MONDAY)->addWeeks((int) $request->minggu);
        $minggu = $senin->copy()->addDays(6);
        $rentang = [$senin->toDateString(), $minggu->toDateString()];

        $presensi = \App\Models\TransPresensi::where('id_siswa', $siswa->id_siswa)->whereBetween('tanggal', $rentang)->orderBy('tanggal')
            ->get(['tanggal', 'status_kehadiran', 'keterangan']);
        $nilai = \App\Models\TransNilai::efektif()->with(['mapel:id_mapel,nama_mapel,kkm', 'materi:id_materi,nama_materi'])
            ->where('id_siswa', $siswa->id_siswa)->whereBetween('tanggal', $rentang)->whereNotNull('nilai')->orderBy('tanggal')
            ->get(['id_nilai', 'tanggal', 'id_mapel', 'id_materi', 'nilai', 'tipe_nilai']);
        $jurnal = \App\Models\TransJurnal::where('id_siswa', $siswa->id_siswa)->whereBetween('tanggal', $rentang)->orderBy('tanggal')
            ->get(['tanggal', 'narasi_kejadian', 'sensitif', 'val_S', 'val_T', 'val_N', 'val_K', 'val_M']);
        $remedial = TransRencanaRemedial::with('mapel:id_mapel,nama_mapel')->where('id_siswa', $siswa->id_siswa)
            ->where(fn($q) => $q->whereBetween('tanggal_rencana', $rentang)->orWhereBetween('tanggal_selesai', $rentang))
            ->get(['id_rencana', 'id_mapel', 'opsi_tindakan', 'tanggal_rencana', 'tanggal_selesai', 'status']);

        $hitung = collect(['HADIR', 'SAKIT', 'IZIN', 'ALPA'])->mapWithKeys(fn($k) => [$k => $presensi->where('status_kehadiran', $k)->count()]);
        $dataNilai = $nilai->map(fn($n) => [
            'tanggal' => $n->tanggal, 'mapel' => $n->mapel?->nama_mapel, 'materi' => $n->materi?->nama_materi,
            'nilai' => (float) $n->nilai, 'kkm' => (float) ($n->mapel?->kkm ?? 75), 'tuntas' => (float) $n->nilai >= (float) ($n->mapel?->kkm ?? 75),
            'remedial' => $n->tipe_nilai === 'REMEDIAL',
        ])->values();
        // Hanya catatan positif dan tidak sensitif yang dikutip; catatan lain cukup dihitung
        $total = fn($j) => $j->val_S + $j->val_T + $j->val_N + $j->val_K + $j->val_M;
        $positif = $jurnal->filter(fn($j) => !$j->sensitif && $total($j) > 0)
            ->map(fn($j) => ['tanggal' => $j->tanggal->toDateString(), 'narasi' => \Illuminate\Support\Str::limit($j->narasi_kejadian, 160)])->values();
        $perluPerhatian = $jurnal->filter(fn($j) => $total($j) < 0)->count();
        $dataRemedial = $remedial->map(fn($r) => ['mapel' => $r->mapel?->nama_mapel, 'tindakan' => $r->opsi_tindakan, 'status' => $r->status,
            'tanggal' => ($r->status === 'SELESAI' ? $r->tanggal_selesai : $r->tanggal_rencana)?->toDateString()])->values();

        // Teks ringkasan untuk dikirim/disalin
        $fmt = fn($t) => \Carbon\Carbon::parse($t)->locale('id')->translatedFormat('j M');
        $judulPekan = $fmt($senin) . ' – ' . $minggu->locale('id')->translatedFormat('j M Y');
        $tidakHadir = collect(['SAKIT' => 'sakit', 'IZIN' => 'izin', 'ALPA' => 'tanpa keterangan'])
            ->filter(fn($l, $k) => $hitung[$k] > 0)->map(fn($l, $k) => "{$hitung[$k]} {$l}")->implode(', ');
        $baris = ["*Rapor berjalan {$siswa->nama_siswa}* ({$siswa->kelas?->nama_kelas})", "Pekan {$judulPekan}", ''];
        $baris[] = $presensi->isEmpty() ? 'Kehadiran: belum ada catatan presensi pekan ini.'
            : "Kehadiran: hadir {$hitung['HADIR']} dari {$presensi->count()} hari" . ($tidakHadir ? " ({$tidakHadir})" : '') . '.';
        if ($dataNilai->isNotEmpty()) {
            $baris[] = 'Nilai baru:';
            foreach ($dataNilai as $n) {
                $baris[] = "- {$n['mapel']}" . ($n['materi'] ? " ({$n['materi']})" : '') . ": {$n['nilai']}" . ($n['tuntas'] ? ' (tuntas)' : " (KKM {$n['kkm']}, belum tuntas)");
            }
        } else {
            $baris[] = 'Belum ada nilai baru pekan ini.';
        }
        if ($dataRemedial->isNotEmpty()) {
            $baris[] = 'Tindak lanjut: ' . $dataRemedial->map(fn($r) => "{$r['mapel']} ({$r['tindakan']}, "
                . ($r['status'] === 'SELESAI' ? 'selesai' : 'dijadwalkan ' . ($r['tanggal'] ? $fmt($r['tanggal']) : '-')) . ')')->implode('; ') . '.';
        }
        if ($positif->isNotEmpty()) $baris[] = 'Catatan baik: ' . $positif->first()['narasi'];
        $baris[] = '';
        $baris[] = 'Detail lengkap ada di portal SAPrapor. Terima kasih atas dukungan Bapak/Ibu.';
        $teks = implode("\n", $baris);

        $wa = null;
        if (!$u->isPortal()) {
            $no = $siswa->ortu?->no_wa ?: ($siswa->wali?->no_wa ?: $siswa->no_wa);
            $nomor = \App\Services\WhatsAppService::formatNomor($no);
            $wa = $nomor ? "https://wa.me/{$nomor}?text=" . rawurlencode($teks) : null;
        }

        return response()->json([
            'pekan' => ['mulai' => $rentang[0], 'selesai' => $rentang[1], 'judul' => $judulPekan, 'minggu' => (int) $request->minggu],
            'presensi' => $presensi->map(fn($p) => ['tanggal' => $p->tanggal->toDateString(), 'status' => $p->status_kehadiran, 'keterangan' => $p->keterangan])->values(),
            'hitung' => $hitung,
            'nilai' => $dataNilai,
            'catatan_positif' => $positif,
            'catatan_perhatian' => $perluPerhatian,
            'remedial' => $dataRemedial,
            'teks' => $teks,
            'tautan_wa' => $wa,
        ]);
    }

    /** Rencana tindak lanjut (remedial) anak pada periode ini beserta hasilnya. */
    private function remedial(string $idSiswa, string $idPeriode): array
    {
        return TransRencanaRemedial::with([
                'mapel:id_mapel,nama_mapel,kkm',
                'nilaiAsal:id_nilai,id_materi,nilai,tanggal',
                'nilaiAsal.materi:id_materi,nama_materi',
                'nilaiRemedial:id_nilai,id_rencana,nilai,tanggal',
                'jadwal:id_jadwal,mulai,selesai,id_ruangan',
                'jadwal.ruangan:id_ruangan,nama_ruangan',
            ])
            ->where('id_siswa', $idSiswa)
            ->whereHas('nilaiAsal', fn($q) => $q->where('id_periode', $idPeriode))
            ->orderByDesc('tanggal_rencana')
            ->get(['id_rencana', 'id_nilai_asal', 'id_mapel', 'opsi_tindakan', 'catatan', 'tanggal_rencana', 'status', 'tanggal_selesai', 'id_jadwal'])
            ->map(fn($r) => [
                'id_rencana' => $r->id_rencana,
                'mapel' => $r->mapel?->nama_mapel,
                'kkm' => (float) ($r->mapel?->kkm ?? 75),
                'materi' => $r->nilaiAsal?->materi?->nama_materi,
                'opsi_tindakan' => $r->opsi_tindakan,
                'catatan' => $r->catatan,
                'tanggal_rencana' => $r->tanggal_rencana?->toDateString(),
                'status' => $r->status,
                'nilai_asal' => $r->nilaiAsal ? (float) $r->nilaiAsal->nilai : null,
                'nilai_remedial' => $r->nilaiRemedial ? (float) $r->nilaiRemedial->nilai : null,
                'tanggal_remedial' => $r->nilaiRemedial?->tanggal,
                'id_jadwal' => $r->id_jadwal,
                'jam' => $r->jadwal ? $r->jadwal->mulai->format('H:i') . '–' . $r->jadwal->selesai->format('H:i') : null,
                'ruangan' => $r->jadwal?->ruangan?->nama_ruangan,
            ])->all();
    }

    /**
     * Jadwal kelas 7 hari ke depan. Sesi remedial hanya ditampilkan bila milik anak ini, karena judul & catatannya
     * memuat nama siswa lain; catatan sesi tidak pernah dikirim.
     */
    private function jadwalPekan(string $idKelas, array $remedial): array
    {
        $hariIni = now(config('app.zona_sekolah'))->startOfDay();
        $milikAnak = collect($remedial)->pluck('opsi_tindakan', 'id_jadwal')->filter();

        return TransJadwal::with(['mapel:id_mapel,nama_mapel', 'guru:id_guru,nama_guru', 'ruangan:id_ruangan,nama_ruangan'])
            ->where('id_kelas', $idKelas)->where('status_sesi', '!=', 'Batal')
            ->whereBetween('mulai', [$hariIni->format('Y-m-d H:i:s'), $hariIni->copy()->addDays(7)->format('Y-m-d H:i:s')])
            ->orderBy('mulai')
            ->get(['id_jadwal', 'id_mapel', 'id_guru', 'id_ruangan', 'judul', 'mulai', 'selesai', 'status_sesi'])
            ->filter(fn($j) => !str_starts_with((string) $j->judul, 'Remedial ·') || $milikAnak->has($j->id_jadwal))
            ->map(fn($j) => [
                'tanggal' => $j->mulai->toDateString(),
                'jam' => $j->mulai->format('H:i') . '–' . $j->selesai->format('H:i'),
                'judul' => $milikAnak->has($j->id_jadwal) ? "Remedial: {$milikAnak[$j->id_jadwal]}" : ($j->mapel?->nama_mapel ?? $j->judul),
                'remedial' => $milikAnak->has($j->id_jadwal),
                'guru' => $j->guru?->nama_guru,
                'ruangan' => $j->ruangan?->nama_ruangan,
                'status' => $j->status_sesi,
            ])->values()->all();
    }
}

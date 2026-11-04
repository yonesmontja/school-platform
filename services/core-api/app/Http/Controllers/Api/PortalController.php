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
    public function anak(Request $request)
    {
        return response()->json([
            'siswa' => Student::with('kelas:id_kelas,nama_kelas')
                ->whereIn('id_siswa', $request->user()->siswaTerjangkau())
                ->orderBy('nama_siswa')
                ->get(['id_siswa', 'nisn', 'nama_siswa', 'id_kelas', 'jenis_kelamin']),
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
        abort_unless(in_array($request->id_siswa, $request->user()->siswaTerjangkau(), true), 403, 'Data siswa ini tidak dapat diakses dari akun Anda.');

        $siswa = Student::find($request->id_siswa);
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

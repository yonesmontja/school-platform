<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Classes;
use App\Models\MasterMBK;
use App\Models\Student;
use App\Models\Subject;
use App\Models\Teacher;
use App\Models\TransJurnal;
use App\Models\TransNilai;
use App\Models\TransPresensi;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class DashboardController extends Controller
{
    /**
     * Data mentah dasbor analitik untuk satu kelas atau seluruh kelas pada satu periode.
     * KPI, EWS, dan grafik (termasuk grafik kustom pengguna) dihitung di frontend
     * agar filter dan pengaturan dasbor terasa instan.
     */
    public function index(Request $request)
    {
        $request->validate([
            'id_periode' => 'required|exists:master_periode,id_periode',
            'id_kelas' => 'nullable|string',
        ]);

        // "ALL" atau kosong = seluruh kelas (analisis komparatif)
        $idKelas = $request->filled('id_kelas') && $request->id_kelas !== 'ALL' ? $request->id_kelas : null;
        if ($idKelas && !Classes::whereKey($idKelas)->exists()) {
            return response()->json(['message' => 'Kelas tidak ditemukan.'], 422);
        }

        $students = Student::when($idKelas, fn($q) => $q->where('id_kelas', $idKelas))
            ->orderBy('nama_siswa')
            ->get(['id_siswa', 'nisn', 'nama_siswa', 'id_kelas']);

        $nilai = TransNilai::efektif()->where('id_periode', $request->id_periode)
            ->when($idKelas, fn($q) => $q->where('id_kelas', $idKelas))
            ->orderBy('tanggal')
            ->get(['id_siswa', 'id_kelas', 'id_mapel', 'id_jenis', 'tanggal', 'nilai', 'poin_S', 'poin_T', 'poin_N', 'poin_K', 'poin_M']);

        $presensi = TransPresensi::where('id_periode', $request->id_periode)
            ->when($idKelas, fn($q) => $q->where('id_kelas', $idKelas))
            ->get(['id_siswa', 'id_kelas', 'tanggal', 'status_kehadiran']);

        // Jurnal belum punya kolom periode; diambil per kelas seperti GAS
        $jurnal = TransJurnal::when($idKelas, fn($q) => $q->where('id_kelas', $idKelas))
            ->orderBy('tanggal')
            ->get(['id_siswa', 'id_kelas', 'tanggal', 'mode_dampak', 'narasi_kejadian', 'val_S', 'val_T', 'val_N', 'val_K', 'val_M']);

        // Nilai per indikator (reguler & remedial) untuk analisis indikator yang perlu perhatian;
        // frontend memakai nilai remedial terbaru, sama seperti deskripsi capaian rapor
        $nilaiIndikator = DB::table('trans_nilai_indikator as ni')
            ->join('trans_nilai as n', 'n.id_nilai', '=', 'ni.id_nilai')
            ->join('master_indikator as i', 'i.id_indikator', '=', 'ni.id_indikator')
            ->join('master_materi as m', 'm.id_materi', '=', 'i.id_materi')
            ->where('n.id_periode', $request->id_periode)
            ->when($idKelas, fn($q) => $q->where('n.id_kelas', $idKelas))
            ->orderBy('n.tanggal')
            ->get(['n.id_siswa', 'n.id_kelas', 'n.id_mapel', 'n.tipe_nilai', 'n.tanggal', 'ni.id_indikator', 'ni.nilai',
                'i.deskripsi', 'i.urutan', 'i.id_materi', 'm.nama_materi']);

        return response()->json([
            'jumlah_guru' => Teacher::count(),
            'classes' => Classes::orderBy('nama_kelas')->get(['id_kelas', 'nama_kelas']),
            'students' => $students,
            'subjects' => Subject::orderBy('nama_mapel')->get(['id_mapel', 'nama_mapel', 'kkm']),
            'mbk' => MasterMBK::orderBy('kategori_penilaian')->get(['id_jenis', 'kategori_penilaian']),
            'nilai' => $nilai,
            'presensi' => $presensi,
            'jurnal' => $jurnal,
            'nilai_indikator' => $nilaiIndikator,
        ]);
    }
}

<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Classes;
use App\Models\MasterPeriode;
use App\Models\MasterProyek;
use App\Models\SchoolSetting;
use App\Models\Student;
use App\Models\Subject;
use App\Models\TransCatatanP5;
use App\Models\TransCatatanWali;
use App\Models\TransJurnal;
use App\Models\TransNilai;
use App\Models\TransNilaiP5;
use App\Models\TransPresensi;
use App\Services\CatatanWaliAIService;
use App\Services\WhatsAppService;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

class RaporController extends Controller
{
    /**
     * Seluruh data rapor satu kelas pada satu periode. Perhitungan nilai akhir (3 mode kalkulasi
     * dan bobot STNKM) dilakukan di frontend agar perubahan mode/bobot langsung terlihat.
     */
    public function data(Request $request)
    {
        $request->validate([
            'id_kelas' => 'required|exists:classes,id_kelas',
            'id_periode' => 'required|exists:master_periode,id_periode',
        ]);
        $idKelas = $request->id_kelas;
        $idPeriode = $request->id_periode;

        $students = Student::with(['agama:id_agama,nama_agama', 'ortu', 'wali'])
            ->where('id_kelas', $idKelas)
            ->orderBy('nama_siswa')
            ->get();
        $idSiswa = $students->pluck('id_siswa');

        $proyek = MasterProyek::with(['targets' => fn($q) => $q->orderBy('dimensi')->orderBy('id_target')])
            ->where('id_kelas', $idKelas)
            ->where('id_periode', $idPeriode)
            ->orderBy('created_at')
            ->get();

        return response()->json([
            'kelas' => $kelas = Classes::find($idKelas),
            // Terpisah dari kelas: relasi waliKelas akan menimpa kolom wali_kelas saat di-serialize
            'wali_kelas' => $kelas?->waliKelas()->first(['id_guru', 'nama_guru', 'nip_nik']),
            'periode' => MasterPeriode::find($idPeriode),
            'settings' => SchoolSetting::first(),
            'students' => $students,
            'subjects' => Subject::orderBy('kelompok')->orderBy('nama_mapel')->get(['id_mapel', 'nama_mapel', 'kelompok', 'kkm']),
            'nilai' => TransNilai::with('materi:id_materi,nama_materi')
                ->where('id_kelas', $idKelas)
                ->where('id_periode', $idPeriode)
                ->get(['id_nilai', 'id_siswa', 'id_mapel', 'id_materi', 'tanggal', 'nilai', 'poin_S', 'poin_T', 'poin_N', 'poin_K', 'poin_M']),
            // Jurnal belum punya kolom periode; seluruh jurnal siswa kelas ini dipakai, sama seperti GAS
            'jurnal' => TransJurnal::whereIn('id_siswa', $idSiswa)
                ->orderBy('tanggal')
                ->get(['id_jurnal', 'id_siswa', 'tanggal', 'mode_dampak', 'narasi_kejadian', 'val_S', 'val_T', 'val_N', 'val_K', 'val_M']),
            'presensi' => TransPresensi::where('id_kelas', $idKelas)
                ->where('id_periode', $idPeriode)
                ->get(['id_siswa', 'tanggal', 'status_kehadiran']),
            'catatan_wali' => TransCatatanWali::whereIn('id_siswa', $idSiswa)->where('id_periode', $idPeriode)->get(),
            'proyek' => $proyek,
            'nilai_p5' => TransNilaiP5::whereIn('id_proyek', $proyek->pluck('id_proyek'))->get(['id_proyek', 'id_siswa', 'id_target', 'predikat']),
            'catatan_p5' => TransCatatanP5::whereIn('id_proyek', $proyek->pluck('id_proyek'))->get(['id_proyek', 'id_siswa', 'catatan_proses']),
        ]);
    }

    public function simpanCatatanWali(Request $request)
    {
        $request->validate([
            'id_siswa' => 'required|exists:students,id_siswa',
            'id_periode' => 'required|exists:master_periode,id_periode',
            'catatan_final' => 'required|string|max:2000',
        ]);

        $catatan = TransCatatanWali::firstOrNew(['id_siswa' => $request->id_siswa, 'id_periode' => $request->id_periode]);
        $catatan->id_catatan_wali ??= 'CWL-' . Str::uuid();
        $catatan->catatan_final = trim($request->catatan_final);
        $catatan->save();

        return response()->json(['success' => true, 'message' => 'Catatan wali kelas disimpan.', 'data' => $catatan]);
    }

    public function generateCatatanWali(Request $request, CatatanWaliAIService $ai)
    {
        $request->validate([
            'id_siswa' => 'required|exists:students,id_siswa',
            'ai_mode' => ['nullable', Rule::in(CatatanWaliAIService::MODES)],
        ]);

        $siswa = Student::find($request->id_siswa);
        $jurnal = TransJurnal::where('id_siswa', $siswa->id_siswa)
            ->orderBy('tanggal')
            ->get(['tanggal', 'narasi_kejadian', 'val_S', 'val_T', 'val_N', 'val_K', 'val_M'])
            ->map(fn($j) => [...$j->toArray(), 'tanggal' => $j->tanggal?->format('Y-m-d')])
            ->all();

        $hasil = $ai->generate($siswa->nama_siswa, $jurnal, $request->ai_mode ?? 'GEMINI');

        return response()->json(['success' => true, 'data' => $hasil['text'], 'mode' => $hasil['mode']]);
    }

    public function kirimWhatsApp(Request $request, WhatsAppService $wa)
    {
        $request->validate([
            'daftar_pesan' => 'required|array|min:1|max:10',
            'daftar_pesan.*.target' => 'required|string|max:100',
            'daftar_pesan.*.message' => 'required|string|max:4000',
        ]);

        $hasil = $wa->kirim($request->daftar_pesan);

        return response()->json($hasil, $hasil['sent'] ? 200 : 422);
    }
}

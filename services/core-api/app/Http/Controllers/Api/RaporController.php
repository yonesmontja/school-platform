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
use App\Services\RaporAIService;
use App\Services\RemedialService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
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
        // Guru hanya boleh membuka rapor kelas binaannya (wali kelas)
        if (!$request->user()->bolehKelolaKelas($request->id_kelas)) {
            return response()->json(['message' => 'Rapor hanya dapat dibuka oleh wali kelas, kepala sekolah, atau admin.'], 403);
        }

        return response()->json(self::kumpulkanData($request->id_kelas, $request->id_periode));
    }

    /**
     * Data rapor satu kelas & periode. Bila $hanyaSiswa diisi (portal siswa/ortu), data dibatasi
     * pada siswa tersebut agar data siswa lain tidak ikut terkirim.
     */
    public static function kumpulkanData(string $idKelas, string $idPeriode, ?array $hanyaSiswa = null): array
    {
        $students = Student::with(['agama:id_agama,nama_agama', 'ortu', 'wali'])
            ->where('id_kelas', $idKelas)
            ->when($hanyaSiswa !== null, fn($q) => $q->whereIn('id_siswa', $hanyaSiswa))
            ->orderBy('nama_siswa')
            ->get();
        $idSiswa = $students->pluck('id_siswa');

        $proyek = MasterProyek::with(['targets' => fn($q) => $q->orderBy('dimensi')->orderBy('id_target')])
            ->where('id_kelas', $idKelas)
            ->where('id_periode', $idPeriode)
            ->orderBy('created_at')
            ->get();

        return [
            'kelas' => $kelas = Classes::find($idKelas),
            // Terpisah dari kelas: relasi waliKelas akan menimpa kolom wali_kelas saat di-serialize
            'wali_kelas' => $kelas?->waliKelas()->first(['id_guru', 'nama_guru', 'nip_nik']),
            'periode' => MasterPeriode::find($idPeriode),
            'settings' => SchoolSetting::first(),
            'students' => $students,
            'subjects' => Subject::orderBy('kelompok')->orderBy('nama_mapel')->get(['id_mapel', 'nama_mapel', 'kelompok', 'kkm']),
            'nilai' => RemedialService::batasiNilai(TransNilai::efektif()->with('materi:id_materi,nama_materi')
                ->where('id_kelas', $idKelas)
                ->where('id_periode', $idPeriode)
                ->whereIn('id_siswa', $idSiswa)
                ->get(['id_nilai', 'id_siswa', 'id_mapel', 'id_materi', 'tanggal', 'tipe_nilai', 'nilai', 'poin_S', 'poin_T', 'poin_N', 'poin_K', 'poin_M'])),
            // Jurnal belum punya kolom periode; seluruh jurnal siswa kelas ini dipakai, sama seperti GAS
            'jurnal' => TransJurnal::whereIn('id_siswa', $idSiswa)
                ->orderBy('tanggal')
                ->get(['id_jurnal', 'id_siswa', 'tanggal', 'mode_dampak', 'sensitif', 'narasi_kejadian', 'val_S', 'val_T', 'val_N', 'val_K', 'val_M'])
                // Narasi sensitif tidak pernah ikut dokumen rapor/portal (dibawa pulang ke orang tua); skornya tetap dihitung
                ->each(function ($j) { if ($j->sensitif) $j->narasi_kejadian = null; }),
            'presensi' => TransPresensi::where('id_kelas', $idKelas)
                ->where('id_periode', $idPeriode)
                ->whereIn('id_siswa', $idSiswa)
                ->get(['id_siswa', 'tanggal', 'status_kehadiran']),
            // Nilai per indikator (reguler & remedial) untuk deskripsi capaian; frontend memilih nilai terbaru remedial
            'nilai_indikator' => RemedialService::batasiNilai(DB::table('trans_nilai_indikator as ni')
                ->join('trans_nilai as n', 'n.id_nilai', '=', 'ni.id_nilai')
                ->join('master_indikator as i', 'i.id_indikator', '=', 'ni.id_indikator')
                ->join('master_materi as m', 'm.id_materi', '=', 'i.id_materi')
                ->where('n.id_kelas', $idKelas)->where('n.id_periode', $idPeriode)->whereIn('n.id_siswa', $idSiswa)
                ->where(fn($q) => $q->whereNull('n.id_jenis')->orWhereNotIn('n.id_jenis', TransNilai::jenisDiagnostik()))
                ->orderBy('n.tanggal')
                ->get(['n.id_siswa', 'n.id_mapel', 'n.tipe_nilai', 'n.tanggal', 'ni.id_indikator', 'ni.nilai', 'i.deskripsi', 'i.urutan',
                    'i.id_materi', 'm.nama_materi'])),
            'catatan_wali' => TransCatatanWali::whereIn('id_siswa', $idSiswa)->where('id_periode', $idPeriode)->get(),
            'proyek' => $proyek,
            'nilai_p5' => TransNilaiP5::whereIn('id_proyek', $proyek->pluck('id_proyek'))->whereIn('id_siswa', $idSiswa)->get(['id_proyek', 'id_siswa', 'id_target', 'predikat']),
            'catatan_p5' => TransCatatanP5::whereIn('id_proyek', $proyek->pluck('id_proyek'))->whereIn('id_siswa', $idSiswa)->get(['id_proyek', 'id_siswa', 'catatan_proses']),
        ];
    }

    private function cekWaliSiswa(Request $request, string $idSiswa): void
    {
        $idKelas = Student::whereKey($idSiswa)->value('id_kelas');
        abort_unless($request->user()->bolehKelolaKelas($idKelas), 403, 'Catatan wali hanya dapat diubah oleh wali kelas siswa ini, kepala sekolah, atau admin.');
    }

    public function simpanCatatanWali(Request $request)
    {
        $request->validate([
            'id_siswa' => 'required|exists:students,id_siswa',
            'id_periode' => 'required|exists:master_periode,id_periode',
            'catatan_final' => 'required|string|max:2000',
        ]);
        $this->cekWaliSiswa($request, $request->id_siswa);

        $catatan = TransCatatanWali::firstOrNew(['id_siswa' => $request->id_siswa, 'id_periode' => $request->id_periode]);
        $catatan->id_catatan_wali ??= 'CWL-' . Str::uuid();
        $catatan->catatan_final = trim($request->catatan_final);
        $catatan->save();

        return response()->json(['success' => true, 'message' => 'Catatan wali kelas disimpan.', 'data' => $catatan]);
    }

    public function generateCatatanWali(Request $request, RaporAIService $ai)
    {
        $request->validate([
            'id_siswa' => 'required|exists:students,id_siswa',
            'ai_mode' => ['nullable', Rule::in(RaporAIService::MODES)],
        ]);
        $this->cekWaliSiswa($request, $request->id_siswa);

        $siswa = Student::find($request->id_siswa);
        // Jurnal sensitif tidak dijadikan bahan catatan wali (teksnya masuk rapor)
        $jurnal = TransJurnal::where('id_siswa', $siswa->id_siswa)->where('sensitif', false)
            ->orderBy('tanggal')
            ->get(['tanggal', 'narasi_kejadian', 'val_S', 'val_T', 'val_N', 'val_K', 'val_M'])
            ->map(fn($j) => [...$j->toArray(), 'tanggal' => $j->tanggal?->format('Y-m-d')])
            ->all();

        $hasil = $ai->catatanWali($siswa->nama_siswa, $jurnal, $request->ai_mode ?? 'GEMINI');

        return response()->json(['success' => true, 'data' => $hasil['text'], 'mode' => $hasil['mode']]);
    }
}

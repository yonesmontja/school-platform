<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Student;
use App\Models\TransDiagnostikNonkognitif;
use App\Models\TransNilai;
use App\Models\TransNilaiIndikator;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

/**
 * Asesmen diagnostik awal semester.
 * - Kognitif: nilai dari aktivitas berjenis DIAGNOSTIK (diisi lewat Input Nilai / Import Excel); dikelompokkan di frontend
 *   menurut KKTP untuk pembelajaran berdiferensiasi. Semua staf boleh melihat kelas mana pun.
 * - Non-kognitif: gaya belajar, minat, kesejahteraan, dukungan rumah; diisi wali kelas, kepsek, atau admin.
 */
class DiagnostikController extends Controller
{
    public function kognitif(Request $request)
    {
        $request->validate([
            'id_kelas' => 'required|exists:classes,id_kelas',
            'id_periode' => 'required|exists:master_periode,id_periode',
            'id_mapel' => 'nullable|exists:subjects,id_mapel',
        ]);
        $jenis = TransNilai::jenisDiagnostik();

        $nilai = TransNilai::with(['materi:id_materi,nama_materi', 'jenis:id_jenis,kategori_penilaian', 'mapel:id_mapel,nama_mapel,kkm'])
            ->where('id_kelas', $request->id_kelas)->where('id_periode', $request->id_periode)
            ->whereIn('id_jenis', $jenis)
            ->when($request->id_mapel, fn($q, $v) => $q->where('id_mapel', $v))
            ->orderBy('tanggal')
            ->get(['id_nilai', 'id_siswa', 'id_mapel', 'id_materi', 'id_jenis', 'tanggal', 'nilai']);

        $indikator = TransNilaiIndikator::with('indikator:id_indikator,deskripsi,urutan')
            ->whereIn('id_nilai', $nilai->pluck('id_nilai'))
            ->get(['id_nilai', 'id_indikator', 'nilai']);

        return response()->json([
            'students' => Student::where('id_kelas', $request->id_kelas)->orderBy('nama_siswa')->get(['id_siswa', 'nisn', 'nama_siswa']),
            'nilai' => $nilai,
            'nilai_indikator' => $indikator,
            'ada_aktivitas_diagnostik' => count($jenis) > 0,
        ]);
    }

    public function nonkognitif(Request $request)
    {
        $request->validate([
            'id_kelas' => 'required|exists:classes,id_kelas',
            'id_periode' => 'required|exists:master_periode,id_periode',
        ]);
        $siswa = Student::where('id_kelas', $request->id_kelas)->orderBy('nama_siswa')->get(['id_siswa', 'nisn', 'nama_siswa', 'jenis_kelamin']);

        return response()->json([
            'students' => $siswa,
            'data' => TransDiagnostikNonkognitif::where('id_periode', $request->id_periode)->whereIn('id_siswa', $siswa->pluck('id_siswa'))->get(),
            'boleh_ubah' => $request->user()->bolehKelolaKelas($request->id_kelas),
        ]);
    }

    public function simpanNonkognitif(Request $request)
    {
        $request->validate([
            'id_kelas' => 'required|exists:classes,id_kelas',
            'id_periode' => 'required|exists:master_periode,id_periode',
            'records' => 'required|array|min:1',
            'records.*.id_siswa' => 'required|string',
            'records.*.gaya_belajar' => ['nullable', Rule::in(TransDiagnostikNonkognitif::GAYA_BELAJAR)],
            'records.*.minat' => 'nullable|string|max:255',
            'records.*.kesejahteraan' => ['nullable', Rule::in(TransDiagnostikNonkognitif::KESEJAHTERAAN)],
            'records.*.dukungan_rumah' => ['nullable', Rule::in(TransDiagnostikNonkognitif::DUKUNGAN)],
            'records.*.catatan' => 'nullable|string|max:1000',
        ]);
        abort_unless($request->user()->bolehKelolaKelas($request->id_kelas), 403, 'Diagnostik non-kognitif diisi oleh wali kelas, kepala sekolah, atau admin.');

        $anggota = Student::where('id_kelas', $request->id_kelas)->pluck('id_siswa')->flip();
        $records = collect($request->records);
        if ($records->contains(fn($r) => !isset($anggota[$r['id_siswa']]))) {
            return response()->json(['message' => 'Ada siswa yang bukan anggota kelas ini.'], 422);
        }

        $kolom = ['gaya_belajar', 'minat', 'kesejahteraan', 'dukungan_rumah', 'catatan'];
        $disimpan = 0;
        DB::transaction(function () use ($records, $request, $kolom, &$disimpan) {
            foreach ($records as $r) {
                $isi = array_map(fn($v) => is_string($v) ? (trim($v) ?: null) : $v, array_intersect_key($r, array_flip($kolom)));
                $baris = TransDiagnostikNonkognitif::firstOrNew(['id_siswa' => $r['id_siswa'], 'id_periode' => $request->id_periode]);
                if (!$baris->exists && !array_filter($isi)) continue; // baris kosong tidak perlu dibuat
                $baris->fill($isi);
                if (!$baris->isDirty()) continue;
                $baris->diisi_oleh = $request->user()->id;
                $baris->save();
                $disimpan++;
            }
        });

        return response()->json(['success' => true, 'message' => "Diagnostik non-kognitif disimpan ({$disimpan} siswa diperbarui)."]);
    }
}

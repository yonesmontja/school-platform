<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Classes;
use App\Models\MasterPeriode;
use App\Models\Student;
use App\Models\Subject;
use App\Models\TransJurnal;
use App\Models\TransNilai;
use App\Services\RemedialService;
use Illuminate\Http\Request;

class LaporanController extends Controller
{
    /**
     * Data mentah Laporan STNKM satu kelas & periode. Agregasi (mingguan/bulanan, filter mapel,
     * rentang minggu, subset siswa) dilakukan di frontend agar filter terasa instan.
     */
    public function stnkm(Request $request)
    {
        $request->validate([
            'id_kelas' => 'required|exists:classes,id_kelas',
            'id_periode' => 'required|exists:master_periode,id_periode',
        ]);

        $students = \App\Services\RiwayatRombel::anggota($request->id_kelas, $request->id_periode)
            ->orderBy('nama_siswa')
            ->get(['id_siswa', 'nisn', 'nama_siswa']);

        $nilai = RemedialService::batasiNilai(TransNilai::efektif()->with(['materi:id_materi,nama_materi', 'jenis:id_jenis,kategori_penilaian'])->where('id_kelas', $request->id_kelas)
            ->where('id_periode', $request->id_periode)
            ->orderBy('tanggal')
            ->get(['id_siswa', 'id_mapel', 'id_materi', 'id_jenis', 'metode_stnkm', 'tanggal', 'tipe_nilai', 'nilai', 'poin_S', 'poin_T', 'poin_N', 'poin_K', 'poin_M']));

        // Jurnal belum punya kolom periode, jadi diambil seluruh jurnal siswa kelas ini (sama seperti GAS);
        // frontend membatasinya dengan rentang minggu sejak tanggal mulai semester
        $jurnal = TransJurnal::where('id_kelas', $request->id_kelas)
            ->orderBy('tanggal')
            ->get(['id_siswa', 'tanggal', 'val_S', 'val_T', 'val_N', 'val_K', 'val_M']);

        return response()->json([
            'kelas' => Classes::find($request->id_kelas, ['id_kelas', 'nama_kelas']),
            'periode' => MasterPeriode::find($request->id_periode),
            'students' => $students,
            'mapels' => Subject::whereIn('id_mapel', $nilai->pluck('id_mapel')->unique())
                ->orderBy('nama_mapel')
                ->get(['id_mapel', 'nama_mapel']),
            'nilai' => $nilai,
            'jurnal' => $jurnal,
        ]);
    }

    /**
     * Rincian Laporan STNKM satu siswa: seluruh nilai efektif & jurnalnya pada kelas/periode itu, lengkap dengan
     * mapel, materi, jenis, guru & pengisi, serta narasi jurnal (disamarkan bila jurnal sensitif tidak boleh dibaca).
     * Filter rentang minggu, mapel, dan sumber STNKM dihitung di frontend dengan rumus yang sama seperti rekap kelas.
     */
    public function stnkmSiswa(Request $request)
    {
        $request->validate([
            'id_kelas' => 'required|exists:classes,id_kelas',
            'id_periode' => 'required|exists:master_periode,id_periode',
            'id_siswa' => 'required|exists:students,id_siswa',
        ]);
        $siswa = \App\Services\RiwayatRombel::anggota($request->id_kelas, $request->id_periode)
            ->where('id_siswa', $request->id_siswa)->first(['id_siswa', 'nisn', 'nama_siswa']);
        abort_unless($siswa, 404, 'Siswa bukan anggota kelas ini pada periode tersebut.');

        $nilai = RemedialService::batasiNilai(TransNilai::efektif()
            ->with(['materi:id_materi,nama_materi', 'jenis:id_jenis,kategori_penilaian', 'mapel:id_mapel,nama_mapel', 'guru:id_guru,nama_guru', 'pengisi:id,name,id_guru'])
            ->where('id_kelas', $request->id_kelas)->where('id_periode', $request->id_periode)->where('id_siswa', $siswa->id_siswa)
            ->orderBy('tanggal')->orderBy('id_nilai')
            ->get(['id_nilai', 'id_siswa', 'id_mapel', 'id_materi', 'id_jenis', 'id_guru', 'diisi_oleh', 'metode_stnkm', 'tanggal', 'tipe_nilai', 'nilai', 'poin_S', 'poin_T', 'poin_N', 'poin_K', 'poin_M']));

        $jurnal = TransJurnal::with(['guru:id_guru,nama_guru', 'pencatat:id,name,id_guru'])
            ->where('id_kelas', $request->id_kelas)->where('id_siswa', $siswa->id_siswa)
            ->orderBy('tanggal')->orderBy('created_at')->orderBy('id_jurnal') // urutan pasti untuk entri bertanggal sama
            ->get(['id_jurnal', 'id_siswa', 'id_kelas', 'id_guru', 'dicatat_oleh', 'tanggal', 'narasi_kejadian', 'mode_dampak', 'sensitif', 'val_S', 'val_T', 'val_N', 'val_K', 'val_M']);
        TransJurnal::samarkan($jurnal, $request->user());

        return response()->json([
            'kelas' => Classes::find($request->id_kelas, ['id_kelas', 'nama_kelas']),
            'periode' => MasterPeriode::find($request->id_periode),
            'students' => [$siswa],
            'mapels' => Subject::whereIn('id_mapel', $nilai->pluck('id_mapel')->unique())->orderBy('nama_mapel')->get(['id_mapel', 'nama_mapel']),
            'nilai' => $nilai,
            'jurnal' => $jurnal,
        ]);
    }
}

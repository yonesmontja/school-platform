<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Student;
use App\Models\TransPresensi;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class PresensiController extends Controller
{
    public const STATUS = ['HADIR', 'SAKIT', 'IZIN', 'ALPA'];

    /**
     * Siswa kelas (beserta kontak WA ortu/wali) dan seluruh presensi kelas pada periode ini.
     */
    public function index(Request $request)
    {
        $request->validate([
            'id_kelas' => 'required|exists:classes,id_kelas',
            'id_periode' => 'required|exists:master_periode,id_periode',
        ]);

        return response()->json([
            'students' => Student::with(['ortu:id_ortu,nama_ayah,nama_ibu,no_wa', 'wali:id_wali,nama_wali,no_wa'])
                ->where('id_kelas', $request->id_kelas)
                ->orderBy('nama_siswa')
                ->get(['id_siswa', 'nisn', 'nama_siswa', 'no_wa', 'id_ortu', 'id_wali']),
            'presensi' => TransPresensi::where('id_kelas', $request->id_kelas)
                ->where('id_periode', $request->id_periode)
                ->orderByDesc('tanggal')
                ->get(['id_presensi', 'tanggal', 'id_siswa', 'status_kehadiran']),
        ]);
    }

    /**
     * Simpan presensi satu kelas pada satu tanggal. Satu siswa hanya punya satu status per tanggal;
     * menyimpan ulang tanggal yang sama memperbarui statusnya.
     */
    public function saveBatch(Request $request)
    {
        $request->validate([
            'id_kelas' => 'required|exists:classes,id_kelas',
            'id_periode' => 'required|exists:master_periode,id_periode',
            'tanggal' => 'required|date|before_or_equal:today',
            'records' => 'required|array|min:1',
            'records.*.id_siswa' => 'required|distinct|exists:students,id_siswa',
            'records.*.status_kehadiran' => 'required|in:' . implode(',', self::STATUS),
        ], [
            'tanggal.before_or_equal' => 'Presensi tidak bisa dicatat untuk tanggal yang akan datang.',
        ]);

        $idSiswa = collect($request->records)->pluck('id_siswa');
        $anggota = Student::where('id_kelas', $request->id_kelas)->whereIn('id_siswa', $idSiswa)->pluck('id_siswa');
        if ($idSiswa->diff($anggota)->isNotEmpty()) {
            return response()->json(['message' => 'Ada siswa yang bukan anggota kelas ini.'], 422);
        }

        $existing = TransPresensi::whereIn('id_siswa', $idSiswa)->whereDate('tanggal', $request->tanggal)->get()->keyBy('id_siswa');
        $saved = 0; $updated = 0;

        DB::transaction(function () use ($request, $existing, &$saved, &$updated) {
            foreach ($request->records as $rec) {
                $data = [
                    'id_kelas' => $request->id_kelas,
                    'id_periode' => $request->id_periode,
                    'status_kehadiran' => $rec['status_kehadiran'],
                ];
                if ($row = $existing[$rec['id_siswa']] ?? null) {
                    $row->update($data);
                    $updated++;
                } else {
                    TransPresensi::create([
                        'id_presensi' => 'PRS-' . Str::uuid(),
                        'tanggal' => $request->tanggal,
                        'id_siswa' => $rec['id_siswa'],
                        ...$data,
                    ]);
                    $saved++;
                }
            }
        });

        return response()->json([
            'success' => true,
            'message' => "Presensi disimpan. Baru: {$saved}, Diperbarui: {$updated}.",
            'saved' => $saved,
            'updated' => $updated,
        ]);
    }

    /**
     * Hapus seluruh presensi satu kelas pada satu tanggal (mis. salah tanggal saat input).
     */
    public function hapusTanggal(Request $request)
    {
        $request->validate([
            'id_kelas' => 'required|exists:classes,id_kelas',
            'tanggal' => 'required|date',
        ]);
        abort_unless($request->user()->bolehKelolaKelas($request->id_kelas), 403, 'Presensi satu tanggal hanya dapat dihapus oleh wali kelas, kepala sekolah, atau admin.');

        $jumlah = TransPresensi::where('id_kelas', $request->id_kelas)->whereDate('tanggal', $request->tanggal)->delete();

        return response()->json(['success' => true, 'message' => "{$jumlah} data presensi dihapus.", 'deleted' => $jumlah]);
    }
}

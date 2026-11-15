<?php
namespace App\Http\Controllers\Api;
use App\Http\Controllers\Controller;
use App\Models\Classes;
use App\Models\MasterPeriode;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class ClassesController extends Controller {
    public function index(Request $request) {
        $periode = MasterPeriode::where('status_aktif', 'AKTIF')->first(['id_periode', 'tahun_ajaran', 'semester']);
        $nonaktif = Classes::idNonaktif($periode?->id_periode);
        $kelas = Classes::with('waliKelas')->untukPengguna($request->user())->get()
            ->each(fn($k) => $k->setAttribute('aktif_semester', !in_array($k->id_kelas, $nonaktif, true)));
        return response()->json([
            'data' => $kelas,
            'periode_aktif' => $periode ? ['id_periode' => $periode->id_periode, 'nama' => "{$periode->tahun_ajaran} ({$periode->semester})"] : null,
        ]);
    }
    public function store(Request $request) {
        $data = $request->all();
        if(empty($data['id_kelas'])) $data['id_kelas'] = 'KLS-' . time();
        $class = Classes::create($data);
        $this->simpanAktif($request, $class);
        return response()->json(['message' => 'Kelas ditambahkan', 'data' => $class]);
    }
    public function update(Request $request, $id) {
        $class = Classes::findOrFail($id);
        $class->update($request->all());
        $this->simpanAktif($request, $class);
        return response()->json(['message' => 'Kelas diperbarui', 'data' => $class]);
    }
    public function destroy($id) {
        Classes::findOrFail($id)->delete();
        return response()->json(['message' => 'Kelas dihapus']);
    }

    /**
     * Admin menandai rombel aktif/tidak di semester aktif. Nonaktif hanya menyembunyikan rombel dari pilihan &
     * peta kerja guru; data lama (nilai, jadwal, rapor) tidak diubah.
     */
    public function aktifSemester(Request $request, $id) {
        $request->validate(['aktif' => 'required|boolean']);
        $class = Classes::findOrFail($id);
        $periode = $this->simpanAktif($request, $class);
        abort_unless($periode, 422, 'Belum ada semester aktif. Aktifkan semester dulu di menu Semester.');
        return response()->json([
            'message' => $request->boolean('aktif')
                ? "{$class->nama_kelas} aktif di semester {$periode->tahun_ajaran} ({$periode->semester})."
                : "{$class->nama_kelas} dinonaktifkan untuk semester {$periode->tahun_ajaran} ({$periode->semester}). Data lama tetap tersimpan.",
            'aktif_semester' => $request->boolean('aktif'),
        ]);
    }

    private function simpanAktif(Request $request, Classes $class): ?MasterPeriode {
        if (!$request->has('aktif') && !$request->has('aktif_semester')) return null;
        $periode = MasterPeriode::where('status_aktif', 'AKTIF')->first();
        if (!$periode) return null;
        DB::table('kelas_periode')->updateOrInsert(
            ['id_kelas' => $class->id_kelas, 'id_periode' => $periode->id_periode],
            ['aktif' => $request->boolean($request->has('aktif') ? 'aktif' : 'aktif_semester'), 'diubah_oleh' => $request->user()?->id, 'updated_at' => now(), 'created_at' => now()],
        );
        return $periode;
    }
}

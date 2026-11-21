<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Classes;
use App\Models\Student;
use App\Models\TransKenaikanPantau;
use App\Services\KenaikanService;
use App\Services\PantauanKenaikan;
use App\Services\RiwayatRombel;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * Pantauan kenaikan kelas sepanjang tahun: risiko tidak naik dihitung dari nilai yang sudah masuk (aturan yang sama
 * dengan usulan kenaikan), tindak lanjut wali kelas, dan ringkasan yang dibagikan ke orang tua di portal.
 */
class PantauanKenaikanController extends Controller
{
    public function index(Request $request)
    {
        $request->validate(['id_kelas' => 'nullable|exists:classes,id_kelas', 'id_periode' => 'nullable|exists:master_periode,id_periode']);
        $user = $request->user();
        $periode = PantauanKenaikan::periode($request->id_periode);
        abort_unless($periode, 422, 'Belum ada semester aktif.');
        $pengelola = $user->isAdmin() || $user->isKepsek();

        $pilihan = Classes::aktifSemester($periode->id_periode)->orderBy('tingkat')->orderBy('nama_kelas')->get(['id_kelas', 'nama_kelas', 'tingkat'])
            ->filter(fn($k) => $user->bolehKelolaKelas($k->id_kelas))->values();
        abort_if($pilihan->isEmpty(), 403, 'Pantauan kenaikan hanya untuk wali kelas, kepala sekolah, dan admin.');
        $idKelas = $request->id_kelas ?? $pilihan->first()->id_kelas;
        abort_unless($user->bolehKelolaKelas($idKelas), 403, 'Pantauan kenaikan rombel ini hanya untuk wali kelasnya, kepala sekolah, dan admin.');
        $kelas = Classes::find($idKelas);

        return response()->json([
            'periode' => $periode,
            'kelas' => $kelas,
            'pilihan_kelas' => $pilihan,
            'batas_mapel_bawah' => KenaikanService::BATAS_MAPEL_BAWAH,
            'tepi' => PantauanKenaikan::TEPI,
            'hari_tindak' => PantauanKenaikan::HARI_TINDAK,
            'ringkasan' => $pengelola ? PantauanKenaikan::ringkasanSekolah($periode, $pilihan) : null,
            'data' => PantauanKenaikan::kelas($kelas, $periode),
        ]);
    }

    /** Catat tindak lanjut untuk satu siswa (wali kelasnya, kepala sekolah, atau admin). */
    public function tindak(Request $request)
    {
        $data = $request->validate([
            'id_siswa' => 'required|exists:students,id_siswa',
            'jenis' => ['required', Rule::in(TransKenaikanPantau::JENIS)],
            'catatan' => 'required|string|max:2000',
        ]);
        $user = $request->user();
        $periode = PantauanKenaikan::periode();
        abort_unless($periode, 422, 'Belum ada semester aktif.');
        $idKelas = RiwayatRombel::kelasSiswa($data['id_siswa'], $periode->id_periode);
        abort_unless($idKelas && $user->bolehKelolaKelas($idKelas), 403, 'Tindak lanjut pantauan kenaikan diisi wali kelas siswa ini, kepala sekolah, atau admin.');

        $hasil = PantauanKenaikan::hitungSiswa([$data['id_siswa']], $periode)[$data['id_siswa']];
        $x = TransKenaikanPantau::create([
            'id_siswa' => $data['id_siswa'], 'tahun_ajaran' => $periode->tahun_ajaran, 'id_periode' => $periode->id_periode,
            'jenis' => $data['jenis'], 'catatan' => trim($data['catatan']), 'tingkat' => $hasil['tingkat'], 'dibuat_oleh' => $user->id,
        ])->load('pembuat:id,name,id_guru');

        return response()->json([
            'message' => $data['jenis'] === 'KABARI_ORTU' ? 'Tercatat. Ringkasan pantauan dan pesan Anda kini tampil di portal orang tua.' : 'Tindak lanjut tercatat.',
            'data' => PantauanKenaikan::barisTindak($x),
        ]);
    }

    /**
     * Portal: ringkasan pantauan untuk orang tua/siswa, hanya setelah wali kelas memilih "Kabari orang tua" pada tahun
     * ajaran ini. Staf (dashboard pribadi siswa) selalu melihatnya, beserta keterangan apakah sudah dibagikan.
     */
    public function portal(Request $request)
    {
        $request->validate(['id_siswa' => 'required|string|max:50']);
        $u = $request->user();
        $siswa = Student::find($request->id_siswa);
        abort_unless($siswa && $u->bolehDashboardSiswa($siswa), 403, 'Data siswa ini tidak dapat diakses dari akun Anda.');
        $periode = PantauanKenaikan::periode();
        if (!$periode) return response()->json(['data' => null]);

        $kabar = PantauanKenaikan::tindakLanjut([$siswa->id_siswa], $periode->tahun_ajaran)->get($siswa->id_siswa, collect())->firstWhere('jenis', 'KABARI_ORTU');
        $staf = !$u->isPortal();
        if (!$kabar && !$staf) return response()->json(['data' => null]);

        $h = PantauanKenaikan::hitungSiswa([$siswa->id_siswa], $periode)[$siswa->id_siswa];
        return response()->json(['data' => [
            'tahun_ajaran' => $periode->tahun_ajaran,
            'semester' => $periode->semester,
            'batas_mapel_bawah' => KenaikanService::BATAS_MAPEL_BAWAH,
            'tingkat' => $h['tingkat'],
            'mapel_bawah' => $h['mapel_bawah'],
            'persen_hadir' => $h['persen_hadir'],
            // Hanya mapel yang perlu perhatian; nilai setahun tanpa rincian per penilaian
            'mapel' => collect($h['mapel'])->whereIn('status', ['BAWAH', 'TEPI'])->map(fn($m) => collect($m)->only(['nama', 'kkm', 'rata', 'status', 'target', 'sulit']))->values(),
            'dibagikan' => (bool) $kabar,
            'pesan' => $kabar ? PantauanKenaikan::barisTindak($kabar) : null,
        ]]);
    }
}

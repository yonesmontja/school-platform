<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\PesanSiswa;
use App\Models\Student;
use App\Models\Teacher;
use App\Services\AuditTrail;
use App\Services\PesanService;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

/**
 * Pesan wali kelas ↔ orang tua/siswa di dalam aplikasi: arsip per siswa, penanda dibaca, notifikasi Perlu Tindakan.
 */
class PesanController extends Controller
{
    private const PERAN = ['admin' => 'Admin', 'kepsek' => 'Kepala sekolah', 'guru' => 'Wali kelas', 'ortu' => 'Orang tua/wali', 'siswa' => 'Siswa'];

    /** Daftar utas yang terjangkau, terurut dari pesan terbaru. */
    public function utas(Request $request)
    {
        $u = $request->user();
        abort_unless($u->isPortal() || $u->isAdmin() || $u->isKepsek() || ($u->isGuru() && $u->kelasBinaan()), 403,
            'Pesan orang tua untuk wali kelas, kepala sekolah, admin, dan akun portal.');
        $id = PesanService::siswaUtas($u);
        $siswa = Student::with('kelas:id_kelas,nama_kelas')->whereIn('id_siswa', $id)->get(['id_siswa', 'nama_siswa', 'id_kelas', 'foto_path', 'foto_diperbarui']);
        $terakhir = $id->isEmpty() ? collect() : PesanSiswa::whereIn('id', PesanSiswa::whereIn('id_siswa', $id)->groupBy('id_siswa')->selectRaw('max(id)'))->get()->keyBy('id_siswa');
        $belum = PesanService::belumDibaca($u, $id);

        $data = $siswa->map(function ($s) use ($terakhir, $belum, $u) {
            $t = $terakhir[$s->id_siswa] ?? null;
            return [
                'id_siswa' => $s->id_siswa,
                'nama_siswa' => $s->nama_siswa,
                'nama_kelas' => $s->kelas?->nama_kelas,
                'foto_url' => $s->foto_url,
                'terakhir' => $t ? ['isi' => Str::limit($t->isi, 80), 'pada' => $t->created_at->toIso8601String(),
                    'peran' => self::PERAN[$t->peran_pengirim] ?? $t->peran_pengirim, 'saya' => $t->dari_user === $u->id] : null,
                'belum_dibaca' => (int) ($belum[$s->id_siswa] ?? 0),
            ];
        })->sortBy([fn($a, $b) => strcmp($b['terakhir']['pada'] ?? '', $a['terakhir']['pada'] ?? ''), fn($a, $b) => strcmp($a['nama_siswa'], $b['nama_siswa'])])->values();

        return response()->json(['data' => $data, 'belum_dibaca' => (int) $belum->sum()]);
    }

    /** Isi utas satu siswa; sekaligus menandai dibaca bagi akun ini. */
    public function show(Request $request, string $id)
    {
        $u = $request->user();
        $siswa = Student::with('kelas:id_kelas,nama_kelas,wali_kelas')->findOrFail($id);
        abort_unless(PesanService::boleh($u, $siswa), 403, 'Utas pesan ini di luar jangkauan akun Anda.');

        $pesan = PesanSiswa::with('pengirim:id,name')->where('id_siswa', $id)->orderByDesc('id')->limit(200)->get()->reverse()->values();
        PesanService::tandaiDibaca($u, $id, (int) $pesan->max('id'));

        return response()->json([
            'siswa' => ['id_siswa' => $siswa->id_siswa, 'nama_siswa' => $siswa->nama_siswa, 'nama_kelas' => $siswa->kelas?->nama_kelas, 'foto_url' => $siswa->foto_url],
            'wali_kelas' => $siswa->kelas?->wali_kelas ? Teacher::where('id_guru', $siswa->kelas->wali_kelas)->value('nama_guru') : null,
            'data' => $pesan->map(fn($p) => [
                'id' => $p->id,
                'isi' => $p->isi,
                'pengirim' => $p->pengirim?->name ?? 'Akun terhapus',
                'peran' => self::PERAN[$p->peran_pengirim] ?? $p->peran_pengirim,
                'saya' => $p->dari_user === $u->id,
                'pada' => $p->created_at->toIso8601String(),
            ]),
        ]);
    }

    public function kirim(Request $request, string $id)
    {
        $request->validate(['isi' => 'required|string|max:2000']);
        $u = $request->user();
        $siswa = Student::findOrFail($id);
        abort_unless(PesanService::boleh($u, $siswa), 403, 'Utas pesan ini di luar jangkauan akun Anda.');
        $isi = trim($request->isi);
        abort_if($isi === '', 422, 'Tulis pesannya.');

        $pesan = PesanSiswa::create(['id_siswa' => $id, 'dari_user' => $u->id, 'peran_pengirim' => $u->role, 'isi' => $isi]);
        PesanService::tandaiDibaca($u, $id, $pesan->id);
        // Isi pesan tidak masuk log (komunikasi pribadi); yang dicatat hanya peristiwa pengiriman
        AuditTrail::catat([
            'aksi' => 'KIRIM_PESAN', 'kategori' => 'DATA', 'modul' => 'Pesan',
            'deskripsi' => "Mengirim pesan di utas {$siswa->nama_siswa}",
            'meta' => ['id_siswa' => $id, 'id_pesan' => $pesan->id],
        ]);
        return response()->json(['success' => true, 'data' => ['id' => $pesan->id, 'isi' => $pesan->isi, 'pengirim' => $u->name,
            'peran' => self::PERAN[$u->role] ?? $u->role, 'saya' => true, 'pada' => $pesan->created_at->toIso8601String()]]);
    }
}

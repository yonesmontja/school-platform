<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Classes;
use App\Models\Student;
use App\Models\TransKenaikan;
use App\Services\KenaikanService;
use App\Services\RiwayatRombel;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

/**
 * Kenaikan kelas: wali kelas mengisi keputusan (berdasarkan usulan dari data setahun), kepala sekolah mengesahkan.
 * Pemetaan rombel: admin/kepala sekolah menempatkan siswa yang sudah naik ke rombel tingkatnya.
 */
class KenaikanController extends Controller
{
    public function index(Request $request)
    {
        $request->validate(['id_kelas' => 'nullable|exists:classes,id_kelas', 'id_periode' => 'nullable|exists:master_periode,id_periode']);
        $user = $request->user();
        $periode = KenaikanService::periodeKenaikan($request->id_periode);
        abort_unless($periode && $periode->semester === 'Genap', 422, 'Kenaikan kelas diisi pada semester Genap. Belum ada semester Genap.');

        $pilihan = Classes::aktifSemester($periode->id_periode)->orderBy('tingkat')->orderBy('nama_kelas')->get(['id_kelas', 'nama_kelas', 'tingkat'])
            ->filter(fn($k) => $user->bolehKelolaKelas($k->id_kelas))->values();
        $idKelas = $request->id_kelas ?? $pilihan->first()?->id_kelas;
        abort_unless(!$idKelas || $user->bolehKelolaKelas($idKelas), 403, 'Kenaikan kelas hanya dapat diisi wali kelas rombel ini, kepala sekolah, atau admin.');
        $kelas = $idKelas ? Classes::find($idKelas) : null;

        return response()->json([
            'periode' => $periode,
            'kelas' => $kelas,
            'pilihan_kelas' => $pilihan,
            'tingkat_akhir' => KenaikanService::tingkatAkhir(),
            'batas_mapel_bawah' => KenaikanService::BATAS_MAPEL_BAWAH,
            'boleh_sahkan' => $user->isAdmin() || $user->isKepsek(),
            'data' => $kelas ? KenaikanService::daftar($kelas, $periode)->values() : [],
        ]);
    }

    public function simpan(Request $request)
    {
        $data = $request->validate([
            'id_kelas' => 'required|exists:classes,id_kelas',
            'id_periode' => 'required|exists:master_periode,id_periode',
            'baris' => 'required|array|min:1',
            'baris.*.id_siswa' => 'required|distinct|exists:students,id_siswa',
            'baris.*.keputusan' => ['required', Rule::in(TransKenaikan::KEPUTUSAN)],
            'baris.*.alasan' => 'nullable|string|max:1000',
        ]);
        $user = $request->user();
        abort_unless($user->bolehKelolaKelas($data['id_kelas']), 403, 'Kenaikan kelas hanya dapat diisi wali kelas rombel ini, kepala sekolah, atau admin.');
        $kelas = Classes::find($data['id_kelas']);
        $anggota = RiwayatRombel::anggota($kelas->id_kelas, $data['id_periode'])->pluck('id_siswa')->flip();
        $bukan = collect($data['baris'])->pluck('id_siswa')->reject(fn($s) => $anggota->has($s));
        abort_if($bukan->isNotEmpty(), 422, 'Ada siswa yang bukan anggota rombel ini.');
        $sah = TransKenaikan::where('id_periode', $data['id_periode'])->whereIn('id_siswa', collect($data['baris'])->pluck('id_siswa'))->where('disahkan', true)->exists();
        abort_if($sah, 423, 'Keputusan rombel ini sudah disahkan. Minta kepala sekolah membatalkan pengesahan bila perlu diubah.');

        $tingkat = (int) ($kelas->tingkat ?: RiwayatRombel::tingkatDariNama($kelas->nama_kelas) ?: 0);
        DB::transaction(function () use ($data, $kelas, $tingkat, $user) {
            foreach ($data['baris'] as $b) {
                TransKenaikan::updateOrCreate(['id_siswa' => $b['id_siswa'], 'id_periode' => $data['id_periode']], [
                    'id_kelas' => $kelas->id_kelas, 'keputusan' => $b['keputusan'], 'ke_tingkat' => KenaikanService::keTingkat($b['keputusan'], $tingkat),
                    'alasan' => $b['alasan'] ?? null, 'diisi_oleh' => $user->id,
                ]);
            }
        });
        return response()->json(['message' => 'Keputusan kenaikan disimpan.', 'data' => KenaikanService::daftar($kelas, \App\Models\MasterPeriode::find($data['id_periode']))->values()]);
    }

    /** Kepala sekolah/admin mengesahkan (atau membatalkan pengesahan) keputusan satu rombel. */
    public function sahkan(Request $request)
    {
        $data = $request->validate([
            'id_kelas' => 'required|exists:classes,id_kelas',
            'id_periode' => 'required|exists:master_periode,id_periode',
            'sahkan' => 'required|boolean',
        ]);
        $user = $request->user();
        abort_unless($user->isAdmin() || $user->isKepsek(), 403, 'Pengesahan kenaikan kelas dilakukan kepala sekolah.');
        $ids = RiwayatRombel::anggota($data['id_kelas'], $data['id_periode'])->pluck('id_siswa');
        $q = TransKenaikan::where('id_periode', $data['id_periode'])->whereIn('id_siswa', $ids);

        if ($request->boolean('sahkan')) {
            abort_if((clone $q)->count() < $ids->count(), 422, 'Masih ada siswa yang belum diberi keputusan.');
            $q->get()->each(fn($k) => $k->forceFill(['disahkan' => true, 'disahkan_oleh' => $user->id, 'disahkan_pada' => now()])->save());
            $pesan = 'Keputusan kenaikan disahkan.';
        } else {
            abort_if((clone $q)->whereNotNull('diterapkan_pada')->exists(), 423, 'Keputusan sudah diterapkan ke tahun ajaran baru dan tidak bisa dibatalkan.');
            $q->get()->each(fn($k) => $k->forceFill(['disahkan' => false, 'disahkan_oleh' => null, 'disahkan_pada' => null])->save());
            $pesan = 'Pengesahan dibatalkan. Wali kelas bisa mengubah keputusan lagi.';
        }
        $periode = \App\Models\MasterPeriode::find($data['id_periode']);
        return response()->json(['message' => $pesan, 'data' => KenaikanService::daftar(Classes::find($data['id_kelas']), $periode)->values()]);
    }

    /** Siswa per tingkat: yang menunggu pemetaan dan anggota tiap rombel tingkat itu. */
    public function pemetaan(Request $request)
    {
        $request->validate(['tingkat' => 'nullable|integer|min:1|max:12']);
        $rombel = Classes::aktifSemester()->whereNotNull('tingkat')->orderBy('tingkat')->orderBy('nama_kelas')->get(['id_kelas', 'nama_kelas', 'tingkat', 'wali_kelas']);
        $menunggu = Student::where('status_siswa', 'aktif')->whereNull('id_kelas')->orderBy('nama_siswa')
            ->get(['id_siswa', 'nisn', 'nama_siswa', 'jenis_kelamin', 'tingkat_tunggu']);
        $tingkatAda = $rombel->pluck('tingkat')->merge($menunggu->pluck('tingkat_tunggu')->filter())->unique()->sort()->values();
        $tingkat = (int) ($request->tingkat ?: ($menunggu->firstWhere('tingkat_tunggu')?->tingkat_tunggu ?? $tingkatAda->first() ?? 1));
        $rombelTingkat = $rombel->where('tingkat', $tingkat)->values();
        $anggota = Student::whereIn('id_kelas', $rombelTingkat->pluck('id_kelas'))->where('status_siswa', 'aktif')->orderBy('nama_siswa')
            ->get(['id_siswa', 'nisn', 'nama_siswa', 'jenis_kelamin', 'id_kelas']);

        return response()->json([
            'tingkat' => $tingkat,
            'daftar_tingkat' => $tingkatAda->map(fn($t) => ['tingkat' => $t, 'menunggu' => $menunggu->where('tingkat_tunggu', $t)->count()]),
            'rombel' => $rombelTingkat->map(fn($k) => $k->toArray() + ['anggota' => $anggota->where('id_kelas', $k->id_kelas)->values()]),
            'menunggu' => $menunggu->where('tingkat_tunggu', $tingkat)->values(),
            // Siswa aktif tanpa rombel dan tanpa tingkat (mis. siswa baru): bisa ditempatkan di tingkat mana pun
            'tanpa_tingkat' => $menunggu->whereNull('tingkat_tunggu')->values(),
            'jumlah_menunggu' => $menunggu->whereNotNull('tingkat_tunggu')->count(),
        ]);
    }

    public function simpanPemetaan(Request $request)
    {
        $data = $request->validate([
            'baris' => 'required|array|min:1|max:1000',
            'baris.*.id_siswa' => 'required|distinct|exists:students,id_siswa',
            'baris.*.id_kelas' => 'required|exists:classes,id_kelas',
        ]);
        $n = 0;
        DB::transaction(function () use ($data, &$n) {
            foreach ($data['baris'] as $b) {
                $s = Student::find($b['id_siswa']);
                abort_if($s->status_siswa !== 'aktif', 422, "{$s->nama_siswa} tidak berstatus aktif.");
                if ($s->id_kelas === $b['id_kelas']) continue;
                $s->forceFill(['id_kelas' => $b['id_kelas'], 'tingkat_tunggu' => null])->save();
                $n++;
            }
        });
        return response()->json(['message' => "{$n} siswa ditempatkan ke rombel.", 'diubah' => $n]);
    }
}

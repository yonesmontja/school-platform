<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\MasterPeriode;
use App\Models\Subject;
use App\Models\TransJadwal;
use App\Services\JadwalPaketService;
use App\Services\ProgramAjarService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

/**
 * Paket jadwal dari Promes: referensi (pola jam yang sudah dipakai, ATP acuan), pratinjau, lalu aktifkan.
 * Guru hanya untuk mapel yang diampunya dan atas namanya sendiri; admin & kepala sekolah untuk semua mapel.
 */
class JadwalPaketController extends Controller
{
    public function __construct(private JadwalPaketService $paket, private ProgramAjarService $program) {}

    public function referensi(Request $request)
    {
        $data = $request->validate([
            'id_mapel' => 'required|exists:subjects,id_mapel',
            'id_kelas' => 'nullable|exists:classes,id_kelas',
            'id_periode' => 'required|exists:master_periode,id_periode',
        ]);
        $this->cekAkses($request, $data['id_mapel']);
        $periode = MasterPeriode::findOrFail($data['id_periode']);
        $atp = $this->program->pilihAtp($data['id_mapel'], $data['id_kelas'] ?? null, $periode->id_periode);
        [$awal, $akhir] = $periode->rentang();
        $saran = $this->paket->saranSlot($data['id_mapel'], $data['id_kelas'] ?? null);

        return response()->json([
            'atp' => $atp ? $atp->only(['id_atp', 'judul', 'status', 'jp_per_minggu', 'minggu_efektif']) + ['jumlah_tp' => $atp->baris->count(), 'total_jp' => (int) $atp->baris->sum('alokasi_jp')] : null,
            'periode' => ['mulai' => $awal->format('Y-m-d'), 'selesai' => $akhir->format('Y-m-d')],
            'saran' => $saran + ['id_guru_mapel' => Subject::whereKey($data['id_mapel'])->value('id_guru')],
        ]);
    }

    public function pratinjau(Request $request)
    {
        [$periode, $data, $info] = $this->masukan($request);
        $hasil = $this->paket->susun($periode, $data['id_mapel'], $data['id_kelas'] ?? null, $data['slot'], $info);
        return response()->json($hasil);
    }

    /** Buat sesi terpilih sebagai satu rangkaian (id_group PKT-…), sehingga bisa diubah/dihapus sekaligus. */
    public function aktifkan(Request $request)
    {
        [$periode, $data, $info] = $this->masukan($request);
        $request->validate(['pilih' => 'required|array|min:1|max:' . JadwalPaketService::MAKS_SESI, 'pilih.*' => 'string|max:20']);
        $hasil = $this->paket->susun($periode, $data['id_mapel'], $data['id_kelas'] ?? null, $data['slot'], $info);
        $pilih = array_flip($request->input('pilih'));
        $dibuat = array_values(array_filter($hasil['sesi'], fn($s) => isset($pilih[$s['kunci']]) && $s['status'] !== 'SUDAH_ADA'));
        if (!$dibuat) throw ValidationException::withMessages(['pilih' => 'Tidak ada sesi baru yang bisa dibuat. Muat ulang pratinjau.']);

        $idGroup = 'PKT-' . Str::uuid();
        $atp = $hasil['atp'];
        DB::transaction(function () use ($dibuat, $idGroup, $data, $info, $periode, $atp) {
            foreach ($dibuat as $s) {
                $mulai = \Carbon\Carbon::parse("{$s['tanggal']} {$s['mulai']}");
                $selesai = \Carbon\Carbon::parse("{$s['tanggal']} {$s['selesai']}");
                $tp = $s['tp'];
                $perangkat = $tp ? array_values(array_filter([
                    ['jenis' => 'ATP', 'id' => (string) $tp['id'], 'label' => Str::limit((string) $tp['tp'], 280), 'atp' => $atp['id_atp'] ?? null],
                    $tp['id_indikator'] ? ['jenis' => 'INDIKATOR', 'id' => (string) $tp['id_indikator'], 'label' => Str::limit((string) $tp['tp'], 280)] : null,
                ])) : null;
                TransJadwal::create([
                    'id_jadwal' => 'JDW-' . Str::uuid(),
                    'id_group' => $idGroup,
                    'id_periode' => $periode->id_periode,
                    'id_mapel' => $data['id_mapel'],
                    'id_kelas' => $data['id_kelas'] ?? null,
                    'id_guru' => $info['id_guru'],
                    'id_ruangan' => $info['id_ruangan'],
                    'id_materi' => $tp['id_materi'] ?? null,
                    'warna' => $data['warna'] ?? '#3f51b5',
                    'catatan' => $tp ? "Paket Promes · minggu efektif ke-{$s['minggu_ke']} · TP {$tp['no']}" : "Paket Promes · minggu efektif ke-{$s['minggu_ke']}",
                    'perangkat' => $perangkat ? array_map(fn($p) => array_filter($p, fn($v) => $v !== null), $perangkat) : null,
                    'mulai' => $mulai,
                    'selesai' => $selesai,
                    'status_sesi' => TransJadwal::statusMenurutWaktu($mulai, $selesai),
                ]);
            }
        });

        return response()->json([
            'success' => true,
            'jumlah' => count($dibuat),
            'id_group' => $idGroup,
            'message' => count($dibuat) . ' sesi dari paket Promes diaktifkan.',
        ], 201);
    }

    // ================= BANTUAN =================

    private function masukan(Request $request): array
    {
        $data = $request->validate([
            'id_mapel' => 'required|exists:subjects,id_mapel',
            'id_kelas' => 'nullable|exists:classes,id_kelas',
            'id_periode' => 'required|exists:master_periode,id_periode',
            'id_guru' => 'nullable|exists:teachers,id_guru',
            'id_ruangan' => 'nullable|exists:master_ruangan,id_ruangan',
            'mulai_dari' => 'nullable|date_format:Y-m-d',
            'warna' => ['nullable', 'regex:/^#[0-9a-fA-F]{6}$/'],
            'slot' => 'required|array|min:1|max:' . JadwalPaketService::MAKS_SLOT,
            'slot.*.hari' => 'required|integer|between:1,6',
            'slot.*.mulai' => 'required|date_format:H:i',
            'slot.*.selesai' => 'required|date_format:H:i',
        ], [
            'slot.required' => 'Isi minimal satu jam pelajaran mingguan.',
            'slot.*.hari.between' => 'Hari Minggu adalah libur; pilih Senin–Sabtu.',
        ]);
        foreach ($data['slot'] as $i => $s) {
            if ($s['selesai'] <= $s['mulai']) throw ValidationException::withMessages(["slot.$i.selesai" => 'Jam selesai harus setelah jam mulai.']);
        }
        $this->cekAkses($request, $data['id_mapel']);
        $periode = MasterPeriode::findOrFail($data['id_periode']);
        if (!$this->program->pilihAtp($data['id_mapel'], $data['id_kelas'] ?? null, $periode->id_periode)) {
            throw ValidationException::withMessages(['id_mapel' => 'Belum ada ATP untuk mapel, kelas, dan semester ini. Susun ATP di Perangkat Ajar terlebih dahulu.']);
        }
        $user = $request->user();
        $info = [
            'id_guru' => $user->isGuru() ? $user->id_guru : ($data['id_guru'] ?? Subject::whereKey($data['id_mapel'])->value('id_guru')),
            'id_ruangan' => $data['id_ruangan'] ?? null,
            'mulai_dari' => $data['mulai_dari'] ?? null,
        ];
        return [$periode, $data, $info];
    }

    private function cekAkses(Request $request, string $idMapel): void
    {
        $user = $request->user();
        abort_if($user->isGuru() && !$user->id_guru, 403, 'Akun guru Anda belum terhubung dengan data guru. Hubungi admin.');
        abort_unless($user->isAdmin() || $user->isKepsek() || ($user->isGuru() && in_array($idMapel, $user->mapelDiampu(), true)), 403,
            'Paket jadwal hanya untuk guru pengampu mapel ini, admin, atau kepala sekolah.');
    }
}

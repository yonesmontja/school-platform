<?php

namespace App\Http\Controllers\Api;

use App\Rules\BukanHariMinggu;
use App\Http\Controllers\Controller;
use App\Models\Student;
use App\Models\Subject;
use App\Models\TransJadwal;
use App\Models\TransPresensi;
use App\Models\TransPresensiMapel;
use App\Services\PresensiJurnalService;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class PresensiController extends Controller
{
    public const STATUS = ['HADIR', 'SAKIT', 'IZIN', 'ALPA'];

    public function __construct(private PresensiJurnalService $jurnal) {}

    /** Aturan tanggal presensi: tidak di masa depan, bukan Minggu/hari libur, dan bukan Sabtu (sekolah 5 hari). */
    private function aturanTanggal(): array
    {
        return ['required', 'date', 'before_or_equal:' . now(config('app.zona_sekolah'))->toDateString(), new BukanHariMinggu,
            function ($attr, $value, $fail) {
                try { $t = Carbon::parse($value); } catch (\Throwable) { return; }
                if ($t->isSaturday()) $fail('Tanggal ' . $t->locale('id')->translatedFormat('j F Y') . ' adalah hari Sabtu; presensi hanya untuk hari Senin–Jumat.');
            }];
    }

    private const PESAN = ['tanggal.before_or_equal' => 'Presensi tidak bisa dicatat untuk tanggal yang akan datang.'];

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
            'presensi' => TransPresensi::with('pencatat:id,name,id_guru')->where('id_kelas', $request->id_kelas)
                ->where('id_periode', $request->id_periode)
                ->orderByDesc('tanggal')
                ->get(['id_presensi', 'tanggal', 'id_siswa', 'status_kehadiran', 'keterangan', 'sumber', 'dicatat_oleh']),
            // Wali kelas = guru yang tercatat untuk presensi harian; penginput lain ditampilkan "diisi …"
            'wali_kelas' => \App\Models\Classes::with('waliKelas:id_guru,nama_guru')->find($request->id_kelas)?->waliKelas,
        ]);
    }

    /** Siswa yang ada di kelas ini; mengembalikan respons 422 bila ada yang bukan anggota. */
    private function cekAnggota(Request $request)
    {
        $idSiswa = collect($request->records)->pluck('id_siswa');
        $anggota = Student::where('id_kelas', $request->id_kelas)->whereIn('id_siswa', $idSiswa)->pluck('id_siswa');
        return $idSiswa->diff($anggota)->isNotEmpty() ? response()->json(['message' => 'Ada siswa yang bukan anggota kelas ini.'], 422) : null;
    }

    /**
     * Simpan presensi harian satu kelas pada satu tanggal. Satu siswa hanya punya satu status per tanggal;
     * menyimpan ulang tanggal yang sama memperbarui statusnya. Keterangan (mis. "sakit demam") tercatat ke jurnal.
     */
    public function saveBatch(Request $request)
    {
        $request->validate([
            'id_kelas' => 'required|exists:classes,id_kelas',
            'id_periode' => 'required|exists:master_periode,id_periode',
            // "Hari ini" menurut zona waktu sekolah; zona aplikasi UTC menolak presensi pagi hari (00.00–09.00 WIT)
            'tanggal' => $this->aturanTanggal(),
            'records' => 'required|array|min:1',
            'records.*.id_siswa' => 'required|distinct|exists:students,id_siswa',
            'records.*.status_kehadiran' => 'required|in:' . implode(',', self::STATUS),
            'records.*.keterangan' => 'nullable|string|max:300',
        ], self::PESAN);
        if ($tolak = $this->cekAnggota($request)) return $tolak;

        $user = $request->user();
        $existing = TransPresensi::whereIn('id_siswa', collect($request->records)->pluck('id_siswa'))->whereDate('tanggal', $request->tanggal)->get()->keyBy('id_siswa');
        $saved = 0; $updated = 0;

        DB::transaction(function () use ($request, $existing, $user, &$saved, &$updated) {
            foreach ($request->records as $rec) {
                $row = $existing[$rec['id_siswa']] ?? null;
                // Keterangan tidak dikirim (klien lama) = keterangan tersimpan dipertahankan
                $keterangan = array_key_exists('keterangan', $rec) ? (trim((string) $rec['keterangan']) ?: null) : $row?->keterangan;
                $idJurnal = $this->jurnal->sinkron($row?->id_jurnal, [
                    'tanggal' => $request->tanggal, 'id_siswa' => $rec['id_siswa'], 'id_kelas' => $request->id_kelas,
                    'status' => $rec['status_kehadiran'], 'keterangan' => $keterangan, 'sumber' => 'Presensi harian',
                    'id_guru' => $user->isGuru() ? $user->id_guru : null,
                ]);
                $data = [
                    'id_kelas' => $request->id_kelas,
                    'id_periode' => $request->id_periode,
                    'status_kehadiran' => $rec['status_kehadiran'],
                    'keterangan' => $keterangan,
                    'id_jurnal' => $idJurnal,
                    'sumber' => 'HARIAN',
                    'dicatat_oleh' => $user->id,
                ];
                if ($row) {
                    $row->update($data);
                    $updated++;
                } else {
                    TransPresensi::create(['id_presensi' => 'PRS-' . Str::uuid(), 'tanggal' => $request->tanggal, 'id_siswa' => $rec['id_siswa'], ...$data]);
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
     * Lembar presensi per mapel: siswa kelas, presensi mapel tersimpan pada tanggal itu, presensi harian sebagai bawaan,
     * dan sesi jadwal mapel–kelas pada tanggal tersebut.
     */
    public function mapel(Request $request)
    {
        $request->validate([
            'id_kelas' => 'required|exists:classes,id_kelas',
            'id_mapel' => 'required|exists:subjects,id_mapel',
            'tanggal' => 'required|date',
        ]);
        $this->cekMapel($request);

        return response()->json([
            'presensi_mapel' => TransPresensiMapel::where('id_kelas', $request->id_kelas)->where('id_mapel', $request->id_mapel)
                ->whereDate('tanggal', $request->tanggal)->get(['id_siswa', 'status_kehadiran', 'keterangan', 'id_jadwal', 'updated_at']),
            'harian' => TransPresensi::where('id_kelas', $request->id_kelas)->whereDate('tanggal', $request->tanggal)
                ->get(['id_siswa', 'status_kehadiran', 'keterangan', 'sumber']),
            'sesi' => TransJadwal::where('id_kelas', $request->id_kelas)->where('id_mapel', $request->id_mapel)
                ->whereDate('mulai', $request->tanggal)->where('status_sesi', '!=', 'Batal')->orderBy('mulai')
                ->get(['id_jadwal', 'mulai', 'selesai', 'id_guru'])
                ->map(fn($s) => ['id_jadwal' => $s->id_jadwal, 'jam' => $s->mulai->format('H:i') . '–' . $s->selesai->format('H:i')]),
        ]);
    }

    /**
     * Simpan presensi per mapel oleh guru mapel. Siswa yang belum punya presensi harian pada tanggal itu
     * sekaligus dicatat di presensi harian (pengisi pertama); presensi harian yang sudah ada tidak diubah.
     */
    public function simpanMapel(Request $request)
    {
        $request->validate([
            'id_kelas' => 'required|exists:classes,id_kelas',
            'id_periode' => 'required|exists:master_periode,id_periode',
            'id_mapel' => 'required|exists:subjects,id_mapel',
            'id_jadwal' => 'nullable|exists:trans_jadwal,id_jadwal',
            'tanggal' => $this->aturanTanggal(),
            'records' => 'required|array|min:1',
            'records.*.id_siswa' => 'required|distinct|exists:students,id_siswa',
            'records.*.status_kehadiran' => 'required|in:' . implode(',', self::STATUS),
            'records.*.keterangan' => 'nullable|string|max:300',
        ], self::PESAN);
        $this->cekMapel($request);
        if ($tolak = $this->cekAnggota($request)) return $tolak;

        $user = $request->user();
        $namaMapel = Subject::whereKey($request->id_mapel)->value('nama_mapel');
        $idGuru = $user->isGuru() ? $user->id_guru : Subject::whereKey($request->id_mapel)->value('id_guru');
        $idSiswa = collect($request->records)->pluck('id_siswa');
        $mapelAda = TransPresensiMapel::where('id_mapel', $request->id_mapel)->whereIn('id_siswa', $idSiswa)->whereDate('tanggal', $request->tanggal)->get()->keyBy('id_siswa');
        $harianAda = TransPresensi::whereIn('id_siswa', $idSiswa)->whereDate('tanggal', $request->tanggal)->get()->keyBy('id_siswa');
        $harianBaru = 0;

        DB::transaction(function () use ($request, $user, $namaMapel, $idGuru, $mapelAda, $harianAda, &$harianBaru) {
            foreach ($request->records as $rec) {
                $row = $mapelAda[$rec['id_siswa']] ?? null;
                $keterangan = trim((string) ($rec['keterangan'] ?? '')) ?: null;
                $idJurnal = $this->jurnal->sinkron($row?->id_jurnal, [
                    'tanggal' => $request->tanggal, 'id_siswa' => $rec['id_siswa'], 'id_kelas' => $request->id_kelas,
                    'status' => $rec['status_kehadiran'], 'keterangan' => $keterangan, 'sumber' => "Presensi {$namaMapel}", 'id_guru' => $idGuru,
                ]);
                $data = [
                    'id_kelas' => $request->id_kelas, 'id_periode' => $request->id_periode, 'id_jadwal' => $request->id_jadwal,
                    'status_kehadiran' => $rec['status_kehadiran'], 'keterangan' => $keterangan, 'id_jurnal' => $idJurnal,
                    'id_guru' => $idGuru, 'dicatat_oleh' => $user->id,
                ];
                if ($row) $row->update($data);
                else TransPresensiMapel::create(['id_presensi_mapel' => 'PRM-' . Str::uuid(), 'tanggal' => $request->tanggal,
                    'id_mapel' => $request->id_mapel, 'id_siswa' => $rec['id_siswa'], ...$data]);

                // Presensi harian (acuan rapor) diisi bila belum ada
                if (!isset($harianAda[$rec['id_siswa']])) {
                    TransPresensi::create([
                        'id_presensi' => 'PRS-' . Str::uuid(), 'tanggal' => $request->tanggal, 'id_siswa' => $rec['id_siswa'],
                        'id_kelas' => $request->id_kelas, 'id_periode' => $request->id_periode, 'status_kehadiran' => $rec['status_kehadiran'],
                        // Jurnal keterangan yang sama dipakai bersama, agar tidak tercatat dua kali
                        'keterangan' => $keterangan, 'id_jurnal' => $idJurnal, 'sumber' => 'MAPEL', 'dicatat_oleh' => $user->id,
                    ]);
                    $harianBaru++;
                }
            }
        });

        return response()->json([
            'success' => true,
            'message' => "Presensi {$namaMapel} disimpan." . ($harianBaru ? " {$harianBaru} siswa sekaligus tercatat di presensi harian." : ' Presensi harian yang sudah ada tidak diubah.'),
            'harian_baru' => $harianBaru,
        ]);
    }

    /** Guru hanya untuk mapel yang diampunya; admin & kepala sekolah untuk semua mapel. */
    private function cekMapel(Request $request): void
    {
        $user = $request->user();
        abort_unless($user->isAdmin() || $user->isKepsek() || $user->isPeninjau() || ($user->isGuru() && in_array($request->id_mapel, $user->mapelDiampu(), true)), 403,
            'Presensi per mapel hanya untuk guru pengampu mapel ini, admin, atau kepala sekolah.');
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

        $baris = TransPresensi::where('id_kelas', $request->id_kelas)->whereDate('tanggal', $request->tanggal)->get();
        foreach ($baris as $b) $this->jurnal->sinkron($b->id_jurnal, ['keterangan' => null]);
        $jumlah = TransPresensi::whereIn('id_presensi', $baris->pluck('id_presensi'))->delete();

        return response()->json(['success' => true, 'message' => "{$jumlah} data presensi dihapus.", 'deleted' => $jumlah]);
    }
}

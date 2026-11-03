<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\LogAktivitas;
use App\Models\User;
use App\Services\AuditTrail;
use Carbon\Carbon;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * Audit trail (Log Aktivitas). Admin & kepsek melihat seluruh aktivitas; guru hanya aktivitasnya sendiri.
 * Log tidak bisa diubah atau dihapus lewat API.
 */
class LogAktivitasController extends Controller
{
    public const KATEGORI = ['AUTH', 'DATA', 'OUTPUT', 'NAVIGASI', 'SISTEM'];
    // Event yang boleh dikirim frontend (tindakan yang terjadi di browser: cetak, unduh, buka chat WA, buka halaman)
    private const AKSI_EVENT = ['CETAK', 'EKSPOR', 'UNDUH', 'KIRIM_WA', 'SALIN', 'BUKA_HALAMAN'];

    private function query(Request $request): Builder
    {
        $request->validate([
            'dari' => 'nullable|date', 'sampai' => 'nullable|date',
            'user_id' => 'nullable|integer', 'kategori' => 'nullable|string', 'aksi' => 'nullable|string',
            'modul' => 'nullable|string|max:60', 'q' => 'nullable|string|max:100', 'status' => 'nullable|in:berhasil,gagal',
        ]);
        $user = $request->user();

        return LogAktivitas::query()
            ->when(!$user->isPengelola(), fn($q) => $q->where('user_id', $user->id))
            ->when($request->dari, fn($q, $v) => $q->where('waktu', '>=', Carbon::parse($v)->startOfDay()))
            ->when($request->sampai, fn($q, $v) => $q->where('waktu', '<=', Carbon::parse($v)->endOfDay()))
            ->when($request->user_id, fn($q, $v) => $q->where('user_id', $v))
            ->when($request->kategori, fn($q, $v) => $q->whereIn('kategori', explode(',', $v)))
            ->when($request->aksi, fn($q, $v) => $q->whereIn('aksi', explode(',', $v)))
            ->when($request->modul, fn($q, $v) => $q->where('modul', $v))
            ->when($request->status, fn($q, $v) => $q->where('berhasil', $v === 'berhasil'))
            ->when($request->q, function ($q, $v) {
                $kata = '%' . mb_strtolower($v) . '%';
                $q->where(fn($w) => $w->whereRaw('LOWER(deskripsi) LIKE ?', [$kata])
                    ->orWhereRaw('LOWER(nama_user) LIKE ?', [$kata])
                    ->orWhereRaw('LOWER(rute) LIKE ?', [$kata])
                    ->orWhere('ip', 'like', $kata)
                    ->orWhereHas('perubahan', fn($p) => $p->whereRaw('LOWER(label) LIKE ?', [$kata])->orWhere('id_subjek', 'like', $kata)));
            });
    }

    public function index(Request $request)
    {
        $request->validate(['per_page' => 'nullable|integer|between:10,5000']);
        $data = $this->query($request)->orderByDesc('waktu')->orderByDesc('id')
            ->paginate($request->integer('per_page', 25), ['id', 'waktu', 'user_id', 'nama_user', 'peran', 'kategori', 'aksi', 'modul',
                'deskripsi', 'berhasil', 'metode', 'rute', 'status_http', 'durasi_ms', 'ip', 'user_agent', 'jumlah_perubahan', 'meta']);
        return response()->json($data);
    }

    public function show(Request $request, int $id)
    {
        $log = LogAktivitas::with('perubahan')->findOrFail($id);
        abort_unless($request->user()->isPengelola() || $log->user_id === $request->user()->id, 403, 'Anda hanya dapat melihat aktivitas Anda sendiri.');
        return response()->json(['data' => $log]);
    }

    /** Statistik untuk kartu & grafik: jumlah per kategori, per hari, pengguna & modul teraktif, login gagal. */
    public function ringkasan(Request $request)
    {
        $dasar = fn() => $this->query($request);
        $perKategori = $dasar()->select('kategori', DB::raw('count(*) as jumlah'))->groupBy('kategori')->pluck('jumlah', 'kategori');
        $perHari = $dasar()->select(DB::raw('DATE(waktu) as tanggal'), 'kategori', DB::raw('count(*) as jumlah'))
            ->groupBy('tanggal', 'kategori')->orderBy('tanggal')->get();
        $perJam = $dasar()->select(DB::raw('EXTRACT(HOUR FROM waktu)::int as jam'), DB::raw('count(*) as jumlah'))
            ->groupBy('jam')->pluck('jumlah', 'jam');

        return response()->json([
            'total' => $perKategori->sum(),
            'per_kategori' => $perKategori,
            'per_hari' => $perHari,
            'per_jam' => $perJam,
            'pengguna_aktif' => $dasar()->whereNotNull('user_id')->distinct('user_id')->count('user_id'),
            'gagal' => $dasar()->where('berhasil', false)->count(),
            'login_gagal' => $dasar()->where('aksi', 'LOGIN_GAGAL')->count(),
            'perubahan_data' => (int) $dasar()->sum('jumlah_perubahan'),
            'pengguna_teratas' => $dasar()->whereNotNull('user_id')
                ->select('user_id', 'nama_user', 'peran', DB::raw('count(*) as jumlah'))
                ->groupBy('user_id', 'nama_user', 'peran')->orderByDesc('jumlah')->limit(5)->get(),
            'modul_teratas' => $dasar()->whereNotNull('modul')->where('kategori', '!=', 'NAVIGASI')
                ->select('modul', DB::raw('count(*) as jumlah'))->groupBy('modul')->orderByDesc('jumlah')->limit(6)->get(),
        ]);
    }

    /** Pilihan filter: pengguna, modul, dan aksi yang pernah tercatat. */
    public function opsi(Request $request)
    {
        $pengelola = $request->user()->isPengelola();
        $log = LogAktivitas::query()->when(!$pengelola, fn($q) => $q->where('user_id', $request->user()->id));
        return response()->json([
            'users' => $pengelola ? User::orderBy('name')->get(['id', 'name', 'role']) : [],
            'modul' => (clone $log)->whereNotNull('modul')->distinct()->orderBy('modul')->pluck('modul'),
            'aksi' => (clone $log)->distinct()->orderBy('aksi')->pluck('aksi'),
            'kategori' => self::KATEGORI,
        ]);
    }

    /** Catat tindakan yang terjadi di browser (cetak, ekspor, unduh, chat WA manual, buka halaman). */
    public function event(Request $request)
    {
        $request->validate([
            'aksi' => 'required|in:' . implode(',', self::AKSI_EVENT),
            'modul' => 'required|string|max:60',
            'deskripsi' => 'required|string|max:500',
            'rute' => 'nullable|string|max:255',
            'meta' => 'nullable|array',
        ]);

        AuditTrail::catat([
            'user' => $request->user(),
            'kategori' => $request->aksi === 'BUKA_HALAMAN' ? 'NAVIGASI' : 'OUTPUT',
            'aksi' => $request->aksi,
            'modul' => $request->modul,
            'deskripsi' => $request->deskripsi,
            'rute' => $request->rute,
            'metode' => 'UI',
            'meta' => $request->meta ? AuditTrail::sensor($request->meta) : null,
        ]);

        return response()->json(['success' => true]);
    }
}

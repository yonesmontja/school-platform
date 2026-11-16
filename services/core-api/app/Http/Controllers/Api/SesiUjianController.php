<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Classes;
use App\Models\PaketSoal;
use App\Models\PaketSoalJawaban;
use App\Models\Teacher;
use App\Models\UjianSesi;
use App\Models\User;
use App\Services\UjianService;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

/**
 * Sesi ujian CBT (Tahap A): proktor (admin/kepala sekolah) atau guru pemilik paket menjadwalkan satu paket soal untuk
 * beberapa kelas dengan token sesi; pengawas memantau semua peserta langsung, mengizinkan masuk ulang, menambah waktu,
 * mengakhiri sesi siswa, dan mencetak kartu peserta.
 */
class SesiUjianController extends Controller
{
    private const DETIK_OFFLINE = 60;

    public function index(Request $request)
    {
        $user = $request->user();
        $sesi = UjianSesi::with(['paket:id_paket,judul,id_mapel,dibuat_oleh', 'paket.mapel:id_mapel,nama_mapel', 'pengawas:id_guru,nama_guru', 'pembuat:id,name,id_guru'])
            ->when(!$user->isPengelola(), fn($q) => $q->where(fn($w) => $w->where('id_pengawas', $user->id_guru ?? '-')
                ->orWhereHas('paket', fn($p) => $p->where('dibuat_oleh', $user->id))))
            ->orderByDesc('mulai')->limit(200)->get();
        $kelas = Classes::pluck('nama_kelas', 'id_kelas');
        $jumlah = PaketSoalJawaban::whereIn('id_sesi', $sesi->pluck('id_sesi'))->selectRaw('id_sesi, count(*) as mulai, count(selesai_pada) as selesai, sum(case when terkunci then 1 else 0 end) as terkunci')
            ->groupBy('id_sesi')->get()->keyBy('id_sesi');
        return response()->json(['data' => $sesi->map(fn($s) => $this->ringkas($s, $kelas) + [
            'jumlah_mulai' => (int) ($jumlah[$s->id_sesi]->mulai ?? 0), 'jumlah_selesai' => (int) ($jumlah[$s->id_sesi]->selesai ?? 0),
            'jumlah_terkunci' => (int) ($jumlah[$s->id_sesi]->terkunci ?? 0), 'jumlah_peserta' => $s->siswa()->count(),
        ])]);
    }

    /** Paket yang bisa dijadwalkan (punya soal), kelas, dan guru calon pengawas. */
    public function referensi(Request $request)
    {
        $user = $request->user();
        $paket = PaketSoal::with('mapel:id_mapel,nama_mapel', 'kelas:id_kelas,nama_kelas')->withCount('butir')->has('butir')
            ->when(!$user->isPengelola(), fn($q) => $q->where('dibuat_oleh', $user->id))
            ->orderByDesc('updated_at')->limit(300)->get(['id_paket', 'judul', 'id_mapel', 'id_kelas', 'durasi_menit', 'dibuat_oleh', 'updated_at']);
        return response()->json([
            'paket' => $paket->map(fn($p) => ['id_paket' => $p->id_paket, 'judul' => $p->judul, 'mapel' => $p->mapel?->nama_mapel, 'kelas' => $p->kelas?->nama_kelas,
                'id_kelas' => $p->id_kelas, 'jumlah_soal' => $p->butir_count, 'durasi_menit' => $p->durasi_menit]),
            'kelas' => Classes::orderBy('nama_kelas')->get(['id_kelas', 'nama_kelas']),
            'guru' => Teacher::orderBy('nama_guru')->get(['id_guru', 'nama_guru']),
        ]);
    }

    public function store(Request $request)
    {
        $data = $this->validasi($request);
        $paket = PaketSoal::findOrFail($data['id_paket']);
        $this->cekKelola($request, $paket);
        $sesi = UjianSesi::create($data + [
            'id_sesi' => 'SES-' . Str::upper(Str::random(10)), 'dibuat_oleh' => $request->user()->id,
            'token' => $data['token'] ?? UjianSesi::tokenAcak(),
        ]);
        return response()->json(['success' => true, 'message' => 'Sesi ujian dibuat.', 'data' => $this->detail($sesi->fresh())], 201);
    }

    public function show(Request $request, string $id)
    {
        $sesi = UjianSesi::findOrFail($id);
        $this->cekPantau($request, $sesi);
        $u = $request->user();
        return response()->json(['data' => $this->detail($sesi) + ['boleh_ubah' => $u->isAdmin() || $u->isKepsek() || $sesi->paket?->dibuat_oleh === $u->id]]);
    }

    public function update(Request $request, string $id)
    {
        $sesi = UjianSesi::findOrFail($id);
        $this->cekKelola($request, $sesi->paket);
        $data = $this->validasi($request, $sesi);
        if ($data['id_paket'] !== $sesi->id_paket && PaketSoalJawaban::where('id_sesi', $sesi->id_sesi)->exists()) {
            throw ValidationException::withMessages(['id_paket' => 'Paket tidak bisa diganti karena sudah ada siswa yang mengerjakan sesi ini.']);
        }
        $this->cekKelola($request, PaketSoal::findOrFail($data['id_paket']));
        $sesi->update($data);
        return response()->json(['success' => true, 'message' => 'Sesi ujian disimpan.', 'data' => $this->detail($sesi->fresh())]);
    }

    public function destroy(Request $request, string $id)
    {
        $sesi = UjianSesi::findOrFail($id);
        $this->cekKelola($request, $sesi->paket);
        abort_if(PaketSoalJawaban::where('id_sesi', $sesi->id_sesi)->exists(), 422, 'Sesi ini sudah dikerjakan siswa; nonaktifkan saja agar jawabannya tetap tersimpan.');
        $sesi->delete();
        return response()->json(['success' => true, 'message' => 'Sesi ujian dihapus.']);
    }

    /**
     * Pantau langsung semua peserta sesi: status (BELUM, MENGERJAKAN, OFFLINE, TERKUNCI, SELESAI, SESI_LAIN), terjawab,
     * sisa waktu, pelanggaran, peristiwa terakhir; beserta token yang sedang berlaku.
     */
    public function pantau(Request $request, string $id)
    {
        $sesi = UjianSesi::with('paket.butir')->findOrFail($id);
        $this->cekPantau($request, $sesi);
        $paket = $sesi->paket;
        UjianService::tutupKedaluwarsa($paket);
        $siswa = $sesi->siswa()->get(['id_siswa', 'nisn', 'nama_siswa', 'id_kelas']);
        $jawaban = PaketSoalJawaban::where('id_paket', $paket->id_paket)->whereIn('id_siswa', $siswa->pluck('id_siswa'))->get()->keyBy('id_siswa');
        $kelas = Classes::whereIn('id_kelas', $sesi->kelas ?: [])->pluck('nama_kelas', 'id_kelas');
        $jumlahSoal = $paket->butir->count();
        $terjawab = fn($j) => collect($j->jawaban ?? [])->filter(fn($v) => $v !== null && $v !== '' && $v !== [] && (!is_array($v) || array_filter($v, fn($x) => $x !== null && $x !== '')))->count();
        $sesi->terapkan($paket);

        $data = $siswa->map(function ($s) use ($jawaban, $sesi, $paket, $kelas, $jumlahSoal, $terjawab) {
            $j = $jawaban->get($s->id_siswa);
            $status = match (true) {
                !$j => 'BELUM',
                $j->id_sesi && $j->id_sesi !== $sesi->id_sesi => 'SESI_LAIN',
                $j->sumber === 'KERTAS' || (bool) $j->selesai_pada => 'SELESAI',
                $j->terkunci => 'TERKUNCI',
                $j->terakhir_aktif && $j->terakhir_aktif->lt(now()->subSeconds(self::DETIK_OFFLINE)) => 'OFFLINE',
                default => 'MENGERJAKAN',
            };
            $batas = $j && $j->sedangDikerjakan() ? UjianService::batas($paket, $j) : null;
            $akhir = collect($j?->log ?? [])->last();
            return [
                'id_siswa' => $s->id_siswa, 'nisn' => $s->nisn, 'nama_siswa' => $s->nama_siswa, 'kelas' => $kelas[$s->id_kelas] ?? $s->id_kelas,
                'status' => $status, 'terjawab' => $j ? $terjawab($j) : 0, 'jumlah_soal' => $jumlahSoal,
                'sisa_detik' => $batas ? max(0, (int) floor(now()->diffInSeconds($batas, false))) : null,
                'pelanggaran' => $j?->pelanggaran ?? 0, 'alasan_kunci' => $j?->alasan_kunci, 'tambahan_menit' => $j?->tambahan_menit ?? 0,
                'terakhir_aktif' => $j?->terakhir_aktif?->toIso8601String(), 'mulai_pada' => $j?->mulai_pada?->toIso8601String(),
                'peristiwa_terakhir' => $akhir, 'jumlah_peristiwa' => count($j?->log ?? []),
                'nilai' => $j && !$j->sedangDikerjakan() ? $j->nilai : null,
            ];
        });
        $hitung = $data->countBy('status');
        return response()->json(['data' => $data->values(), 'ringkasan' => $hitung->all() + ['total' => $data->count()],
            'token' => $sesi->tokenPada(), 'token_ganti_detik' => $sesi->detikGantiToken(), 'server' => now()->toIso8601String()]);
    }

    /** Log peristiwa seorang siswa (untuk ditelusuri pengawas). */
    public function log(Request $request, string $id, string $idSiswa)
    {
        $sesi = UjianSesi::findOrFail($id);
        $this->cekPantau($request, $sesi);
        $j = PaketSoalJawaban::where('id_paket', $sesi->id_paket)->where('id_siswa', $idSiswa)->firstOrFail();
        return response()->json(['data' => array_reverse($j->log ?? []), 'pelanggaran' => $j->pelanggaran]);
    }

    /**
     * Izinkan masuk ulang: buka kunci, lepas perangkat lama (siswa boleh lanjut di perangkat lain), hitungan pelanggaran
     * kembali 0 (riwayat tetap di log). Bisa sekaligus menambah waktu.
     */
    public function izinkan(Request $request, string $id, string $idSiswa)
    {
        $sesi = UjianSesi::findOrFail($id);
        $this->cekPantau($request, $sesi);
        $request->validate(['tambah_menit' => 'nullable|integer|min:0|max:120']);
        $j = $this->jawabanSesi($sesi, $idSiswa);
        abort_unless($j->sedangDikerjakan(), 422, 'Siswa ini tidak sedang mengerjakan.');
        $tambah = $request->integer('tambah_menit');
        $nama = $request->user()->name;
        if ($j->terkunci || $j->perangkat) $j->catat('DIIZINKAN', "oleh {$nama}");
        $j->fill(['terkunci' => false, 'alasan_kunci' => null, 'perangkat' => null, 'pelanggaran' => 0, 'terakhir_aktif' => now()]);
        if ($tambah) { $j->tambahan_menit = $j->tambahan_menit + $tambah; $j->catat('TAMBAH_WAKTU', "+{$tambah} menit oleh {$nama}"); }
        $j->save();
        return response()->json(['success' => true, 'message' => 'Siswa diizinkan masuk ulang' . ($tambah ? " dengan tambahan {$tambah} menit" : '') . '.']);
    }

    public function akhiri(Request $request, string $id, string $idSiswa)
    {
        $sesi = UjianSesi::with('paket.butir')->findOrFail($id);
        $this->cekPantau($request, $sesi);
        $j = $this->jawabanSesi($sesi, $idSiswa);
        abort_unless($j->sedangDikerjakan(), 422, 'Siswa ini tidak sedang mengerjakan.');
        $j->catat('DIAKHIRI', 'oleh ' . $request->user()->name);
        UjianService::selesaikan($sesi->paket, $j);
        return response()->json(['success' => true, 'message' => 'Sesi siswa diakhiri; jawaban yang tersimpan dikumpulkan.']);
    }

    /** Data kartu peserta: identitas siswa, username akun siswa, dan jadwal sesi (tanpa kata sandi). */
    public function kartu(Request $request, string $id)
    {
        $sesi = UjianSesi::with(['paket:id_paket,judul,id_mapel', 'paket.mapel:id_mapel,nama_mapel', 'pengawas:id_guru,nama_guru'])->findOrFail($id);
        $this->cekPantau($request, $sesi);
        $siswa = $sesi->siswa()->get(['id_siswa', 'nisn', 'nama_siswa', 'id_kelas']);
        $akun = User::where('role', 'siswa')->whereIn('id_siswa', $siswa->pluck('id_siswa'))->pluck('username', 'id_siswa');
        $kelas = Classes::whereIn('id_kelas', $sesi->kelas ?: [])->pluck('nama_kelas', 'id_kelas');
        return response()->json([
            'sesi' => $this->ringkas($sesi, $kelas),
            'peserta' => $siswa->values()->map(fn($s, $i) => [
                'no' => $i + 1, 'nama_siswa' => $s->nama_siswa, 'nisn' => $s->nisn,
                'kelas' => $kelas[$s->id_kelas] ?? $s->id_kelas, 'username' => $akun[$s->id_siswa] ?? null,
            ]),
        ]);
    }

    // ===== bantu =====

    private function jawabanSesi(UjianSesi $sesi, string $idSiswa): PaketSoalJawaban
    {
        return PaketSoalJawaban::where('id_paket', $sesi->id_paket)->where('id_siswa', $idSiswa)->where('id_sesi', $sesi->id_sesi)->firstOrFail();
    }

    private function validasi(Request $request, ?UjianSesi $sesi = null): array
    {
        $data = $request->validate([
            'nama' => 'required|string|max:150',
            'id_paket' => 'required|exists:paket_soal,id_paket',
            'kelas' => 'required|array|min:1|max:30',
            'kelas.*' => 'exists:classes,id_kelas',
            'mulai' => 'required|date',
            'selesai' => 'required|date|after:mulai',
            'durasi_menit' => 'nullable|integer|min:5|max:600',
            'token' => ['nullable', 'string', 'min:4', 'max:12', 'regex:/^[A-Za-z0-9]+$/'],
            'token_ganti_menit' => 'nullable|integer|in:5,10,15,20,30,60',
            'acak_soal' => 'boolean', 'acak_pilihan' => 'boolean', 'tampilkan_nilai' => 'boolean',
            'wajib_layar_penuh' => 'boolean', 'kunci_perangkat' => 'boolean', 'aktif' => 'boolean',
            'batas_pelanggaran' => 'nullable|integer|min:1|max:50',
            'ruang' => 'nullable|string|max:80',
            'id_pengawas' => 'nullable|exists:teachers,id_guru',
        ], [
            'kelas.required' => 'Pilih minimal satu kelas peserta.', 'selesai.after' => 'Waktu tutup harus setelah waktu buka.',
            'token.regex' => 'Token hanya huruf dan angka.', 'nama.required' => 'Tulis nama sesi, mis. PTS Matematika Sesi 1.',
        ]);
        $data['kelas'] = array_values(array_unique($data['kelas']));
        if (!empty($data['token'])) $data['token'] = mb_strtoupper($data['token']);
        else unset($data['token']);
        return $data;
    }

    private function ringkas(UjianSesi $s, $kelas): array
    {
        return [
            'id_sesi' => $s->id_sesi, 'nama' => $s->nama, 'id_paket' => $s->id_paket, 'paket' => $s->paket?->judul, 'mapel' => $s->paket?->mapel?->nama_mapel,
            'kelas' => $s->kelas, 'nama_kelas' => collect($s->kelas)->map(fn($k) => $kelas[$k] ?? $k)->values(),
            'mulai' => $s->mulai?->toIso8601String(), 'selesai' => $s->selesai?->toIso8601String(), 'durasi_menit' => $s->durasi_menit,
            'ruang' => $s->ruang, 'id_pengawas' => $s->id_pengawas, 'pengawas' => $s->pengawas?->nama_guru, 'aktif' => $s->aktif,
            'status' => !$s->aktif ? 'NONAKTIF' : (now()->lt($s->mulai) ? 'TERJADWAL' : (now()->lt($s->selesai) ? 'BERLANGSUNG' : 'SELESAI')),
        ];
    }

    private function detail(UjianSesi $s): array
    {
        $s->loadMissing(['paket:id_paket,judul,id_mapel', 'paket.mapel:id_mapel,nama_mapel', 'pengawas:id_guru,nama_guru']);
        return $this->ringkas($s, Classes::whereIn('id_kelas', $s->kelas ?: [])->pluck('nama_kelas', 'id_kelas')) + $s->only([
            'token_ganti_menit', 'acak_soal', 'acak_pilihan', 'tampilkan_nilai', 'wajib_layar_penuh', 'batas_pelanggaran', 'kunci_perangkat',
        ]) + ['token_dasar' => $s->token, 'token' => $s->tokenPada(), 'token_ganti_detik' => $s->detikGantiToken()];
    }

    /** Menjadwalkan sesi: admin/kepala sekolah, atau guru pemilik paket. */
    private function cekKelola(Request $request, ?PaketSoal $paket): void
    {
        $user = $request->user();
        abort_unless($user->isAdmin() || $user->isKepsek() || ($paket && $paket->dibuat_oleh === $user->id), 403, 'Sesi ujian dijadwalkan proktor (admin/kepala sekolah) atau guru pemilik paket.');
    }

    /** Memantau: pengelola, guru pemilik paket, atau guru pengawas sesi itu. */
    private function cekPantau(Request $request, UjianSesi $sesi): void
    {
        $user = $request->user();
        $boleh = $user->isPengelola() || ($user->id_guru && $user->id_guru === $sesi->id_pengawas) || $sesi->paket?->dibuat_oleh === $user->id;
        abort_unless($boleh, 403, 'Anda bukan pengawas sesi ini.');
    }
}

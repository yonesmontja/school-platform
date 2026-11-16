<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\PaketSoal;
use App\Models\PaketSoalJawaban;
use App\Models\Student;
use App\Models\UjianSesi;
use App\Services\PaketSoalService;
use App\Services\UjianService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

/**
 * Tes online untuk akun siswa (Fase 16 Tahap C) dan sesi ujian CBT (Tahap A). Siswa melihat paket online untuk kelasnya
 * dan sesi ujian yang memuat kelasnya; soal tanpa kunci, waktunya dibatasi server, jawaban tersimpan otomatis.
 * Mode ujian sesi: token sesi, satu perangkat per siswa, log peristiwa (keluar tab/layar penuh, offline), dan kunci setelah
 * batas pelanggaran sampai pengawas mengizinkan masuk ulang.
 */
class UjianController extends Controller
{
    private const MAKS_REKAMAN = 8 * 1024 * 1024;
    // Rekaman MediaRecorder: Chrome/Android = webm (kadang terbaca video/webm), Safari/iPhone = mp4
    private const MIME_REKAMAN = [
        'audio/webm' => 'webm', 'video/webm' => 'webm', 'audio/ogg' => 'ogg', 'audio/mp4' => 'm4a', 'video/mp4' => 'm4a',
        'audio/x-m4a' => 'm4a', 'audio/mpeg' => 'mp3', 'audio/wav' => 'wav', 'audio/x-wav' => 'wav', 'audio/aac' => 'aac',
    ];

    public function index(Request $request)
    {
        $siswa = $this->siswa($request);
        // Sesi ujian CBT untuk kelas ini (aturan sesi menggantikan pengaturan online paket)
        $sesi = UjianSesi::where('aktif', true)->whereJsonContains('kelas', $siswa->id_kelas)->orderBy('mulai')->get()
            ->groupBy('id_paket')->map(fn($g) => $this->pilihSesi($g));
        $paket = PaketSoal::with('mapel:id_mapel,nama_mapel')->withCount('butir')
            ->where(fn($q) => $q->where(fn($w) => $w->where('online', true)->where('id_kelas', $siswa->id_kelas))->orWhereIn('id_paket', $sesi->keys()))
            ->orderByRaw('online_mulai IS NULL')->orderBy('online_mulai')->orderByDesc('updated_at')->get();
        $jawaban = PaketSoalJawaban::where('id_siswa', $siswa->id_siswa)->whereIn('id_paket', $paket->pluck('id_paket'))->get()->keyBy('id_paket');
        $paket->each(function ($p) use ($sesi, $jawaban) {
            $s = ($j = $jawaban->get($p->id_paket)) && $j->id_sesi ? UjianSesi::find($j->id_sesi) : $sesi->get($p->id_paket);
            if ($s) $s->terapkan($p);
        });

        return response()->json(['data' => $paket->sortBy(fn($p) => $p->online_mulai?->getTimestamp() ?? PHP_INT_MAX)->values()->map(function ($p) use ($jawaban) {
            $j = $jawaban->get($p->id_paket);
            if ($j && $j->sedangDikerjakan() && UjianService::habis($p, $j, UjianService::TOLERANSI_DETIK)) {
                UjianService::selesaikan($p->load('butir'), $j, UjianService::batas($p, $j));
            }
            $status = UjianService::status($p, $j);
            return [
                'id_paket' => $p->id_paket, 'judul' => $p->judul, 'mapel' => $p->mapel?->nama_mapel,
                'jumlah_soal' => $p->butir_count, 'durasi_menit' => $p->durasi_menit,
                'online_mulai' => $p->online_mulai, 'online_selesai' => $p->online_selesai,
                'butuh_token' => (bool) $p->token || $p->relationLoaded('sesiUjian'), 'status' => $status,
                'sesi' => $p->relationLoaded('sesiUjian') ? $p->sesiUjian->only(['nama', 'ruang']) : null,
            ] + $this->hasil($p, $j);
        })->values()]);
    }

    /** Mulai (atau lanjutkan) mengerjakan. Token diminta bila guru memasangnya. */
    public function mulai(Request $request, string $id)
    {
        $siswa = $this->siswa($request);
        $paket = $this->paket($siswa, $id);
        $sesi = $paket->relationLoaded('sesiUjian') ? $paket->sesiUjian : null;
        $request->validate(['token' => 'nullable|string|max:20', 'perangkat' => 'nullable|string|max:64']);

        $hasil = DB::transaction(function () use ($request, $paket, $siswa, $sesi) {
            $j = PaketSoalJawaban::where('id_paket', $paket->id_paket)->where('id_siswa', $siswa->id_siswa)->lockForUpdate()->first();
            $status = UjianService::status($paket, $j);
            if ($status === 'MENGERJAKAN') {
                // Ditolak di luar transaksi agar catatan percobaan dari perangkat lain tetap tersimpan
                if ($alasan = $this->alasanKunci($j, $sesi, $request->perangkat)) {
                    if (!$j->terkunci) { $j->catat('PERANGKAT_LAIN'); $j->save(); }
                    return $alasan;
                }
                $this->cekKunci($j, $sesi, $request->perangkat, false);
                return $j;
            }
            $pesan = [
                'SELESAI' => 'Kamu sudah menyelesaikan tes ini.',
                'BELUM_DIBUKA' => 'Tes belum dibuka. Tunggu sampai waktunya.',
                'DITUTUP' => 'Waktu tes sudah ditutup.',
            ][$status] ?? null;
            if ($pesan) abort(422, $pesan);
            if ($sesi && !$sesi->tokenSah($request->token)) abort(422, 'Token salah atau sudah berganti. Lihat token terbaru dari pengawas.');
            if (!$sesi && $paket->token && mb_strtoupper(trim((string) $request->token)) !== mb_strtoupper($paket->token)) abort(422, 'Token salah. Tanyakan token kepada gurumu.');
            if ($paket->butir->isEmpty()) abort(422, 'Tes ini belum berisi soal.');

            $j ??= new PaketSoalJawaban(['id_paket' => $paket->id_paket, 'id_siswa' => $siswa->id_siswa]);
            $j->fill(['sumber' => 'ONLINE', 'mulai_pada' => now(), 'terakhir_aktif' => now(), 'urutan' => UjianService::buatUrutan($paket), 'jawaban' => [], 'skor_manual' => [],
                'id_sesi' => $sesi?->id_sesi, 'perangkat' => $request->perangkat ? mb_substr($request->perangkat, 0, 64) : null]);
            if ($sesi) $j->catat('MASUK', $sesi->nama);
            PaketSoalService::hitung($j, $paket->butir);
            $j->save();
            return $j;
        });
        if (is_string($hasil)) abort(423, $hasil);
        return $this->kirimSesi($paket, $hasil, $request->perangkat);
    }

    /** Soal dan jawaban tersimpan untuk sesi yang sedang berjalan (atau hasil bila sudah selesai). */
    public function show(Request $request, string $id)
    {
        $siswa = $this->siswa($request);
        $paket = $this->paket($siswa, $id);
        $j = PaketSoalJawaban::where('id_paket', $paket->id_paket)->where('id_siswa', $siswa->id_siswa)->first();
        if ($j && $j->sedangDikerjakan() && UjianService::habis($paket, $j, UjianService::TOLERANSI_DETIK)) {
            UjianService::selesaikan($paket, $j, UjianService::batas($paket, $j));
        }
        return $this->kirimSesi($paket, $j, $request->query('perangkat'));
    }

    /** Simpan otomatis: jawaban yang dikirim digabung dengan yang sudah ada. */
    public function simpan(Request $request, string $id)
    {
        $siswa = $this->siswa($request);
        $paket = $this->paket($siswa, $id);
        $request->validate(['jawaban' => 'nullable|array', 'pelanggaran' => 'nullable|integer|min:0|max:100', 'perangkat' => 'nullable|string|max:64',
            'peristiwa' => 'nullable|array|max:30', 'peristiwa.*.jenis' => 'required|string|in:' . implode(',', PaketSoalJawaban::PERISTIWA), 'peristiwa.*.t' => 'nullable|string|max:40']);
        $this->sesiBerjalan($paket, $siswa, $request->perangkat);

        // Dikunci per baris: dua simpanan yang datang bersamaan (mis. keluar tab saat simpan sebelumnya belum selesai)
        // tidak boleh saling menimpa jawaban maupun hitungan pelanggaran
        $j = DB::transaction(function () use ($request, $paket, $siswa) {
            $j = PaketSoalJawaban::where('id_paket', $paket->id_paket)->where('id_siswa', $siswa->id_siswa)->lockForUpdate()->first();
            $butir = $paket->butir->keyBy(fn($b) => (string) $b->id);
            $jawaban = $j->jawaban ?? [];
            foreach ((array) $request->jawaban as $idB => $v) {
                // Rekaman membaca nyaring hanya diisi lewat unggahan rekaman, bukan dari jawaban yang dikirim
                if (isset($butir[(string) $idB]) && $butir[(string) $idB]->soal['bentuk'] !== 'MEMBACA_NYARING') {
                    $jawaban[(string) $idB] = PaketSoalService::normalisasiJawaban($butir[(string) $idB]->soal, $v);
                }
            }
            $j->jawaban = $jawaban;
            // Peristiwa mode ujian dicatat; pelanggaran dihitung dari peristiwa (atau angka lama dari klien tanpa log)
            $peristiwa = collect($request->input('peristiwa', []));
            foreach ($peristiwa as $e) $j->catat($e['jenis'], null, $e['t'] ?? null);
            $tambah = $peristiwa->isNotEmpty() ? $peristiwa->whereIn('jenis', PaketSoalJawaban::PELANGGARAN)->count() : $request->integer('pelanggaran');
            $j->pelanggaran = min(999, $j->pelanggaran + $tambah);
            $sesi = $j->id_sesi ? $j->sesi : null;
            if ($sesi?->batas_pelanggaran && $j->pelanggaran >= $sesi->batas_pelanggaran && !$j->terkunci) {
                $j->terkunci = true;
                $j->alasan_kunci = "Keluar dari halaman ujian {$j->pelanggaran} kali.";
                $j->catat('TERKUNCI', $j->alasan_kunci);
            }
            $j->terakhir_aktif = now();
            PaketSoalService::hitung($j, $paket->butir);
            $j->save();
            return $j;
        });
        return response()->json(['success' => true, 'tersimpan' => now()->toIso8601String(), 'sisa_detik' => $this->sisa($paket, $j),
            'terkunci' => $j->terkunci, 'alasan_kunci' => $j->alasan_kunci]);
    }

    /** Unggah rekaman suara membaca nyaring (maks. 8MB); rekaman lama untuk soal itu diganti. */
    public function rekam(Request $request, string $id)
    {
        $siswa = $this->siswa($request);
        $paket = $this->paket($siswa, $id);
        $request->validate(['id_butir' => 'required|integer', 'audio_base64' => 'required|string', 'perangkat' => 'nullable|string|max:64']);
        $j = $this->sesiBerjalan($paket, $siswa, $request->perangkat);
        $b = $paket->butir->firstWhere('id', $request->integer('id_butir'));
        abort_unless($b && $b->soal['bentuk'] === 'MEMBACA_NYARING', 422, 'Soal ini bukan soal membaca nyaring.');

        $data = base64_decode(preg_replace('/^data:[^,]*,/', '', $request->audio_base64), true);
        if (!$data) throw ValidationException::withMessages(['audio_base64' => 'Rekaman tidak valid.']);
        if (strlen($data) > self::MAKS_REKAMAN) throw ValidationException::withMessages(['audio_base64' => 'Rekaman terlalu panjang (maks. 8MB). Rekam ulang lebih singkat.']);
        $mime = (new \finfo(FILEINFO_MIME_TYPE))->buffer($data);
        $ext = self::MIME_REKAMAN[$mime] ?? null;
        if (!$ext) throw ValidationException::withMessages(['audio_base64' => "Format rekaman tidak didukung ({$mime})."]);

        $file = "rekaman/{$paket->id_paket}_{$siswa->id_siswa}_" . Str::random(20) . ".{$ext}";
        Storage::disk('public')->put($file, $data);
        $jawaban = $j->jawaban ?? [];
        $lama = $jawaban[(string) $b->id] ?? null;
        $jawaban[(string) $b->id] = '/storage/' . $file;
        $j->jawaban = $jawaban;
        $j->terakhir_aktif = now();
        PaketSoalService::hitung($j, $paket->butir);
        $j->save();
        if (is_string($lama) && Str::startsWith($lama, '/storage/rekaman/')) Storage::disk('public')->delete(Str::after($lama, '/storage/'));
        return response()->json(['success' => true, 'url' => '/storage/' . $file, 'sisa_detik' => $this->sisa($paket, $j)]);
    }

    public function selesai(Request $request, string $id)
    {
        $siswa = $this->siswa($request);
        $paket = $this->paket($siswa, $id);
        $request->validate(['jawaban' => 'nullable|array', 'pelanggaran' => 'nullable|integer|min:0|max:100', 'perangkat' => 'nullable|string|max:64']);
        // Jawaban terakhir ikut disimpan sebelum ditutup
        if ($request->filled('jawaban') || $request->filled('pelanggaran') || $request->filled('peristiwa')) $this->simpan($request, $id);
        $j = $this->sesiBerjalan($paket, $siswa, $request->perangkat);
        UjianService::selesaikan($paket, $j);
        return $this->kirimSesi($paket, $j->fresh());
    }

    // ===== bantu =====

    private function kirimSesi(PaketSoal $paket, ?PaketSoalJawaban $j, ?string $perangkat = null)
    {
        $status = UjianService::status($paket, $j);
        $sesi = $paket->relationLoaded('sesiUjian') ? $paket->sesiUjian : null;
        $dasar = [
            'id_paket' => $paket->id_paket, 'judul' => $paket->judul, 'mapel' => $paket->mapel?->nama_mapel,
            'petunjuk' => $paket->petunjuk, 'durasi_menit' => $paket->durasi_menit, 'jumlah_soal' => $paket->butir->count(),
            'butuh_token' => (bool) $paket->token || (bool) $sesi, 'online_mulai' => $paket->online_mulai, 'online_selesai' => $paket->online_selesai,
            'status' => $status,
            'mode' => $sesi ? ['sesi' => $sesi->nama, 'ruang' => $sesi->ruang, 'layar_penuh' => $sesi->wajib_layar_penuh,
                'batas_pelanggaran' => $sesi->batas_pelanggaran, 'satu_perangkat' => $sesi->kunci_perangkat] : null,
        ];
        if ($status !== 'MENGERJAKAN') return response()->json(['data' => $dasar + $this->hasil($paket, $j)]);
        // Terkunci (pelanggaran) atau dibuka di perangkat lain: soal tidak dikirim sampai pengawas mengizinkan masuk ulang
        if ($kunci = $this->alasanKunci($j, $sesi, $perangkat)) {
            return response()->json(['data' => array_merge($dasar, ['status' => 'TERKUNCI', 'alasan_kunci' => $kunci, 'pelanggaran' => $j->pelanggaran])]);
        }

        $batas = UjianService::batas($paket, $j);
        return response()->json(['data' => $dasar + [
            'soal' => UjianService::soalSiswa($paket, $j),
            'jawaban' => (object) ($j->jawaban ?? []),
            'batas' => $batas?->toIso8601String(),
            'sisa_detik' => $this->sisa($paket, $j),
            'mulai_pada' => $j->mulai_pada?->toIso8601String(),
            'pelanggaran' => $j->pelanggaran,
        ]]);
    }

    /** Nilai hanya ditampilkan bila guru mengizinkan; uraian yang belum dinilai membuat nilai belum final. */
    private function hasil(PaketSoal $paket, ?PaketSoalJawaban $j): array
    {
        if (!$j || !$paket->tampilkan_nilai || $j->sedangDikerjakan()) return [];
        return ['nilai' => $j->lengkap ? $j->nilai : null, 'menunggu_guru' => !$j->lengkap];
    }

    private function sisa(PaketSoal $paket, PaketSoalJawaban $j): ?int
    {
        $batas = UjianService::batas($paket, $j);
        return $batas ? max(0, (int) floor(now()->diffInSeconds($batas, false))) : null;
    }

    private function sesiBerjalan(PaketSoal $paket, Student $siswa, ?string $perangkat = null): PaketSoalJawaban
    {
        $j = PaketSoalJawaban::where('id_paket', $paket->id_paket)->where('id_siswa', $siswa->id_siswa)->first();
        if (!$j || !$j->sedangDikerjakan()) abort(422, 'Sesi tes tidak berjalan. Muat ulang halaman.');
        $this->cekKunci($j, $j->id_sesi ? $j->sesi : null, $perangkat, false);
        if (UjianService::habis($paket, $j, UjianService::TOLERANSI_DETIK)) {
            UjianService::selesaikan($paket, $j, UjianService::batas($paket, $j));
            abort(422, 'Waktu habis. Jawabanmu yang sudah tersimpan telah dikumpulkan.');
        }
        return $j;
    }

    private function siswa(Request $request): Student
    {
        $user = $request->user();
        abort_unless($user->role === 'siswa' && $user->id_siswa, 403, 'Tes online hanya untuk akun siswa.');
        $siswa = Student::find($user->id_siswa);
        abort_unless($siswa?->id_kelas, 403, 'Akun siswa belum terhubung ke kelas.');
        return $siswa;
    }

    /**
     * Paket untuk siswa ini beserta aturan sesinya: sesi yang sudah dipakai siswa, sesi aktif untuk kelasnya,
     * atau (tanpa sesi) paket online untuk kelasnya.
     */
    private function paket(Student $siswa, string $id): PaketSoal
    {
        $paket = PaketSoal::with(['butir', 'mapel:id_mapel,nama_mapel'])->findOrFail($id);
        $idSesi = PaketSoalJawaban::where('id_paket', $id)->where('id_siswa', $siswa->id_siswa)->value('id_sesi');
        $sesi = $idSesi ? UjianSesi::find($idSesi)
            : $this->pilihSesi(UjianSesi::where('id_paket', $id)->where('aktif', true)->whereJsonContains('kelas', $siswa->id_kelas)->get());
        if ($sesi) return $sesi->terapkan($paket);
        abort_unless($paket->online && $paket->id_kelas === $siswa->id_kelas, 404, 'Tes tidak ditemukan.');
        return $paket;
    }

    /** Dari beberapa sesi paket yang sama untuk satu kelas: yang sedang berjalan, lalu yang terdekat akan datang, lalu yang terakhir. */
    private function pilihSesi($daftar): ?UjianSesi
    {
        $kini = now();
        return $daftar->first(fn($s) => $s->mulai->lte($kini) && $s->selesai->gt($kini))
            ?? $daftar->filter(fn($s) => $s->mulai->gt($kini))->sortBy('mulai')->first()
            ?? $daftar->sortByDesc('selesai')->first();
    }

    /** Alasan sesi siswa tidak boleh dilanjutkan (terkunci karena pelanggaran / perangkat lain), atau null. */
    private function alasanKunci(PaketSoalJawaban $j, ?UjianSesi $sesi, ?string $perangkat): ?string
    {
        if ($j->terkunci) return ($j->alasan_kunci ?: 'Ujian dikunci.') . ' Minta pengawas mengizinkan masuk ulang.';
        if ($sesi?->kunci_perangkat && $j->perangkat && $perangkat && $perangkat !== $j->perangkat) {
            return 'Ujianmu sedang dikerjakan di perangkat lain. Minta pengawas mengizinkan masuk ulang di perangkat ini.';
        }
        return null;
    }

    private function cekKunci(PaketSoalJawaban $j, ?UjianSesi $sesi, ?string $perangkat, bool $catatPerangkat): void
    {
        if ($alasan = $this->alasanKunci($j, $sesi, $perangkat)) {
            if ($catatPerangkat && !$j->terkunci) { $j->catat('PERANGKAT_LAIN'); $j->save(); }
            abort(423, $alasan);
        }
        // Setelah diizinkan masuk ulang, perangkat baru tercatat saat pertama kali dipakai
        if ($sesi && $perangkat && !$j->perangkat) { $j->perangkat = mb_substr($perangkat, 0, 64); $j->save(); }
    }
}

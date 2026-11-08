<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\PaketSoal;
use App\Models\PaketSoalJawaban;
use App\Models\Student;
use App\Services\PaketSoalService;
use App\Services\UjianService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

/**
 * Tes online untuk akun siswa (Fase 16 Tahap C). Siswa hanya melihat paket online untuk kelasnya,
 * soal tanpa kunci, dan waktunya dibatasi server. Jawaban tersimpan otomatis selama mengerjakan.
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
        $paket = PaketSoal::with('mapel:id_mapel,nama_mapel')->withCount('butir')
            ->where('online', true)->where('id_kelas', $siswa->id_kelas)
            ->orderByRaw('online_mulai IS NULL')->orderBy('online_mulai')->orderByDesc('updated_at')->get();
        $jawaban = PaketSoalJawaban::where('id_siswa', $siswa->id_siswa)->whereIn('id_paket', $paket->pluck('id_paket'))->get()->keyBy('id_paket');

        return response()->json(['data' => $paket->map(function ($p) use ($jawaban) {
            $j = $jawaban->get($p->id_paket);
            if ($j && $j->sedangDikerjakan() && UjianService::habis($p, $j, UjianService::TOLERANSI_DETIK)) {
                UjianService::selesaikan($p->load('butir'), $j, UjianService::batas($p, $j));
            }
            $status = UjianService::status($p, $j);
            return [
                'id_paket' => $p->id_paket, 'judul' => $p->judul, 'mapel' => $p->mapel?->nama_mapel,
                'jumlah_soal' => $p->butir_count, 'durasi_menit' => $p->durasi_menit,
                'online_mulai' => $p->online_mulai, 'online_selesai' => $p->online_selesai,
                'butuh_token' => (bool) $p->token, 'status' => $status,
            ] + $this->hasil($p, $j);
        })->values()]);
    }

    /** Mulai (atau lanjutkan) mengerjakan. Token diminta bila guru memasangnya. */
    public function mulai(Request $request, string $id)
    {
        $siswa = $this->siswa($request);
        $paket = $this->paket($siswa, $id);
        $request->validate(['token' => 'nullable|string|max:20']);

        $hasil = DB::transaction(function () use ($request, $paket, $siswa) {
            $j = PaketSoalJawaban::where('id_paket', $paket->id_paket)->where('id_siswa', $siswa->id_siswa)->lockForUpdate()->first();
            $status = UjianService::status($paket, $j);
            if ($status === 'MENGERJAKAN') return $j;
            $pesan = [
                'SELESAI' => 'Kamu sudah menyelesaikan tes ini.',
                'BELUM_DIBUKA' => 'Tes belum dibuka. Tunggu sampai waktunya.',
                'DITUTUP' => 'Waktu tes sudah ditutup.',
            ][$status] ?? null;
            if ($pesan) abort(422, $pesan);
            if ($paket->token && mb_strtoupper(trim((string) $request->token)) !== mb_strtoupper($paket->token)) abort(422, 'Token salah. Tanyakan token kepada gurumu.');
            if ($paket->butir->isEmpty()) abort(422, 'Tes ini belum berisi soal.');

            $j ??= new PaketSoalJawaban(['id_paket' => $paket->id_paket, 'id_siswa' => $siswa->id_siswa]);
            $j->fill(['sumber' => 'ONLINE', 'mulai_pada' => now(), 'terakhir_aktif' => now(), 'urutan' => UjianService::buatUrutan($paket), 'jawaban' => [], 'skor_manual' => []]);
            PaketSoalService::hitung($j, $paket->butir);
            $j->save();
            return $j;
        });
        return $this->kirimSesi($paket, $hasil);
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
        return $this->kirimSesi($paket, $j);
    }

    /** Simpan otomatis: jawaban yang dikirim digabung dengan yang sudah ada. */
    public function simpan(Request $request, string $id)
    {
        $siswa = $this->siswa($request);
        $paket = $this->paket($siswa, $id);
        $request->validate(['jawaban' => 'nullable|array', 'pelanggaran' => 'nullable|integer|min:0|max:100']);
        $j = $this->sesiBerjalan($paket, $siswa);

        $butir = $paket->butir->keyBy(fn($b) => (string) $b->id);
        $jawaban = $j->jawaban ?? [];
        foreach ((array) $request->jawaban as $idB => $v) {
            // Rekaman membaca nyaring hanya diisi lewat unggahan rekaman, bukan dari jawaban yang dikirim
            if (isset($butir[(string) $idB]) && $butir[(string) $idB]->soal['bentuk'] !== 'MEMBACA_NYARING') {
                $jawaban[(string) $idB] = PaketSoalService::normalisasiJawaban($butir[(string) $idB]->soal, $v);
            }
        }
        $j->jawaban = $jawaban;
        $j->pelanggaran = min(999, $j->pelanggaran + $request->integer('pelanggaran'));
        $j->terakhir_aktif = now();
        PaketSoalService::hitung($j, $paket->butir);
        $j->save();
        return response()->json(['success' => true, 'tersimpan' => now()->toIso8601String(), 'sisa_detik' => $this->sisa($paket, $j)]);
    }

    /** Unggah rekaman suara membaca nyaring (maks. 8MB); rekaman lama untuk soal itu diganti. */
    public function rekam(Request $request, string $id)
    {
        $siswa = $this->siswa($request);
        $paket = $this->paket($siswa, $id);
        $request->validate(['id_butir' => 'required|integer', 'audio_base64' => 'required|string']);
        $j = $this->sesiBerjalan($paket, $siswa);
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
        $request->validate(['jawaban' => 'nullable|array', 'pelanggaran' => 'nullable|integer|min:0|max:100']);
        // Jawaban terakhir ikut disimpan sebelum ditutup
        if ($request->filled('jawaban') || $request->filled('pelanggaran')) $this->simpan($request, $id);
        $j = $this->sesiBerjalan($paket, $siswa);
        UjianService::selesaikan($paket, $j);
        return $this->kirimSesi($paket, $j->fresh());
    }

    // ===== bantu =====

    private function kirimSesi(PaketSoal $paket, ?PaketSoalJawaban $j)
    {
        $status = UjianService::status($paket, $j);
        $dasar = [
            'id_paket' => $paket->id_paket, 'judul' => $paket->judul, 'mapel' => $paket->mapel?->nama_mapel,
            'petunjuk' => $paket->petunjuk, 'durasi_menit' => $paket->durasi_menit, 'jumlah_soal' => $paket->butir->count(),
            'butuh_token' => (bool) $paket->token, 'online_mulai' => $paket->online_mulai, 'online_selesai' => $paket->online_selesai,
            'status' => $status,
        ];
        if ($status !== 'MENGERJAKAN') return response()->json(['data' => $dasar + $this->hasil($paket, $j)]);

        $batas = UjianService::batas($paket, $j);
        return response()->json(['data' => $dasar + [
            'soal' => UjianService::soalSiswa($paket, $j),
            'jawaban' => (object) ($j->jawaban ?? []),
            'batas' => $batas?->toIso8601String(),
            'sisa_detik' => $this->sisa($paket, $j),
            'mulai_pada' => $j->mulai_pada?->toIso8601String(),
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

    private function sesiBerjalan(PaketSoal $paket, Student $siswa): PaketSoalJawaban
    {
        $j = PaketSoalJawaban::where('id_paket', $paket->id_paket)->where('id_siswa', $siswa->id_siswa)->first();
        if (!$j || !$j->sedangDikerjakan()) abort(422, 'Sesi tes tidak berjalan. Muat ulang halaman.');
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

    private function paket(Student $siswa, string $id): PaketSoal
    {
        return PaketSoal::with(['butir', 'mapel:id_mapel,nama_mapel'])->where('online', true)->where('id_kelas', $siswa->id_kelas)->findOrFail($id);
    }
}

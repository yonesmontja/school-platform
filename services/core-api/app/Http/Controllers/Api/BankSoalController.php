<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\BankSoal;
use App\Models\Classes;
use App\Models\KisiKisiBaris;
use App\Models\MasterIndikator;
use App\Models\MasterMateri;
use App\Models\MasterMBK;
use App\Models\MasterPeriode;
use App\Models\Subject;
use App\Services\BankSoalService;
use App\Services\SoalAIService;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use App\Services\StatistikSoalService;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/**
 * Bank soal (Fase 16). Guru menyusun soal untuk mapel yang diampunya (manual, draf AI, atau impor paket lama);
 * soal dipakai setelah disetujui kepala sekolah. Guru melihat soalnya sendiri dan semua soal yang sudah
 * disetujui untuk mapel yang diampunya; admin & kepala sekolah melihat semuanya.
 */
class BankSoalController extends Controller
{
    private const RELASI = [
        'mapel:id_mapel,nama_mapel', 'kelas:id_kelas,nama_kelas', 'materi:id_materi,nama_materi',
        'indikator:id_indikator,deskripsi,urutan', 'pembuat:id,name', 'penyetuju:id,name',
        'video:id_video,judul,file_url,poster_url,durasi_detik,status',
    ];
    private const MAKS_DRAF = 10;
    private const GAMBAR_MIME = ['image/png' => 'png', 'image/jpeg' => 'jpg', 'image/webp' => 'webp'];
    private const BERKAS_IMPOR = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp'];

    public function index(Request $request)
    {
        $request->validate([
            'status' => ['nullable', Rule::in(BankSoal::STATUS)],
            'bentuk' => ['nullable', Rule::in(BankSoal::BENTUK)],
            'per_halaman' => 'nullable|integer|min:5|max:100',
        ]);
        $query = $this->terjangkau($request)->with(self::RELASI);
        foreach (['id_mapel', 'id_kelas', 'id_materi', 'id_indikator', 'status', 'bentuk', 'level_kognitif'] as $k) {
            if ($request->filled($k)) $query->where($k, $request->$k);
        }
        if ($request->boolean('milik')) $query->where('dibuat_oleh', $request->user()->id);
        if ($request->filled('cari')) {
            $q = '%' . mb_strtolower($request->cari) . '%';
            $query->where(fn($w) => $w->whereRaw('LOWER(pertanyaan) LIKE ?', [$q])->orWhereHas('indikator', fn($i) => $i->whereRaw('LOWER(deskripsi) LIKE ?', [$q])));
        }

        $hasil = $query->orderByRaw("CASE status WHEN 'DIAJUKAN' THEN 0 WHEN 'REVISI' THEN 1 WHEN 'DRAF' THEN 2 ELSE 3 END")
            ->orderByDesc('updated_at')->paginate($request->integer('per_halaman', 25));

        // Hasil analisis butir dari paket yang pernah memakai soal ini
        $stat = StatistikSoalService::untukSoal(collect($hasil->items())->pluck('id_soal')->all());
        foreach ($hasil->items() as $soal) $soal->setAttribute('statistik', $stat[$soal->id_soal] ?? null);

        $ringkas = $this->terjangkau($request)->selectRaw('status, count(*) as jumlah')->groupBy('status')->pluck('jumlah', 'status');
        return response()->json(['data' => $hasil->items(), 'meta' => [
            'halaman' => $hasil->currentPage(), 'jumlah_halaman' => $hasil->lastPage(), 'total' => $hasil->total(), 'per_status' => $ringkas,
        ]]);
    }

    /** Pilihan untuk formulir: mapel (guru: yang diampu), kelas, materi + TP, dan konstanta. */
    public function referensi(Request $request)
    {
        $user = $request->user();
        $mapel = Subject::when(!$user->isPengelola(), fn($q) => $q->whereIn('id_mapel', $user->mapelDiampu()))
            ->orderBy('nama_mapel')->get(['id_mapel', 'nama_mapel']);
        $materi = MasterMateri::with(['indikator' => fn($q) => $q->where('aktif', true)->orderBy('urutan')->select('id_indikator', 'id_materi', 'deskripsi', 'urutan')])
            ->whereIn('id_mapel', $mapel->pluck('id_mapel'))
            ->orderBy('nama_materi')
            ->get(['id_materi', 'id_mapel', 'id_kelas', 'id_periode', 'nama_materi', 'mat_S', 'mat_T', 'mat_N', 'mat_K', 'mat_M']);

        return response()->json([
            'mapel' => $mapel,
            'kelas' => Classes::orderBy('nama_kelas')->get(['id_kelas', 'nama_kelas']),
            'materi' => $materi,
            'bentuk' => BankSoal::BENTUK,
            'level' => BankSoal::LEVEL,
            'kesulitan' => BankSoal::KESULITAN,
            'ai_modes' => SoalAIService::MODES,
            'ai_modes_berkas' => SoalAIService::MODES_BERKAS,
            'ai_modes_gambar' => SoalAIService::MODES_GAMBAR,
            'model_gambar' => SoalAIService::MODEL_GAMBAR,
            'boleh_setujui' => $user->isKepsek(),
            // Untuk paket soal: periode, jenis penilaian (saat dikirim ke Input Nilai)
            'periode' => MasterPeriode::orderByDesc('tahun_ajaran')->orderBy('semester')->get(['id_periode', 'tahun_ajaran', 'semester', 'status_aktif']),
            'jenis' => MasterMBK::orderBy('kategori_penilaian')->get(['id_jenis', 'kategori_penilaian', 'keterangan', 'jenis_asesmen']),
        ]);
    }

    public function show(Request $request, string $id)
    {
        return response()->json(['data' => $this->terjangkau($request)->with(self::RELASI)->findOrFail($id)]);
    }

    public function store(Request $request)
    {
        $data = $this->validasi($request);
        $soal = BankSoal::create($data + [
            'id_soal' => 'SOAL-' . Str::uuid(), 'status' => 'DRAF', 'sumber' => 'MANUAL', 'dibuat_oleh' => $request->user()->id,
        ]);
        return response()->json(['success' => true, 'message' => 'Soal disimpan sebagai draf.', 'data' => $soal->load(self::RELASI)], 201);
    }

    public function update(Request $request, string $id)
    {
        $soal = BankSoal::findOrFail($id);
        $this->cekPengubah($request, $soal);
        $user = $request->user();
        if ($soal->status === 'DIAJUKAN' && !$user->isKepsek()) {
            return response()->json(['message' => 'Soal sedang menunggu persetujuan. Tarik kembali dulu bila ingin mengubahnya.'], 422);
        }

        $data = $this->validasi($request);
        // Soal yang sudah disetujui lalu diubah guru harus disetujui ulang; kepala sekolah boleh langsung memperbaiki
        if ($soal->status === 'DISETUJUI') {
            $data['versi'] = $soal->versi + 1;
            if (!$user->isKepsek()) $data += ['status' => 'DRAF', 'disetujui_oleh' => null, 'disetujui_pada' => null];
        }
        $lamaGambar = $soal->gambar_url;
        $soal->update($data);
        if ($lamaGambar && $lamaGambar !== $soal->gambar_url) $this->hapusGambar($lamaGambar);

        $pesan = ($data['status'] ?? null) === 'DRAF' ? 'Soal diubah dan kembali menjadi draf; ajukan lagi untuk disetujui.' : 'Soal diperbarui.';
        return response()->json(['success' => true, 'message' => $pesan, 'data' => $soal->fresh(self::RELASI)]);
    }

    public function destroy(Request $request, string $id)
    {
        $soal = BankSoal::findOrFail($id);
        $this->cekPengubah($request, $soal);
        if ($soal->status === 'DISETUJUI' && !$request->user()->isPengelola()) {
            return response()->json(['message' => 'Soal yang sudah disetujui hanya bisa dihapus admin atau kepala sekolah.'], 422);
        }
        $soal->delete();
        if ($soal->gambar_url) $this->hapusGambar($soal->gambar_url);
        return response()->json(['success' => true, 'message' => 'Soal dihapus.']);
    }

    /** Ajukan satu atau beberapa soal (DRAF/REVISI milik guru ini) ke kepala sekolah. */
    public function ajukan(Request $request)
    {
        $request->validate(['id_soal' => 'required|array|min:1|max:200', 'id_soal.*' => 'string']);
        $soal = BankSoal::whereIn('id_soal', $request->id_soal)->whereIn('status', ['DRAF', 'REVISI'])->get();
        foreach ($soal as $s) $this->cekPengubah($request, $s);
        BankSoal::whereIn('id_soal', $soal->pluck('id_soal'))->update(['status' => 'DIAJUKAN']);
        return response()->json(['success' => true, 'message' => "{$soal->count()} soal diajukan ke kepala sekolah.", 'jumlah' => $soal->count()]);
    }

    /** Tarik kembali soal yang sedang diajukan agar bisa diubah. */
    public function tarik(Request $request, string $id)
    {
        $soal = BankSoal::where('status', 'DIAJUKAN')->findOrFail($id);
        $this->cekPengubah($request, $soal);
        $soal->update(['status' => 'DRAF']);
        return response()->json(['success' => true, 'message' => 'Pengajuan ditarik; soal kembali menjadi draf.']);
    }

    /** Kepala sekolah menyetujui satu atau beberapa soal yang diajukan. */
    public function setujui(Request $request)
    {
        $this->cekKepsek($request);
        $request->validate(['id_soal' => 'required|array|min:1|max:200', 'id_soal.*' => 'string']);
        $jumlah = BankSoal::whereIn('id_soal', $request->id_soal)->where('status', 'DIAJUKAN')->update([
            'status' => 'DISETUJUI', 'catatan_revisi' => null, 'disetujui_oleh' => $request->user()->id, 'disetujui_pada' => now(),
        ]);
        return response()->json(['success' => true, 'message' => "{$jumlah} soal disetujui.", 'jumlah' => $jumlah]);
    }

    /** Kepala sekolah mengembalikan soal ke guru dengan catatan perbaikan. */
    public function revisi(Request $request)
    {
        $this->cekKepsek($request);
        $request->validate(['id_soal' => 'required|array|min:1|max:200', 'id_soal.*' => 'string', 'catatan' => 'required|string|max:2000'], [
            'catatan.required' => 'Tulis catatan perbaikan untuk guru.',
        ]);
        $jumlah = BankSoal::whereIn('id_soal', $request->id_soal)->where('status', 'DIAJUKAN')
            ->update(['status' => 'REVISI', 'catatan_revisi' => $request->catatan]);
        return response()->json(['success' => true, 'message' => "{$jumlah} soal dikembalikan untuk direvisi.", 'jumlah' => $jumlah]);
    }

    /**
     * Draf soal oleh AI, untuk satu baris kisi-kisi atau satu TP. Hasilnya langsung tersimpan sebagai DRAF
     * (sumber AI) agar guru bisa memeriksa dan mengedit sebelum mengajukan.
     */
    public function drafAI(Request $request, SoalAIService $ai)
    {
        $request->validate([
            'id_kisi_baris' => 'nullable|exists:kisi_kisi_baris,id',
            'id_mapel' => 'required_without:id_kisi_baris|nullable|exists:subjects,id_mapel',
            'id_kelas' => 'nullable|exists:classes,id_kelas',
            'id_materi' => 'nullable|exists:master_materi,id_materi',
            'id_indikator' => 'nullable|exists:master_indikator,id_indikator',
            'bentuk' => ['required_without:id_kisi_baris', 'nullable', Rule::in(BankSoal::BENTUK)],
            'level_kognitif' => ['nullable', Rule::in(BankSoal::LEVEL)],
            'tingkat_kesulitan' => ['nullable', Rule::in(BankSoal::KESULITAN)],
            'dimensi' => ['nullable', Rule::in(BankSoal::DIMENSI)],
            'jumlah' => 'nullable|integer|min:1|max:' . self::MAKS_DRAF,
            'catatan' => 'nullable|string|max:1000',
            'gambar' => 'nullable|boolean',
            'ai_mode' => ['required', Rule::in(SoalAIService::MODES)],
        ]);

        $baris = $request->id_kisi_baris ? KisiKisiBaris::with('kisi')->find($request->id_kisi_baris) : null;
        $p = [
            'id_mapel' => $baris?->kisi->id_mapel ?? $request->id_mapel,
            'id_kelas' => $request->id_kelas ?? $baris?->kisi->id_kelas,
            'id_materi' => $request->id_materi ?? $baris?->id_materi,
            'id_indikator' => $request->id_indikator ?? $baris?->id_indikator,
            'bentuk' => $request->bentuk ?? $baris?->bentuk,
            'level_kognitif' => $request->level_kognitif ?? $baris?->level_kognitif ?? 'C2',
            'tingkat_kesulitan' => $request->tingkat_kesulitan ?? $baris?->tingkat_kesulitan ?? 'SEDANG',
            'dimensi' => $request->dimensi ?? $baris?->dimensi,
            'jumlah' => $request->integer('jumlah', $baris?->jumlah ?? 3),
        ];
        $this->cekMapel($request, $p['id_mapel']);
        $p['jumlah'] = min(max($p['jumlah'], 1), self::MAKS_DRAF);

        $indikator = $p['id_indikator'] ? MasterIndikator::find($p['id_indikator']) : null;
        $materi = MasterMateri::find($p['id_materi'] ?? $indikator?->id_materi);
        $p['id_materi'] = $materi?->id_materi;

        $konteks = [
            'mapel' => Subject::find($p['id_mapel'])?->nama_mapel,
            'kelas' => $p['id_kelas'] ? Classes::find($p['id_kelas'])?->nama_kelas : null,
            'materi' => $materi?->nama_materi,
            'deskripsi_kompetensi' => $materi?->deskripsi_kompetensi,
            'tp' => $indikator?->deskripsi,
            'bentuk' => $p['bentuk'],
            'level_kognitif' => $p['level_kognitif'],
            'tingkat_kesulitan' => $p['tingkat_kesulitan'],
            'dimensi_utama' => $p['dimensi'],
            'jumlah' => $p['jumlah'],
            'catatan_guru' => $request->catatan,
            'gambar' => $request->boolean('gambar') || $p['bentuk'] === 'LENGKAPI_GAMBAR',
        ];
        // AI belajar dari sekolah: contoh soal disetujui (yang teruji baik didahulukan), soal bermasalah menurut
        // analisis butir, dan capaian siswa pada TP/materi ini
        $belajar = StatistikSoalService::bahanBelajar($p['bentuk'], $p['id_indikator'], $p['id_materi']);
        if ($belajar['capaian']) $konteks['capaian_siswa_sekolah'] = $belajar['capaian'];

        $sumber = app(\App\Services\PustakaDokumenService::class)->pasang($ai, implode(' ', array_filter(['soal', $konteks['mapel'], $konteks['materi'], $konteks['tp']])), $p['id_mapel']);
        $mentah = $ai->drafSoal($konteks, $belajar['contoh'], $request->ai_mode, $belajar['hindari']);
        if ($mentah === null) return response()->json(['message' => $ai->galat()], 422);

        $tetap = $p + ['id_kisi_baris' => $baris?->id, 'sumber' => 'AI', 'ai_mode' => $request->ai_mode];
        [$tersimpan, $gagal] = $this->simpanMentah($request, array_slice($mentah, 0, $p['jumlah']), $tetap, $materi);
        return response()->json([
            'success' => true,
            'message' => count($tersimpan) . ' draf soal dibuat oleh AI' . ($gagal ? "; {$gagal} dilewati karena tidak lengkap" : '') . '. Periksa dan edit sebelum mengajukan.'
                . self::catatanBelajar($belajar) . \App\Services\PustakaDokumenService::catatanSumber($sumber),
            'data' => $tersimpan,
            'rujukan' => $sumber,
            'belajar' => ['contoh' => count($belajar['contoh']), 'teruji' => $belajar['teruji'], 'hindari' => count($belajar['hindari']), 'capaian' => $belajar['capaian']],
        ]);
    }

    private static function catatanBelajar(array $b): string
    {
        $bagian = array_filter([
            $b['contoh'] ? count($b['contoh']) . ' contoh soal sekolah' . ($b['teruji'] ? " ({$b['teruji']} teruji baik)" : '') : null,
            $b['hindari'] ? count($b['hindari']) . ' catatan soal bermasalah' : null,
            $b['capaian'] ? 'capaian siswa ' . round($b['capaian']['proporsi_benar'] * 100) . '% pada TP ini' : null,
        ]);
        return $bagian ? ' AI memakai ' . implode(', ', $bagian) . ' dari analisis butir.' : '';
    }

    /**
     * Gambar soal dari AI: ilustrasi (Gemini, OpenKey, OpenRouter) disimpan seperti gambar unggahan,
     * atau diagram SVG (semua penyedia). Hasilnya dipasang ke soal lewat simpan/ubah.
     */
    public function gambarAI(Request $request, SoalAIService $ai)
    {
        $request->validate([
            'ai_mode' => ['required', Rule::in(SoalAIService::MODES)],
            'jenis' => ['required', Rule::in(['ILUSTRASI', 'DIAGRAM'])],
            'deskripsi' => 'required|string|min:5|max:1500',
            'model' => ['nullable', 'string', 'max:100', 'regex:#^[A-Za-z0-9._:/@-]+$#'],
        ]);
        if ($request->jenis === 'DIAGRAM') {
            $svg = $ai->buatDiagram($request->ai_mode, $request->deskripsi);
            $svg = $svg ? BankSoalService::sanitasiSvg($svg) : null;
            if (!$svg) return response()->json(['message' => $ai->galat() ?? 'Diagram dari AI tidak bisa dipakai. Coba lagi.'], 422);
            return response()->json(['success' => true, 'gambar_svg' => $svg]);
        }

        $hasil = $ai->buatGambar($request->ai_mode, $request->deskripsi, $request->model);
        if (!$hasil) return response()->json(['message' => $ai->galat()], 422);
        if (isset($hasil['svg'])) {
            $svg = BankSoalService::sanitasiSvg($hasil['svg']);
            if (!$svg) return response()->json(['message' => "Model {$hasil['model']} tidak membuat gambar ilustrasi dan kode SVG-nya tidak bisa dipakai. Pilih jenis Diagram (SVG) atau model gambar lain."], 422);
            return response()->json(['success' => true, 'gambar_svg' => $svg, 'model' => $hasil['model'],
                'catatan' => "Model {$hasil['model']} hanya membuat teks, jadi hasilnya berupa diagram SVG, bukan ilustrasi berwarna."]);
        }
        $file = 'soal/soal_ai_' . Str::random(16) . '.' . self::GAMBAR_MIME[$hasil['mime']];
        Storage::disk('public')->put($file, $hasil['data']);
        return response()->json(['success' => true, 'url' => '/storage/' . $file, 'model' => $hasil['model']]);
    }

    /** Impor paket soal lama (teks tempel, Word, PDF, atau foto) menjadi draf soal. */
    public function impor(Request $request, SoalAIService $ai)
    {
        $request->validate([
            'id_mapel' => 'required|exists:subjects,id_mapel',
            'id_kelas' => 'nullable|exists:classes,id_kelas',
            'teks' => 'nullable|string|max:60000',
            'berkas_base64' => 'nullable|string',
            'berkas_nama' => 'nullable|string|max:255',
            'ai_mode' => ['required', Rule::in(SoalAIService::MODES)],
        ]);
        $this->cekMapel($request, $request->id_mapel);
        [$teks, $berkas] = $this->bacaBerkasImpor($request);
        if (!$teks && !$berkas) return response()->json(['message' => 'Tempel teks soal atau pilih berkas Word, PDF, atau foto.'], 422);

        $materi = MasterMateri::with(['indikator' => fn($q) => $q->where('aktif', true)])
            ->where('id_mapel', $request->id_mapel)
            ->when($request->id_kelas, fn($q) => $q->where(fn($w) => $w->where('id_kelas', $request->id_kelas)->orWhereNull('id_kelas')))
            ->get();
        $tp = $materi->flatMap(fn($m) => $m->indikator->map(fn($i) => ['id_indikator' => $i->id_indikator, 'materi' => $m->nama_materi, 'deskripsi' => $i->deskripsi]))->values()->all();

        $mentah = $ai->imporSoal($teks, $berkas, $tp, Subject::find($request->id_mapel)->nama_mapel, $request->ai_mode);
        if ($mentah === null) return response()->json(['message' => $ai->galat()], 422);

        $idTp = array_column($tp, 'id_indikator');
        $tetap = ['id_mapel' => $request->id_mapel, 'id_kelas' => $request->id_kelas, 'sumber' => 'IMPOR', 'ai_mode' => $request->ai_mode];
        [$tersimpan, $gagal] = $this->simpanMentah($request, array_slice($mentah, 0, 100), $tetap, null, $idTp);
        return response()->json([
            'success' => true,
            'message' => count($tersimpan) . ' soal diimpor sebagai draf' . ($gagal ? "; {$gagal} dilewati karena tidak lengkap" : '') . '. Periksa TP, kunci, dan gambarnya sebelum mengajukan.',
            'data' => $tersimpan,
        ]);
    }

    /** Unggah gambar soal (PNG/JPG/WEBP, maks. 2MB); url dipasang ke soal lewat simpan/ubah. */
    public function unggahGambar(Request $request)
    {
        $request->validate(['gambar_base64' => 'required|string']);
        $data = base64_decode(preg_replace('/^data:[^;]*;base64,/', '', $request->gambar_base64), true);
        if (!$data) throw ValidationException::withMessages(['gambar_base64' => 'Gambar tidak valid.']);
        if (strlen($data) > 2 * 1024 * 1024) throw ValidationException::withMessages(['gambar_base64' => 'Ukuran gambar maksimal 2MB.']);
        $mime = (new \finfo(FILEINFO_MIME_TYPE))->buffer($data);
        if (!isset(self::GAMBAR_MIME[$mime])) throw ValidationException::withMessages(['gambar_base64' => 'Format gambar harus PNG, JPG, atau WEBP.']);

        $file = 'soal/soal_' . Str::random(16) . '.' . self::GAMBAR_MIME[$mime];
        Storage::disk('public')->put($file, $data);
        return response()->json(['success' => true, 'url' => '/storage/' . $file]);
    }

    // ===== bantu =====

    private function terjangkau(Request $request): Builder
    {
        $user = $request->user();
        return BankSoal::query()->when(!$user->isPengelola(), fn($q) => $q->where(fn($w) => $w->where('dibuat_oleh', $user->id)
            ->orWhere(fn($x) => $x->where('status', 'DISETUJUI')->whereIn('id_mapel', $user->mapelDiampu()))));
    }

    private function validasi(Request $request): array
    {
        $request->validate([
            'id_mapel' => 'required|exists:subjects,id_mapel',
            'id_kelas' => 'nullable|exists:classes,id_kelas',
            'id_materi' => 'nullable|exists:master_materi,id_materi',
            'id_indikator' => 'nullable|exists:master_indikator,id_indikator',
            'id_kisi_baris' => 'nullable|exists:kisi_kisi_baris,id',
            'bentuk' => ['required', Rule::in(BankSoal::BENTUK)],
            'level_kognitif' => ['required', Rule::in(BankSoal::LEVEL)],
            'tingkat_kesulitan' => ['required', Rule::in(BankSoal::KESULITAN)],
            'dim_S' => 'nullable|numeric|between:0,1', 'dim_T' => 'nullable|numeric|between:0,1', 'dim_N' => 'nullable|numeric|between:0,1',
            'dim_K' => 'nullable|numeric|between:0,1', 'dim_M' => 'nullable|numeric|between:0,1',
            'pertanyaan' => 'required|string|max:5000',
            'gambar_svg' => 'nullable|string|max:60000',
            'gambar_url' => ['nullable', 'string', 'max:500', 'regex:#^/storage/soal/#'],
            'id_video' => 'nullable|exists:video_belajar,id_video',
            'isi' => 'nullable|array',
            'kunci' => 'nullable|array',
            'rubrik' => 'nullable|string|max:5000',
            'pembahasan' => 'nullable|string|max:5000',
            'skor_maks' => 'nullable|integer|min:1|max:100',
        ], ['pertanyaan.required' => 'Tulis pertanyaannya.']);
        $this->cekMapel($request, $request->id_mapel);

        [$isi, $kunci] = BankSoalService::normalisasi($request->bentuk, $request->isi, $request->kunci);
        $data = $request->only(['id_mapel', 'id_kelas', 'id_materi', 'id_indikator', 'id_kisi_baris', 'bentuk', 'level_kognitif', 'tingkat_kesulitan', 'pertanyaan', 'rubrik', 'pembahasan', 'gambar_url', 'id_video']);
        foreach (BankSoal::DIMENSI as $d) $data["dim_{$d}"] = round((float) $request->input("dim_{$d}", 0), 2);
        // TP menentukan materinya
        if ($data['id_indikator'] ?? null) $data['id_materi'] = MasterIndikator::find($data['id_indikator'])->id_materi;
        return $data + [
            'isi' => $isi, 'kunci' => $kunci,
            'gambar_svg' => BankSoalService::sanitasiSvg($request->gambar_svg),
            'skor_maks' => $request->integer('skor_maks') ?: BankSoalService::skorBawaan($request->bentuk, $isi, $kunci),
        ];
    }

    /** Simpan soal mentah dari AI sebagai DRAF; soal yang tidak lengkap dilewati. @return array [tersimpan, jumlah gagal] */
    private function simpanMentah(Request $request, array $mentah, array $tetap, ?MasterMateri $materi, ?array $idTpSah = null): array
    {
        $tersimpan = [];
        $gagal = 0;
        foreach ($mentah as $m) {
            try {
                $bentuk = in_array($m['bentuk'] ?? null, BankSoal::BENTUK, true) ? $m['bentuk'] : ($tetap['bentuk'] ?? null);
                $pertanyaan = trim((string) ($m['pertanyaan'] ?? ''));
                if (!$bentuk || $pertanyaan === '') throw ValidationException::withMessages(['isi' => 'tidak lengkap']);
                [$isi, $kunci] = BankSoalService::normalisasi($bentuk, $m['isi'] ?? [], $m['kunci'] ?? []);

                $data = $tetap;
                if ($idTpSah !== null) {
                    $tp = in_array($m['id_indikator'] ?? null, $idTpSah, true) ? $m['id_indikator'] : null;
                    $data['id_indikator'] = $tp;
                    $data['id_materi'] = $tp ? MasterIndikator::find($tp)->id_materi : null;
                }
                $dimensi = is_array($m['dimensi'] ?? null) ? $m['dimensi'] : [];
                $bawaan = BankSoalService::bobotDimensi($materi ?? MasterMateri::find($data['id_materi'] ?? null), $tetap['dimensi'] ?? null);
                foreach (BankSoal::DIMENSI as $d) {
                    $data["dim_{$d}"] = isset($dimensi[$d]) && is_numeric($dimensi[$d]) ? round(min(max((float) $dimensi[$d], 0), 1), 2) : $bawaan["dim_{$d}"];
                }
                unset($data['dimensi'], $data['jumlah']);

                $tersimpan[] = BankSoal::create($data + [
                    'id_soal' => 'SOAL-' . Str::uuid(),
                    'bentuk' => $bentuk,
                    'level_kognitif' => in_array($m['level_kognitif'] ?? null, BankSoal::LEVEL, true) ? $m['level_kognitif'] : ($tetap['level_kognitif'] ?? 'C2'),
                    'tingkat_kesulitan' => in_array($m['tingkat_kesulitan'] ?? null, BankSoal::KESULITAN, true) ? $m['tingkat_kesulitan'] : ($tetap['tingkat_kesulitan'] ?? 'SEDANG'),
                    'pertanyaan' => mb_substr($pertanyaan, 0, 5000),
                    'gambar_svg' => BankSoalService::sanitasiSvg($m['gambar_svg'] ?? null),
                    'isi' => $isi, 'kunci' => $kunci,
                    'rubrik' => isset($m['rubrik']) ? mb_substr((string) $m['rubrik'], 0, 5000) : null,
                    'pembahasan' => isset($m['pembahasan']) ? mb_substr((string) $m['pembahasan'], 0, 5000) : null,
                    'skor_maks' => BankSoalService::skorBawaan($bentuk, $isi, $kunci),
                    'status' => 'DRAF',
                    'dibuat_oleh' => $request->user()->id,
                ])->load(self::RELASI);
            } catch (ValidationException) {
                $gagal++;
            }
        }
        return [$tersimpan, $gagal];
    }

    /** @return array [teks|null, berkas|null] */
    private function bacaBerkasImpor(Request $request): array
    {
        $teks = trim((string) $request->teks) ?: null;
        if (!$request->filled('berkas_base64')) return [$teks, null];

        $data = base64_decode(preg_replace('/^data:[^;]*;base64,/', '', $request->berkas_base64), true);
        if (!$data) throw ValidationException::withMessages(['berkas_base64' => 'Berkas tidak valid.']);
        if (strlen($data) > 10 * 1024 * 1024) throw ValidationException::withMessages(['berkas_base64' => 'Ukuran berkas maksimal 10MB.']);
        $mime = (new \finfo(FILEINFO_MIME_TYPE))->buffer($data);

        // Word (.docx): ambil teksnya, lalu diproses seperti teks tempel
        if (in_array($mime, ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/zip'], true)) {
            $teksWord = $this->teksDocx($data);
            if (!$teksWord) throw ValidationException::withMessages(['berkas_base64' => 'Isi berkas Word tidak bisa dibaca. Simpan sebagai .docx atau PDF.']);
            return [trim(($teks ? "{$teks}\n\n" : '') . $teksWord), null];
        }
        if (!in_array($mime, self::BERKAS_IMPOR, true)) {
            throw ValidationException::withMessages(['berkas_base64' => 'Format berkas harus Word (.docx), PDF, atau foto (PNG/JPG/WEBP).']);
        }
        return [$teks, ['mime' => $mime, 'data' => base64_encode($data)]];
    }

    private function teksDocx(string $data): ?string
    {
        $tmp = tempnam(sys_get_temp_dir(), 'docx');
        file_put_contents($tmp, $data);
        $zip = new \ZipArchive();
        $xml = false;
        if ($zip->open($tmp) === true) {
            $xml = $zip->getFromName('word/document.xml');
            $zip->close();
        }
        @unlink($tmp);
        if (!$xml) return null;
        $xml = preg_replace(['#</w:p>#', '#<w:tab/>#', '#<w:br/>#'], ["\n", "\t", "\n"], $xml);
        $teks = html_entity_decode(strip_tags($xml), ENT_QUOTES | ENT_XML1, 'UTF-8');
        return trim(preg_replace("/\n{3,}/", "\n\n", $teks)) ?: null;
    }

    private function hapusGambar(string $url): void
    {
        if (!Str::startsWith($url, '/storage/soal/') || BankSoal::where('gambar_url', $url)->exists()) return;
        Storage::disk('public')->delete(Str::after($url, '/storage/'));
    }

    private function cekMapel(Request $request, ?string $idMapel): void
    {
        abort_unless($request->user()->bolehNilaiMapel($idMapel), 403, 'Anda hanya dapat menyusun soal untuk mata pelajaran yang Anda ampu.');
    }

    private function cekPengubah(Request $request, BankSoal $soal): void
    {
        $user = $request->user();
        abort_unless($user->isPengelola() || $soal->dibuat_oleh === $user->id, 403, 'Soal ini milik guru lain.');
    }

    private function cekKepsek(Request $request): void
    {
        abort_unless($request->user()->isKepsek(), 403, 'Persetujuan soal hanya oleh kepala sekolah.');
    }
}

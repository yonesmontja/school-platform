<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\DokumenRujukan;
use App\Models\Notebook;
use App\Models\NotebookCatatan;
use App\Services\RisetDokumenAIService;
use App\Services\SoalAIService;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * Notebook AI Pustaka Dokumen (Fase 23 Tahap B): notebook riset berisi beberapa dokumen (mis. CP + panduan asesmen + buku guru).
 * Notebook bersifat pribadi: hanya pembuatnya yang membuka. Dokumen yang boleh dipakai = dokumen yang boleh ia lihat dan teksnya terbaca.
 * Tanya-jawab lintas dokumen tersimpan sebagai catatan riset; guru juga bisa menulis atau mengubah catatan sendiri.
 * Catatan lalu dipakai sebagai bahan AI lewat Jadikan… (soal, ATP, modul ajar, peta tema).
 */
class NotebookController extends Controller
{
    private function notebook(Request $request, int $id): Notebook
    {
        return Notebook::where('dibuat_oleh', $request->user()->id)->findOrFail($id);
    }

    /** Dokumen yang dipilih harus boleh dilihat akun ini dan sudah terbaca. */
    private function dokumenSah(Request $request, array $id): array
    {
        $u = $request->user();
        $sah = DokumenRujukan::whereIn('id_dokumen', $id)->where('status_teks', 'TERBACA')
            ->when(!$u->isPengelola(), fn($q) => $q->where(fn($w) => $w->where('status', 'AKTIF')->orWhere('diunggah_oleh', $u->id)))
            ->pluck('id_dokumen')->all();
        abort_if(count($sah) !== count(array_unique($id)), 422, 'Ada dokumen yang tidak bisa dipakai: teksnya belum terbaca atau tidak tersedia untuk Anda.');
        return $sah;
    }

    private function muat(Notebook $n): Notebook
    {
        return $n->load(['dokumen' => fn($q) => $q->select('dokumen_rujukan.id_dokumen', 'judul', 'jenis', 'id_mapel', 'fase', 'jumlah_karakter', 'status'),
            'catatan' => fn($q) => $q->latest('id')])->loadCount('catatan');
    }

    public function index(Request $request)
    {
        $data = Notebook::with('dokumen:id_dokumen,judul')->withCount('catatan')->where('dibuat_oleh', $request->user()->id)->latest('updated_at')->get();
        return response()->json(['data' => $data]);
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'judul' => 'required|string|max:200',
            'dokumen' => 'required|array|min:1|max:' . Notebook::MAKS_DOKUMEN,
            'dokumen.*' => 'string|distinct',
        ]);
        $sah = $this->dokumenSah($request, $data['dokumen']);
        $n = Notebook::create(['judul' => trim($data['judul']), 'dibuat_oleh' => $request->user()->id]);
        $n->dokumen()->sync($sah);
        return response()->json(['success' => true, 'message' => 'Notebook dibuat.', 'data' => $this->muat($n)], 201);
    }

    public function show(Request $request, int $id)
    {
        return response()->json(['data' => $this->muat($this->notebook($request, $id))]);
    }

    public function update(Request $request, int $id)
    {
        $n = $this->notebook($request, $id);
        $data = $request->validate([
            'judul' => 'required|string|max:200',
            'dokumen' => 'required|array|min:1|max:' . Notebook::MAKS_DOKUMEN,
            'dokumen.*' => 'string|distinct',
        ]);
        // Dokumen yang sudah ada di notebook tetap boleh dipertahankan walau statusnya berubah
        $lama = $n->dokumen()->pluck('dokumen_rujukan.id_dokumen')->all();
        $baru = array_values(array_diff($data['dokumen'], $lama));
        if ($baru) $this->dokumenSah($request, $baru);
        $n->update(['judul' => trim($data['judul'])]);
        $n->dokumen()->sync($data['dokumen']);
        $n->touch();
        return response()->json(['success' => true, 'message' => 'Notebook disimpan.', 'data' => $this->muat($n)]);
    }

    public function destroy(Request $request, int $id)
    {
        $this->notebook($request, $id)->delete();
        return response()->json(['success' => true, 'message' => 'Notebook dihapus.']);
    }

    /** Tanya ke semua dokumen notebook; jawaban + bagian yang dirujuk tersimpan sebagai catatan riset. */
    public function tanya(Request $request, int $id, RisetDokumenAIService $ai)
    {
        $request->validate(['pertanyaan' => ['required', 'string', 'min:5', 'max:500'], 'ai_mode' => ['required', Rule::in(SoalAIService::MODES)]]);
        $n = $this->notebook($request, $id);
        $dokumen = $n->dokumen()->where('status_teks', 'TERBACA')->get(['dokumen_rujukan.id_dokumen', 'judul']);
        abort_if($dokumen->isEmpty(), 422, 'Notebook ini belum punya dokumen yang teksnya terbaca.');
        $pertanyaan = trim($request->pertanyaan);
        $bagian = RisetDokumenAIService::bagianLintas($dokumen, $pertanyaan);
        abort_if(!$bagian, 422, 'Dokumen notebook belum punya bagian teks yang bisa dicari.');
        @set_time_limit(180);
        $untukAi = array_map(fn($b) => ['no' => $b['no'], 'teks' => "Dokumen: {$b['judul']} (bagian {$b['bagian']})\n{$b['teks']}"], $bagian);
        $hasil = $ai->tanya($n->judul, $pertanyaan, $untukAi, $request->ai_mode, $dokumen->count() > 1);
        if ($hasil === null) return response()->json(['message' => $ai->galat() ?: 'AI belum berhasil. Coba lagi.'], 422);

        $dirujuk = collect($bagian)->whereIn('no', $hasil['rujukan'])->map(fn($b) => ['teks' => mb_substr($b['teks'], 0, 1800)] + $b)->values()->all();
        $c = NotebookCatatan::create([
            'id_notebook' => $n->id_notebook, 'jenis' => 'TANYA', 'judul' => mb_substr($pertanyaan, 0, 300), 'isi' => $hasil['jawaban'],
            'rujukan' => $dirujuk, 'ai_mode' => $request->ai_mode, 'dibuat_oleh' => $request->user()->id,
        ]);
        $n->touch();
        return response()->json(['success' => true, 'data' => $c, 'cukup' => $hasil['cukup']]);
    }

    public function simpanCatatan(Request $request, int $id, ?int $idCatatan = null)
    {
        $n = $this->notebook($request, $id);
        $data = $request->validate(['judul' => 'required|string|max:300', 'isi' => 'required|string|max:20000']);
        if ($idCatatan) {
            $c = $n->catatan()->findOrFail($idCatatan);
            $c->update(['judul' => trim($data['judul']), 'isi' => trim($data['isi'])]);
        } else {
            $c = NotebookCatatan::create(['id_notebook' => $n->id_notebook, 'jenis' => 'MANUAL', 'judul' => trim($data['judul']), 'isi' => trim($data['isi']),
                'dibuat_oleh' => $request->user()->id]);
        }
        $n->touch();
        return response()->json(['success' => true, 'message' => 'Catatan disimpan.', 'data' => $c->fresh()]);
    }

    public function hapusCatatan(Request $request, int $id, int $idCatatan)
    {
        $this->notebook($request, $id)->catatan()->findOrFail($idCatatan)->delete();
        return response()->json(['success' => true, 'message' => 'Catatan dihapus.']);
    }

    /** Semua catatan milik akun ini, untuk pilihan "Bahan dari Notebook" di editor ATP, modul ajar, peta tema. */
    public function semuaCatatan(Request $request)
    {
        $data = NotebookCatatan::with('notebook:id_notebook,judul')
            ->whereHas('notebook', fn($q) => $q->where('dibuat_oleh', $request->user()->id))
            ->latest('id')->limit(100)->get(['id', 'id_notebook', 'jenis', 'judul', 'updated_at']);
        return response()->json(['data' => $data]);
    }
}

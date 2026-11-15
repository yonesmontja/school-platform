<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\DokumenRiset;
use App\Models\DokumenRujukan;
use App\Services\RisetDokumenAIService;
use App\Services\SoalAIService;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * Notebook AI Pustaka Dokumen (Fase 23 Tahap A): panel riset per dokumen.
 * Siapa pun yang boleh melihat dokumen (dokumen AKTIF, atau ajuannya sendiri; pengelola semua) boleh menjalankan riset
 * dan bertanya. Hasil riset dipakai bersama; riwayat tanya-jawab tiap akun hanya terlihat oleh dirinya dan pengelola.
 */
class RisetDokumenController extends Controller
{
    private function dokumen(Request $request, string $id): DokumenRujukan
    {
        $u = $request->user();
        return DokumenRujukan::query()
            ->when(!$u->isPengelola(), fn($q) => $q->where(fn($w) => $w->where('status', 'AKTIF')->orWhere('diunggah_oleh', $u->id)))
            ->findOrFail($id);
    }

    private function siapDibaca(DokumenRujukan $d): void
    {
        abort_unless($d->status_teks === 'TERBACA', 422, 'Teks dokumen belum terbaca, jadi belum bisa diteliti AI.');
    }

    public function index(Request $request, string $id)
    {
        $d = $this->dokumen($request, $id);
        $u = $request->user();
        $riset = DokumenRiset::with('pembuat:id,name')->where('id_dokumen', $d->id_dokumen)->whereIn('jenis', DokumenRiset::JENIS)
            ->latest('id')->get()->unique('jenis')->keyBy('jenis');
        $tanya = DokumenRiset::with('pembuat:id,name')->where('id_dokumen', $d->id_dokumen)->where('jenis', 'TANYA')
            ->when(!$u->isPengelola(), fn($q) => $q->where('dibuat_oleh', $u->id))->latest('id')->limit(20)->get();
        $segmen = RisetDokumenAIService::segmen($d);
        return response()->json(['data' => [
            'riset' => $riset,
            'tanya' => $tanya,
            'cakupan' => ['dibaca' => $segmen['karakter'], 'total' => (int) $d->jumlah_karakter, 'segmen' => count($segmen['segmen']), 'lengkap' => $segmen['lengkap'], 'versi' => $d->versi],
        ]]);
    }

    public function riset(Request $request, string $id, RisetDokumenAIService $ai)
    {
        $request->validate(['jenis' => ['required', Rule::in(DokumenRiset::JENIS)], 'ai_mode' => ['required', Rule::in(SoalAIService::MODES)]]);
        $d = $this->dokumen($request, $id);
        $this->siapDibaca($d);
        @set_time_limit(300);
        $segmen = RisetDokumenAIService::segmen($d);
        $hasil = $ai->riset($request->jenis, $d->judul, $d->jenis, $segmen['segmen'], $request->ai_mode);
        if ($hasil === null) return response()->json(['message' => $ai->galat() ?: 'AI belum berhasil. Coba lagi.'], 422);

        $riset = DokumenRiset::create([
            'id_dokumen' => $d->id_dokumen, 'jenis' => $request->jenis, 'hasil' => $hasil, 'karakter_dibaca' => $segmen['karakter'],
            'versi_dokumen' => $d->versi, 'ai_mode' => $request->ai_mode, 'dibuat_oleh' => $request->user()->id,
        ]);
        // Hanya hasil terbaru per jenis yang disimpan
        DokumenRiset::where('id_dokumen', $d->id_dokumen)->where('jenis', $request->jenis)->where('id', '<', $riset->id)->delete();
        $terpotong = !$segmen['lengkap'];
        return response()->json([
            'success' => true,
            'message' => 'Hasil riset disimpan.' . ($terpotong ? ' Dokumen sangat panjang: AI membaca ' . number_format($segmen['karakter'], 0, ',', '.') . ' karakter pertama.' : ''),
            'data' => $riset->load('pembuat:id,name'),
        ]);
    }

    public function tanya(Request $request, string $id, RisetDokumenAIService $ai)
    {
        $request->validate(['pertanyaan' => ['required', 'string', 'min:5', 'max:500'], 'ai_mode' => ['required', Rule::in(SoalAIService::MODES)]]);
        $d = $this->dokumen($request, $id);
        $this->siapDibaca($d);
        $pertanyaan = trim($request->pertanyaan);
        $bagian = RisetDokumenAIService::bagianRelevan($d->id_dokumen, $pertanyaan);
        abort_if(!$bagian, 422, 'Dokumen ini belum punya bagian teks yang bisa dicari.');
        $hasil = $ai->tanya($d->judul, $pertanyaan, $bagian, $request->ai_mode);
        if ($hasil === null) return response()->json(['message' => $ai->galat() ?: 'AI belum berhasil. Coba lagi.'], 422);

        $dirujuk = collect($bagian)->whereIn('no', $hasil['rujukan'])->map(fn($b) => ['no' => $b['no'], 'teks' => mb_substr($b['teks'], 0, 1800)])->values()->all();
        $riset = DokumenRiset::create([
            'id_dokumen' => $d->id_dokumen, 'jenis' => 'TANYA', 'pertanyaan' => $pertanyaan,
            'hasil' => ['jawaban' => $hasil['jawaban'], 'cukup' => $hasil['cukup']], 'rujukan' => $dirujuk,
            'karakter_dibaca' => array_sum(array_map(fn($b) => mb_strlen($b['teks']), $bagian)),
            'versi_dokumen' => $d->versi, 'ai_mode' => $request->ai_mode, 'dibuat_oleh' => $request->user()->id,
        ]);
        return response()->json(['success' => true, 'data' => $riset->load('pembuat:id,name')]);
    }

    public function hapus(Request $request, string $id, int $idRiset)
    {
        $d = $this->dokumen($request, $id);
        $riset = DokumenRiset::where('id_dokumen', $d->id_dokumen)->findOrFail($idRiset);
        abort_unless($request->user()->isPengelola() || $riset->dibuat_oleh === $request->user()->id, 403, 'Hanya pembuatnya atau pengelola yang dapat menghapus.');
        $riset->delete();
        return response()->json(['success' => true, 'message' => 'Dihapus.']);
    }
}

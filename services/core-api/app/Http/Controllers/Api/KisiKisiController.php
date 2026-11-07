<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\BankSoal;
use App\Models\KisiKisi;
use App\Models\MasterIndikator;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

/**
 * Kisi-kisi soal: rencana butir per TP (bentuk, level kognitif, tingkat kesulitan, dimensi STNKM, jumlah).
 * Setiap baris menjadi dasar draf soal AI; jumlah soal yang sudah dibuat per baris ikut ditampilkan.
 */
class KisiKisiController extends Controller
{
    public function index(Request $request)
    {
        $user = $request->user();
        $data = KisiKisi::with(['mapel:id_mapel,nama_mapel', 'kelas:id_kelas,nama_kelas', 'pembuat:id,name'])
            ->withSum('baris as jumlah_soal_rencana', 'jumlah')
            ->when(!$user->isPengelola(), fn($q) => $q->where('dibuat_oleh', $user->id))
            ->when($request->filled('id_mapel'), fn($q) => $q->where('id_mapel', $request->id_mapel))
            ->orderByDesc('updated_at')->get();
        return response()->json(['data' => $data]);
    }

    public function show(Request $request, string $id)
    {
        $kisi = KisiKisi::with([
            'mapel:id_mapel,nama_mapel', 'kelas:id_kelas,nama_kelas',
            'baris.materi:id_materi,nama_materi', 'baris.indikator:id_indikator,deskripsi',
        ])->findOrFail($id);
        $this->cekLihat($request, $kisi);

        // Soal per baris beserta statusnya, agar guru tahu baris mana yang sudah terisi
        $soal = BankSoal::whereIn('id_kisi_baris', $kisi->baris->pluck('id'))
            ->get(['id_soal', 'id_kisi_baris', 'status', 'bentuk', 'pertanyaan'])->groupBy('id_kisi_baris');
        $kisi->baris->each(fn($b) => $b->setAttribute('soal', $soal->get($b->id, collect())->values()));
        return response()->json(['data' => $kisi]);
    }

    public function store(Request $request)
    {
        $data = $this->validasi($request);
        $kisi = DB::transaction(function () use ($request, $data) {
            $kisi = KisiKisi::create($data['kisi'] + ['id_kisi' => 'KISI-' . Str::uuid(), 'dibuat_oleh' => $request->user()->id]);
            $this->simpanBaris($kisi, $data['baris']);
            return $kisi;
        });
        return response()->json(['success' => true, 'message' => 'Kisi-kisi disimpan.', 'data' => $kisi->load('baris')], 201);
    }

    public function update(Request $request, string $id)
    {
        $kisi = KisiKisi::findOrFail($id);
        $this->cekUbah($request, $kisi);
        $data = $this->validasi($request);
        DB::transaction(function () use ($kisi, $data) {
            $kisi->update($data['kisi']);
            $this->simpanBaris($kisi, $data['baris']);
        });
        return response()->json(['success' => true, 'message' => 'Kisi-kisi diperbarui.', 'data' => $kisi->fresh('baris')]);
    }

    public function destroy(Request $request, string $id)
    {
        $kisi = KisiKisi::findOrFail($id);
        $this->cekUbah($request, $kisi);
        $kisi->delete(); // soal yang sudah dibuat tetap ada di bank soal (tautan barisnya dilepas)
        return response()->json(['success' => true, 'message' => 'Kisi-kisi dihapus. Soal yang sudah dibuat tetap ada di bank soal.']);
    }

    private function validasi(Request $request): array
    {
        $request->validate([
            'judul' => 'required|string|max:200',
            'id_mapel' => 'required|exists:subjects,id_mapel',
            'id_kelas' => 'nullable|exists:classes,id_kelas',
            'id_periode' => 'nullable|exists:master_periode,id_periode',
            'catatan' => 'nullable|string|max:2000',
            'baris' => 'required|array|min:1|max:100',
            'baris.*.id' => 'nullable|integer',
            'baris.*.id_materi' => 'nullable|exists:master_materi,id_materi',
            'baris.*.id_indikator' => 'nullable|exists:master_indikator,id_indikator',
            'baris.*.bentuk' => ['required', Rule::in(BankSoal::BENTUK)],
            'baris.*.level_kognitif' => ['required', Rule::in(BankSoal::LEVEL)],
            'baris.*.tingkat_kesulitan' => ['required', Rule::in(BankSoal::KESULITAN)],
            'baris.*.dimensi' => ['nullable', Rule::in(BankSoal::DIMENSI)],
            'baris.*.jumlah' => 'required|integer|min:1|max:50',
        ], ['judul.required' => 'Beri judul kisi-kisi.', 'baris.required' => 'Tambahkan minimal satu baris kisi-kisi.']);
        abort_unless($request->user()->bolehNilaiMapel($request->id_mapel), 403, 'Anda hanya dapat menyusun kisi-kisi untuk mata pelajaran yang Anda ampu.');

        return [
            'kisi' => $request->only(['judul', 'id_mapel', 'id_kelas', 'id_periode', 'catatan']),
            'baris' => $request->baris,
        ];
    }

    /** Baris lama yang masih dikirim diperbarui, yang tidak dikirim dihapus, sisanya baris baru. */
    private function simpanBaris(KisiKisi $kisi, array $baris): void
    {
        $tetap = [];
        foreach (array_values($baris) as $i => $b) {
            $isi = [
                'urutan' => $i + 1,
                'id_materi' => $b['id_materi'] ?? null,
                'id_indikator' => $b['id_indikator'] ?? null,
                'bentuk' => $b['bentuk'],
                'level_kognitif' => $b['level_kognitif'],
                'tingkat_kesulitan' => $b['tingkat_kesulitan'],
                'dimensi' => $b['dimensi'] ?? null,
                'jumlah' => (int) $b['jumlah'],
            ];
            if ($isi['id_indikator']) $isi['id_materi'] = MasterIndikator::find($isi['id_indikator'])->id_materi;
            $lama = !empty($b['id']) ? $kisi->baris()->whereKey($b['id'])->first() : null;
            $tetap[] = $lama ? tap($lama)->update($isi)->id : $kisi->baris()->create($isi)->id;
        }
        $kisi->baris()->whereNotIn('id', $tetap)->delete();
    }

    private function cekLihat(Request $request, KisiKisi $kisi): void
    {
        $user = $request->user();
        abort_unless($user->isPengelola() || $kisi->dibuat_oleh === $user->id, 403, 'Kisi-kisi ini milik guru lain.');
    }

    private function cekUbah(Request $request, KisiKisi $kisi): void
    {
        $this->cekLihat($request, $kisi);
    }
}

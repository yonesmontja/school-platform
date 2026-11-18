<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\BankStimulus;
use App\Support\HtmlAman;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/**
 * Stimulus AKM bersama (CBT Tahap B): bacaan, tabel, atau grafik untuk beberapa soal sekaligus. Guru melihat stimulus
 * mapel yang diampunya; mengubah dan menghapus hanya pembuatnya (atau pengelola). Stimulus yang masih dipakai soal tidak bisa dihapus.
 */
class StimulusController extends Controller
{
    private const RELASI = ['mapel:id_mapel,nama_mapel,id_guru', 'mapel.guru:id_guru,nama_guru', 'kelas:id_kelas,nama_kelas', 'pembuat:id,name,id_guru'];

    public function index(Request $request)
    {
        $request->validate(['jenis' => ['nullable', Rule::in(array_keys(BankStimulus::JENIS))]]);
        $user = $request->user();
        $q = BankStimulus::with(self::RELASI)->withCount('soal')
            ->when(!$user->isPengelola(), fn($w) => $w->whereIn('id_mapel', $user->mapelDiampu()));
        foreach (['id_mapel', 'id_kelas', 'jenis'] as $k) if ($request->filled($k)) $q->where($k, $request->$k);
        if ($request->filled('cari')) {
            $c = '%' . mb_strtolower($request->cari) . '%';
            $q->where(fn($w) => $w->whereRaw('LOWER(judul) LIKE ?', [$c])->orWhereRaw('LOWER(konten) LIKE ?', [$c]));
        }
        return response()->json([
            'data' => $q->orderByDesc('updated_at')->limit(200)->get(),
            'jenis' => BankStimulus::JENIS,
            'konteks' => BankStimulus::KONTEKS,
        ]);
    }

    public function show(Request $request, string $id)
    {
        $s = BankStimulus::with([...self::RELASI, 'soal:id_soal,id_stimulus,bentuk,level_kognitif,status,pertanyaan'])->findOrFail($id);
        $this->cekLihat($request, $s);
        return response()->json(['data' => $s]);
    }

    public function store(Request $request)
    {
        $data = $this->validasi($request);
        $s = BankStimulus::create($data + ['id_stimulus' => 'STM-' . Str::uuid(), 'dibuat_oleh' => $request->user()->id]);
        return response()->json(['success' => true, 'message' => 'Stimulus disimpan.', 'data' => $s->load(self::RELASI)->loadCount('soal')], 201);
    }

    public function update(Request $request, string $id)
    {
        $s = BankStimulus::findOrFail($id);
        $this->cekPengubah($request, $s);
        $data = $this->validasi($request);
        if ($data['id_mapel'] !== $s->id_mapel && $s->soal()->exists()) {
            throw ValidationException::withMessages(['id_mapel' => 'Mata pelajaran tidak bisa diganti karena stimulus ini sudah dipakai soal.']);
        }
        $s->update($data);
        return response()->json(['success' => true, 'message' => 'Stimulus diperbarui. Paket yang sudah berisi soalnya tetap memakai versi lama.', 'data' => $s->load(self::RELASI)->loadCount('soal')]);
    }

    public function destroy(Request $request, string $id)
    {
        $s = BankStimulus::findOrFail($id);
        $this->cekPengubah($request, $s);
        if ($n = $s->soal()->count()) abort(422, "Stimulus ini masih dipakai {$n} soal. Lepaskan dulu dari soalnya.");
        $s->delete();
        return response()->json(['success' => true, 'message' => 'Stimulus dihapus.']);
    }

    private function validasi(Request $request): array
    {
        $request->validate([
            'id_mapel' => 'required|exists:subjects,id_mapel',
            'id_kelas' => 'nullable|exists:classes,id_kelas',
            'judul' => 'required|string|max:200',
            'jenis' => ['required', Rule::in(array_keys(BankStimulus::JENIS))],
            'konteks' => ['required', Rule::in(array_keys(BankStimulus::KONTEKS))],
            'konten' => 'required|string|max:60000',
            'gambar_url' => ['nullable', 'string', 'max:500', 'regex:#^/storage/soal/#'],
            'sumber_teks' => 'nullable|string|max:300',
        ], ['judul.required' => 'Tulis judul stimulus.', 'konten.required' => 'Tulis isi stimulus.']);
        abort_unless($request->user()->bolehNilaiMapel($request->id_mapel), 403, 'Anda hanya dapat menyusun stimulus untuk mata pelajaran yang Anda ampu.');
        $konten = HtmlAman::bersihkan($request->konten);
        if (!$konten) throw ValidationException::withMessages(['konten' => 'Tulis isi stimulus.']);
        return $request->only(['id_mapel', 'id_kelas', 'judul', 'jenis', 'konteks', 'gambar_url', 'sumber_teks']) + ['konten' => $konten];
    }

    private function cekLihat(Request $request, BankStimulus $s): void
    {
        $u = $request->user();
        abort_unless($u->isPengelola() || in_array($s->id_mapel, $u->mapelDiampu(), true), 403, 'Stimulus ini milik mata pelajaran lain.');
    }

    private function cekPengubah(Request $request, BankStimulus $s): void
    {
        $u = $request->user();
        abort_unless($u->isPengelola() || $s->dibuat_oleh === $u->id, 403, 'Stimulus ini milik guru lain.');
    }
}

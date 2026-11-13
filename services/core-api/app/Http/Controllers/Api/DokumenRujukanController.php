<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\CapaianPembelajaran;
use App\Models\DokumenRujukan;
use App\Models\SchoolSetting;
use App\Services\PerangkatAjarAIService;
use App\Services\PustakaDokumenService;
use App\Services\SoalAIService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

/**
 * Pustaka dokumen resmi untuk AI.
 * - Admin & kepala sekolah: unggah/perbarui langsung AKTIF, atur izin unggah guru, nonaktifkan, hapus.
 * - Guru (bila diizinkan admin): unggah/perbarui → DIAJUKAN; dipakai AI setelah disetujui kepala sekolah.
 * - Semua staf: melihat dokumen AKTIF (dan ajuannya sendiri) serta mengunduhnya.
 */
class DokumenRujukanController extends Controller
{
    private const RELASI = ['mapel:id_mapel,nama_mapel', 'pengunggah:id,name', 'penyetuju:id,name'];

    public function __construct(private PustakaDokumenService $pustaka) {}

    private static function guruBolehUnggah(): bool
    {
        return (bool) SchoolSetting::query()->value('guru_boleh_unggah_dokumen');
    }

    private function bolehUnggah(Request $request): bool
    {
        $u = $request->user();
        return $u->isPengelola() || ($u->isGuru() && self::guruBolehUnggah());
    }

    private function terjangkau(Request $request)
    {
        $u = $request->user();
        return DokumenRujukan::query()->when(!$u->isPengelola(), fn($q) => $q->where(fn($w) => $w->where('status', 'AKTIF')->orWhere('diunggah_oleh', $u->id)));
    }

    public function index(Request $request)
    {
        $request->validate(['status' => ['nullable', Rule::in(DokumenRujukan::STATUS)], 'jenis' => ['nullable', Rule::in(DokumenRujukan::JENIS)]]);
        $data = $this->terjangkau($request)->with(self::RELASI)
            ->when($request->status, fn($q) => $q->where('status', $request->status))
            ->when($request->jenis, fn($q) => $q->where('jenis', $request->jenis))
            ->when($request->id_mapel, fn($q) => $q->where('id_mapel', $request->id_mapel))
            ->orderByRaw("CASE status WHEN 'DIAJUKAN' THEN 0 WHEN 'AKTIF' THEN 1 WHEN 'DITOLAK' THEN 2 ELSE 3 END")
            ->orderByDesc('updated_at')->get();
        $u = $request->user();
        return response()->json(['data' => $data, 'izin' => [
            'unggah' => $this->bolehUnggah($request),
            'langsung_aktif' => $u->isPengelola(),
            'setujui' => $u->isKepsek(),
            'atur' => $u->isAdmin(),
            'guru_boleh_unggah' => self::guruBolehUnggah(),
            'baca_pdf_server' => PustakaDokumenService::pdftotextAda(),
        ]]);
    }

    public function show(Request $request, string $id)
    {
        $d = $this->terjangkau($request)->with(self::RELASI)->withCount('potongan')->findOrFail($id);
        return response()->json(['data' => $d->toArray() + ['cuplikan' => mb_substr((string) $d->teks, 0, 6000)]]);
    }

    public function unduh(Request $request, string $id)
    {
        $d = $this->terjangkau($request)->findOrFail($id);
        abort_unless($d->file_path && Storage::disk('local')->exists($d->file_path), 404, 'Dokumen ini berupa tautan, tidak ada berkas.');
        return Storage::disk('local')->download($d->file_path, $d->nama_berkas);
    }

    private function aturanIsi(bool $baru): array
    {
        return [
            'judul' => [$baru ? 'required' : 'sometimes', 'string', 'max:200'],
            'jenis' => [$baru ? 'required' : 'sometimes', Rule::in(DokumenRujukan::JENIS)],
            'id_mapel' => 'nullable|exists:subjects,id_mapel',
            'fase' => ['nullable', Rule::in(CapaianPembelajaran::FASE)],
            'keterangan' => 'nullable|string|max:2000',
        ];
    }

    private function aturanSumber(): array
    {
        return [
            'berkas' => 'nullable|file|max:' . DokumenRujukan::MAKS_KB . '|mimes:' . implode(',', DokumenRujukan::EKSTENSI),
            'url_tautan' => 'nullable|required_without:berkas|url|max:1000',
            // Teks hasil baca di browser (pdf.js) bila server belum bisa membaca PDF
            'teks' => 'nullable|string|max:' . PustakaDokumenService::MAKS_TEKS * 2,
        ];
    }

    public function store(Request $request)
    {
        abort_unless($this->bolehUnggah($request), 403, 'Unggah dokumen guru belum diizinkan admin.');
        $request->validate($this->aturanIsi(true) + $this->aturanSumber());
        $u = $request->user();
        $d = new DokumenRujukan($request->only(['judul', 'jenis', 'id_mapel', 'fase', 'keterangan']) + [
            'id_dokumen' => 'DOK-' . Str::upper(Str::random(12)), 'versi' => 1,
            'diunggah_oleh' => $u->id,
        ]);
        $pesan = $this->isiSumber($request, $d);
        $this->aturStatusSetelahUnggah($d, $u);
        return response()->json(['success' => true, 'message' => $this->pesanSimpan($d, $pesan), 'data' => $d->fresh(self::RELASI)], 201);
    }

    /** Perbarui isi (berkas/tautan versi baru). Unggahan guru diajukan ulang. */
    public function perbarui(Request $request, string $id)
    {
        $d = DokumenRujukan::findOrFail($id);
        $u = $request->user();
        abort_unless($u->isPengelola() || ($this->bolehUnggah($request) && ($d->diunggah_oleh === $u->id || $d->status === 'AKTIF')), 403, 'Anda tidak dapat memperbarui dokumen ini.');
        $request->validate($this->aturanIsi(false) + $this->aturanSumber());
        $d->fill($request->only(['judul', 'jenis', 'id_mapel', 'fase', 'keterangan']));
        $lama = $d->file_path;
        $pesan = $this->isiSumber($request, $d);
        if ($lama && $lama !== $d->file_path) Storage::disk('local')->delete($lama);
        $d->versi = $d->versi + 1;
        $d->ringkasan = null;
        $this->aturStatusSetelahUnggah($d, $u);
        return response()->json(['success' => true, 'message' => $this->pesanSimpan($d, $pesan), 'data' => $d->fresh(self::RELASI)]);
    }

    /** Ubah keterangan (judul, jenis, mapel, fase) tanpa mengganti isi. */
    public function update(Request $request, string $id)
    {
        $d = DokumenRujukan::findOrFail($id);
        $u = $request->user();
        abort_unless($u->isPengelola() || ($d->diunggah_oleh === $u->id && $d->status !== 'AKTIF'), 403, 'Anda tidak dapat mengubah dokumen ini.');
        $d->fill($request->validate($this->aturanIsi(false)))->save();
        return response()->json(['success' => true, 'message' => 'Keterangan dokumen disimpan.', 'data' => $d->fresh(self::RELASI)]);
    }

    /** Simpan berkas/tautan dan teksnya. @return string|null pesan bila teks belum terbaca */
    private function isiSumber(Request $request, DokumenRujukan $d): ?string
    {
        $teks = null;
        $pesan = null;
        if ($request->hasFile('berkas')) {
            $f = $request->file('berkas');
            $ext = strtolower($f->getClientOriginalExtension());
            $path = $f->storeAs('dokumen-rujukan', $d->id_dokumen . '_v' . ($d->exists ? $d->versi + 1 : 1) . '_' . Str::lower(Str::random(6)) . ".{$ext}", 'local');
            $d->fill(['sumber_tipe' => 'BERKAS', 'file_path' => $path, 'nama_berkas' => mb_substr($f->getClientOriginalName(), 0, 250),
                'ukuran_kb' => (int) ceil($f->getSize() / 1024), 'url_tautan' => null]);
            $teks = $this->pustaka->teksBerkas(Storage::disk('local')->path($path), $ext);
        } elseif ($request->filled('url_tautan')) {
            $d->fill(['sumber_tipe' => 'TAUTAN', 'url_tautan' => $request->url_tautan, 'file_path' => null, 'nama_berkas' => null, 'ukuran_kb' => null]);
            ['teks' => $teks, 'pesan' => $pesan] = $this->pustaka->teksTautan($request->url_tautan);
        }
        if (!trim((string) $teks) && $request->filled('teks')) $teks = $request->teks; // hasil baca browser
        $d->save();
        $this->pustaka->simpanTeks($d, $teks);
        if ($d->status_teks !== 'TERBACA') {
            $pesan ??= 'Teks dokumen belum terbaca (mis. PDF hasil pindai). Dokumen tersimpan tetapi belum bisa dipakai AI.';
        }
        return $pesan;
    }

    private function aturStatusSetelahUnggah(DokumenRujukan $d, $u): void
    {
        $langsung = $u->isPengelola();
        $d->fill([
            'status' => $langsung ? 'AKTIF' : 'DIAJUKAN',
            'disetujui_oleh' => $langsung ? $u->id : null,
            'disetujui_pada' => $langsung ? now() : null,
            'catatan_review' => null,
        ])->save();
    }

    private function pesanSimpan(DokumenRujukan $d, ?string $pesan): string
    {
        $dasar = $d->status === 'AKTIF' ? 'Dokumen disimpan dan langsung dipakai AI.' : 'Dokumen diajukan ke kepala sekolah; dipakai AI setelah disetujui.';
        return $pesan ? "{$dasar} {$pesan}" : $dasar;
    }

    public function setujui(Request $request, string $id)
    {
        abort_unless($request->user()->isKepsek(), 403, 'Hanya kepala sekolah yang menyetujui dokumen.');
        $d = DokumenRujukan::findOrFail($id);
        abort_unless($d->status === 'DIAJUKAN', 422, 'Dokumen ini tidak sedang diajukan.');
        $d->fill(['status' => 'AKTIF', 'disetujui_oleh' => $request->user()->id, 'disetujui_pada' => now(), 'catatan_review' => null])->save();
        return response()->json(['success' => true, 'message' => 'Dokumen disetujui dan kini dipakai AI.', 'data' => $d->fresh(self::RELASI)]);
    }

    public function tolak(Request $request, string $id)
    {
        abort_unless($request->user()->isKepsek(), 403, 'Hanya kepala sekolah yang meninjau dokumen.');
        $request->validate(['catatan' => 'required|string|max:2000']);
        $d = DokumenRujukan::findOrFail($id);
        abort_unless($d->status === 'DIAJUKAN', 422, 'Dokumen ini tidak sedang diajukan.');
        $d->fill(['status' => 'DITOLAK', 'catatan_review' => $request->catatan])->save();
        return response()->json(['success' => true, 'message' => 'Dokumen dikembalikan dengan catatan.', 'data' => $d->fresh(self::RELASI)]);
    }

    public function aktifkan(Request $request, string $id)
    {
        abort_unless($request->user()->isPengelola(), 403);
        $request->validate(['aktif' => 'required|boolean']);
        $d = DokumenRujukan::findOrFail($id);
        abort_if($d->status === 'DIAJUKAN' || $d->status === 'DITOLAK', 422, 'Dokumen ajuan guru perlu disetujui kepala sekolah lebih dulu.');
        $d->update(['status' => $request->boolean('aktif') ? 'AKTIF' : 'NONAKTIF']);
        return response()->json(['success' => true, 'message' => $request->boolean('aktif') ? 'Dokumen dipakai AI lagi.' : 'Dokumen tidak dipakai AI.', 'data' => $d->fresh(self::RELASI)]);
    }

    public function bacaUlang(Request $request, string $id)
    {
        abort_unless($request->user()->isPengelola(), 403);
        $d = DokumenRujukan::findOrFail($id);
        $teks = null;
        $pesan = null;
        if ($d->file_path) {
            $teks = $this->pustaka->teksBerkas(Storage::disk('local')->path($d->file_path), pathinfo($d->file_path, PATHINFO_EXTENSION));
        } elseif ($d->url_tautan) {
            ['teks' => $teks, 'pesan' => $pesan] = $this->pustaka->teksTautan($d->url_tautan);
        }
        if (!trim((string) $teks) && $request->filled('teks')) $teks = $request->validate(['teks' => 'string|max:' . PustakaDokumenService::MAKS_TEKS * 2])['teks'];
        if (!trim((string) $teks)) return response()->json(['message' => $pesan ?? 'Teks dokumen belum bisa dibaca.'], 422);
        $this->pustaka->simpanTeks($d, $teks);
        return response()->json(['success' => true, 'message' => 'Teks dokumen dibaca ulang (' . number_format($d->jumlah_karakter, 0, ',', '.') . ' karakter).', 'data' => $d->fresh(self::RELASI)]);
    }

    /** Analisis AI: ringkasan isi pokok dokumen untuk guru dan untuk memeriksa bahwa dokumennya terbaca benar. */
    public function analisis(Request $request, string $id, PerangkatAjarAIService $ai)
    {
        $request->validate(['ai_mode' => ['required', Rule::in(SoalAIService::MODES)]]);
        $d = $this->terjangkau($request)->findOrFail($id);
        abort_unless($request->user()->isPengelola() || $d->diunggah_oleh === $request->user()->id, 403);
        abort_unless($d->status_teks === 'TERBACA', 422, 'Teks dokumen belum terbaca.');
        $hasil = $ai->analisisDokumen($d->judul, $d->jenis, (string) $d->teks, $request->ai_mode);
        if ($hasil === null) return response()->json(['message' => $ai->galat()], 422);
        $d->update(['ringkasan' => $hasil]);
        return response()->json(['success' => true, 'message' => 'Analisis AI disimpan.', 'data' => $d->fresh(self::RELASI)]);
    }

    public function destroy(Request $request, string $id)
    {
        $d = DokumenRujukan::findOrFail($id);
        $u = $request->user();
        abort_unless($u->isPengelola() || ($d->diunggah_oleh === $u->id && $d->status !== 'AKTIF'), 403, 'Anda tidak dapat menghapus dokumen ini.');
        if ($d->file_path) Storage::disk('local')->delete($d->file_path);
        $d->delete();
        return response()->json(['success' => true, 'message' => 'Dokumen dihapus.']);
    }

    /** Admin: izinkan semua guru mengunggah/memperbarui dokumen (dengan persetujuan kepala sekolah). */
    public function pengaturan(Request $request)
    {
        abort_unless($request->user()->isAdmin(), 403, 'Hanya admin yang mengatur izin unggah.');
        $request->validate(['guru_boleh_unggah' => 'required|boolean']);
        $s = SchoolSetting::first() ?? new SchoolSetting(['nama_sekolah' => config('app.name', 'Sekolah')]);
        $s->fill(['guru_boleh_unggah_dokumen' => $request->boolean('guru_boleh_unggah')])->save();
        return response()->json(['success' => true, 'message' => $request->boolean('guru_boleh_unggah')
            ? 'Semua guru kini bisa mengunggah dokumen; dipakai AI setelah disetujui kepala sekolah.' : 'Unggah dokumen kini hanya untuk admin dan kepala sekolah.']);
    }

    /** Uji pencarian: bagian dokumen mana yang akan dibaca AI untuk kueri ini. */
    public function cari(Request $request)
    {
        $request->validate(['kueri' => 'required|string|max:500', 'id_mapel' => 'nullable|string', 'fase' => ['nullable', Rule::in(CapaianPembelajaran::FASE)]]);
        $k = $this->pustaka->konteks($request->kueri, $request->id_mapel, $request->fase, 6000);
        return response()->json(['data' => $k]);
    }
}

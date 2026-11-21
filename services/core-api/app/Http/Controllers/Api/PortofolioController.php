<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Classes;
use App\Models\MasterPeriode;
use App\Models\MasterProyek;
use App\Models\Student;
use App\Models\TransPortofolio;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

/**
 * E-portofolio siswa: foto/video karya, projek P5/kokurikuler, prestasi, dan kegiatan, yang masuk ke Rekam Jejak dan
 * bisa dicetak sebagai lampiran buku induk.
 *
 * - Wali kelas, kepala sekolah, dan admin mengunggah untuk satu atau beberapa siswa sekaligus (karya kelompok);
 *   unggahan mereka langsung disetujui.
 * - Siswa/orang tua mengunggah dari portal; karyanya menunggu persetujuan wali kelas.
 * - Berkas privat, ditampilkan lewat tautan bertanda tangan yang hanya diberikan kepada akun yang boleh melihat siswa.
 */
class PortofolioController extends Controller
{
    private const MIME = [
        'image/jpeg' => ['FOTO', 'jpg'], 'image/png' => ['FOTO', 'png'], 'image/webp' => ['FOTO', 'webp'], 'image/gif' => ['FOTO', 'gif'],
        'video/mp4' => ['VIDEO', 'mp4'], 'video/webm' => ['VIDEO', 'webm'], 'video/quicktime' => ['VIDEO', 'mov'], 'video/3gpp' => ['VIDEO', '3gp'],
    ];
    private const MAKS = ['FOTO' => 10 * 1024 * 1024, 'VIDEO' => 45 * 1024 * 1024];
    private const RELASI = ['pembuat:id,name,id_guru', 'peninjau:id,name,id_guru', 'proyek:id_proyek,judul_proyek', 'periode:id_periode,tahun_ajaran,semester'];

    private function bolehKelola(User $u, Student $s): bool
    {
        return !$u->isPortal() && !$u->isPeninjau() && $u->bolehKelolaKelas($s->id_kelas);
    }

    private function siswaBoleh(Request $request, string $id): Student
    {
        $siswa = Student::find($id);
        abort_unless($siswa && $request->user()->bolehDashboardSiswa($siswa), 403, 'Portofolio siswa ini tidak dapat diakses dari akun Anda.');
        return $siswa;
    }

    /** Pilihan projek P5/kokurikuler rombel pada semester aktif. */
    private static function proyek(?string $idKelas): Collection
    {
        $periode = MasterPeriode::where('status_aktif', 'AKTIF')->value('id_periode');
        if (!$idKelas || !$periode) return collect();
        return MasterProyek::where('id_kelas', $idKelas)->where('id_periode', $periode)->orderBy('created_at')->get(['id_proyek', 'judul_proyek']);
    }

    /** Portofolio satu siswa (semua status: siswa/orang tua melihat status unggahannya sendiri). */
    public function siswa(Request $request, string $id)
    {
        $siswa = $this->siswaBoleh($request, $id);
        $u = $request->user();
        return response()->json([
            'data' => TransPortofolio::with(self::RELASI)->where('id_siswa', $id)->orderByDesc('tanggal')->orderByDesc('id')->get(),
            'proyek' => self::proyek($siswa->id_kelas),
            'boleh_unggah' => $this->bolehKelola($u, $siswa) || ($u->isPortal() && $siswa->status_siswa !== 'lulus'),
            'boleh_tinjau' => $this->bolehKelola($u, $siswa),
        ]);
    }

    /** Galeri portofolio satu rombel (wali kelas, kepala sekolah, admin). */
    public function kelas(Request $request)
    {
        $request->validate(['id_kelas' => 'nullable|exists:classes,id_kelas']);
        $u = $request->user();
        $pilihan = Classes::orderBy('tingkat')->orderBy('nama_kelas')->get(['id_kelas', 'nama_kelas', 'tingkat'])
            ->filter(fn($k) => $u->bolehKelolaKelas($k->id_kelas))->values();
        abort_if($pilihan->isEmpty(), 403, 'Portofolio kelas hanya untuk wali kelas, kepala sekolah, dan admin.');
        $idKelas = $request->id_kelas ?? $pilihan->first()->id_kelas;
        abort_unless($u->bolehKelolaKelas($idKelas), 403, 'Portofolio rombel ini hanya untuk wali kelasnya, kepala sekolah, dan admin.');

        $siswa = Student::where('id_kelas', $idKelas)->orderBy('nama_siswa')->get(['id_siswa', 'nisn', 'nama_siswa']);
        $data = TransPortofolio::with(self::RELASI)->whereIn('id_siswa', $siswa->pluck('id_siswa'))->orderByDesc('tanggal')->orderByDesc('id')->get();
        $jumlah = $data->where('status', 'DISETUJUI')->countBy('id_siswa');
        return response()->json([
            'kelas' => Classes::find($idKelas, ['id_kelas', 'nama_kelas', 'tingkat']),
            'pilihan_kelas' => $pilihan,
            'siswa' => $siswa->map(fn($s) => $s->only(['id_siswa', 'nisn', 'nama_siswa']) + ['karya' => (int) ($jumlah[$s->id_siswa] ?? 0)])->values(),
            'proyek' => self::proyek($idKelas),
            'data' => $data,
            'boleh_unggah' => !$u->isPeninjau(),
        ]);
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'id_siswa' => 'required|array|min:1|max:60',
            'id_siswa.*' => 'required|string|distinct|exists:students,id_siswa',
            'berkas' => 'required|file|max:' . (45 * 1024),
            'judul' => 'required|string|max:150',
            'deskripsi' => 'nullable|string|max:2000',
            'kategori' => ['required', Rule::in(TransPortofolio::KATEGORI)],
            'id_proyek' => 'nullable|string|exists:master_proyek,id_proyek',
            'tanggal' => 'nullable|date|before_or_equal:today',
        ], ['berkas.max' => 'Ukuran berkas maksimal 45 MB.', 'berkas.uploaded' => 'Berkas gagal diunggah (maksimal 45 MB).']);
        $u = $request->user();
        $siswa = Student::whereIn('id_siswa', $data['id_siswa'])->get();

        if ($u->isPortal()) {
            abort_unless($siswa->count() === 1 && in_array($siswa[0]->id_siswa, $u->siswaTerjangkau(), true), 403, 'Unggah karya hanya untuk diri sendiri/anak Anda.');
            abort_if($siswa[0]->status_siswa === 'lulus', 422, 'Siswa sudah lulus; portofolio tidak bisa ditambah lagi.');
        } else {
            foreach ($siswa as $s) abort_unless($this->bolehKelola($u, $s), 403, "Anda tidak mengelola kelas {$s->nama_siswa}.");
        }

        $berkas = $request->file('berkas');
        $mime = (new \finfo(FILEINFO_MIME_TYPE))->file($berkas->getRealPath());
        abort_unless(isset(self::MIME[$mime]), 422, 'Hanya foto (JPG/PNG/WEBP/GIF) atau video (MP4/WEBM/MOV/3GP) yang dapat diunggah.');
        [$jenis, $ext] = self::MIME[$mime];
        abort_if($berkas->getSize() > self::MAKS[$jenis], 422, $jenis === 'FOTO' ? 'Ukuran foto maksimal 10 MB.' : 'Ukuran video maksimal 45 MB.');

        $path = 'portofolio/' . now()->format('Y/m') . '/' . Str::random(32) . '.' . $ext;
        Storage::disk('local')->put($path, file_get_contents($berkas->getRealPath()));

        $staf = !$u->isPortal();
        $periode = MasterPeriode::where('status_aktif', 'AKTIF')->value('id_periode');
        $kelompok = $siswa->count() > 1 ? (string) Str::uuid() : null;
        $dibuat = $siswa->map(fn($s) => TransPortofolio::create([
            'id_siswa' => $s->id_siswa, 'id_periode' => $periode, 'id_kelas' => $s->id_kelas,
            'kategori' => $data['kategori'], 'id_proyek' => $data['kategori'] === 'P5' ? ($data['id_proyek'] ?? null) : null,
            'judul' => trim($data['judul']), 'deskripsi' => isset($data['deskripsi']) ? trim($data['deskripsi']) : null,
            'tanggal' => $data['tanggal'] ?? now(config('app.zona_sekolah'))->toDateString(),
            'jenis' => $jenis, 'path' => $path, 'mime' => $mime, 'ukuran' => $berkas->getSize(), 'kelompok' => $kelompok,
            'status' => $staf ? 'DISETUJUI' : 'MENUNGGU', 'ditinjau_oleh' => $staf ? $u->id : null, 'ditinjau_pada' => $staf ? now() : null,
            'dibuat_oleh' => $u->id,
        ]));

        return response()->json([
            'message' => $staf
                ? ($dibuat->count() > 1 ? "Karya tersimpan di portofolio {$dibuat->count()} siswa." : 'Karya tersimpan di portofolio.')
                : 'Karya terkirim. Wali kelas akan meninjaunya sebelum masuk portofolio.',
            'data' => TransPortofolio::with(self::RELASI)->whereIn('id', $dibuat->pluck('id'))->get(),
        ], 201);
    }

    public function update(Request $request, int $id)
    {
        $x = TransPortofolio::with('siswa')->findOrFail($id);
        $u = $request->user();
        $kelola = $x->siswa && $this->bolehKelola($u, $x->siswa);
        $milikSendiri = $u->isPortal() && $x->dibuat_oleh === $u->id && $x->status !== 'DISETUJUI';
        abort_unless($kelola || $milikSendiri, 403, 'Karya ini tidak dapat diubah dari akun Anda.');

        $data = $request->validate([
            'judul' => 'sometimes|required|string|max:150',
            'deskripsi' => 'sometimes|nullable|string|max:2000',
            'kategori' => ['sometimes', 'required', Rule::in(TransPortofolio::KATEGORI)],
            'id_proyek' => 'sometimes|nullable|string|exists:master_proyek,id_proyek',
            'tanggal' => 'sometimes|required|date|before_or_equal:today',
            'unggulan' => 'sometimes|boolean',
            'tanggapan' => 'sometimes|nullable|string|max:1000',
        ]);
        if (!$kelola) unset($data['unggulan'], $data['tanggapan']);

        // Judul, keterangan, kategori, dan tanggal berlaku untuk seluruh anggota karya kelompok
        $bersama = collect($data)->only(['judul', 'deskripsi', 'kategori', 'id_proyek', 'tanggal'])->all();
        if (isset($bersama['kategori']) && $bersama['kategori'] !== 'P5') $bersama['id_proyek'] = null;
        if ($bersama) {
            $q = $x->kelompok ? TransPortofolio::where('kelompok', $x->kelompok) : TransPortofolio::whereKey($x->id);
            $q->get()->each->update($bersama);
        }
        $sendiri = collect($data)->only(['unggulan', 'tanggapan'])->all();
        // Unggahan yang dikembalikan lalu diperbaiki pengirimnya kembali menunggu tinjauan
        if (!$kelola && $x->status === 'DITOLAK') $sendiri['status'] = 'MENUNGGU';
        if ($sendiri) $x->fresh()->update($sendiri);

        return response()->json(['message' => 'Karya diperbarui.', 'data' => TransPortofolio::with(self::RELASI)->find($x->id)]);
    }

    /** Setujui/kembalikan unggahan siswa atau orang tua (wali kelas, kepala sekolah, admin). */
    public function tinjau(Request $request, int $id)
    {
        $x = TransPortofolio::with('siswa')->findOrFail($id);
        abort_unless($x->siswa && $this->bolehKelola($request->user(), $x->siswa), 403, 'Karya ini ditinjau wali kelas siswa, kepala sekolah, atau admin.');
        $data = $request->validate([
            'status' => ['required', Rule::in(['DISETUJUI', 'DITOLAK'])],
            'tanggapan' => 'nullable|string|max:1000|required_if:status,DITOLAK',
        ], ['tanggapan.required_if' => 'Tuliskan alasannya agar siswa/orang tua bisa memperbaiki.']);
        $x->update([
            'status' => $data['status'], 'tanggapan' => $data['tanggapan'] ?? $x->tanggapan,
            'ditinjau_oleh' => $request->user()->id, 'ditinjau_pada' => now(),
        ]);
        return response()->json([
            'message' => $data['status'] === 'DISETUJUI' ? 'Karya disetujui dan masuk portofolio.' : 'Karya dikembalikan dengan catatan.',
            'data' => TransPortofolio::with(self::RELASI)->find($x->id),
        ]);
    }

    public function destroy(Request $request, int $id)
    {
        $x = TransPortofolio::with('siswa')->findOrFail($id);
        $u = $request->user();
        $boleh = ($x->siswa && $this->bolehKelola($u, $x->siswa)) || ($u->isPortal() && $x->dibuat_oleh === $u->id && $x->status !== 'DISETUJUI');
        abort_unless($boleh, 403, 'Karya ini tidak dapat dihapus dari akun Anda.');
        $path = $x->path;
        $x->delete();
        if (!TransPortofolio::where('path', $path)->exists()) Storage::disk('local')->delete($path);
        return response()->json(['message' => 'Karya dihapus dari portofolio.']);
    }

    /** Berkas lewat tautan bertanda tangan (<img>/<video>); mendukung Range agar video bisa digeser. */
    public function berkas(int $id)
    {
        $x = TransPortofolio::findOrFail($id);
        abort_unless(Storage::disk('local')->exists($x->path), 404, 'Berkas tidak ditemukan.');
        $nama = (Str::slug($x->judul) ?: 'karya') . '.' . pathinfo($x->path, PATHINFO_EXTENSION);
        return response()->file(Storage::disk('local')->path($x->path), [
            'Content-Type' => $x->mime,
            'Content-Disposition' => 'inline; filename="' . $nama . '"',
            'Cache-Control' => 'private, max-age=86400',
            'X-Content-Type-Options' => 'nosniff',
        ]);
    }
}

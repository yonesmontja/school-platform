<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Student;
use App\Services\AuditTrail;
use App\Services\SoalAIService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

/**
 * Pas foto siswa (biodata rapor & profil portal).
 * Diunggah dan diedit oleh admin, kepala sekolah, atau wali kelas siswa itu. Berkas disimpan privat;
 * ditampilkan lewat tautan bertanda tangan (Student::foto_url) yang hanya diberikan kepada akun yang boleh melihat siswa.
 */
class FotoSiswaController extends Controller
{
    private const FOLDER = 'foto-siswa';
    private const MIME = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp'];

    /** Tampilkan foto lewat tautan bertanda tangan (dipakai <img> di rapor, portal, dan menu Siswa). */
    public function tampil(Request $request, string $id)
    {
        $siswa = Student::findOrFail($id);
        abort_unless($siswa->foto_path && Storage::disk('local')->exists($siswa->foto_path), 404, 'Foto belum ada.');
        return Storage::disk('local')->response($siswa->foto_path, $this->namaBerkas($siswa, $siswa->foto_path), [
            'Cache-Control' => 'private, max-age=86400',
        ]);
    }

    /** Foto asli (sebelum diedit) untuk diedit ulang. */
    public function asli(Request $request, string $id)
    {
        $siswa = $this->siswaBoleh($request, $id);
        $path = $siswa->foto_asli_path ?: $siswa->foto_path;
        abort_unless($path && Storage::disk('local')->exists($path), 404, 'Foto belum ada.');
        return Storage::disk('local')->response($path, $this->namaBerkas($siswa, $path), ['Cache-Control' => 'private, no-store']);
    }

    /** Simpan foto hasil edit (wajib) beserta foto asli (opsional; bila kosong, foto asli lama dipertahankan). */
    public function simpan(Request $request, string $id)
    {
        $siswa = $this->siswaBoleh($request, $id);
        $request->validate([
            'foto' => 'required|file|mimes:jpg,jpeg,png,webp|max:5120',
            'asli' => 'nullable|file|mimes:jpg,jpeg,png,webp|max:10240',
        ], [
            'foto.max' => 'Foto hasil edit paling besar 5MB.',
            'asli.max' => 'Foto asli paling besar 10MB.',
            'foto.mimes' => 'Foto harus JPG, PNG, atau WEBP.',
            'asli.mimes' => 'Foto asli harus JPG, PNG, atau WEBP.',
        ]);

        $lama = [$siswa->foto_path];
        $siswa->foto_path = $this->taruh($request->file('foto'), $siswa, 'pas');
        if ($request->hasFile('asli')) {
            $lama[] = $siswa->foto_asli_path;
            $siswa->foto_asli_path = $this->taruh($request->file('asli'), $siswa, 'asli');
        } elseif (!$siswa->foto_asli_path) {
            // Unggahan pertama tanpa asli terpisah: foto itu sendiri menjadi acuan edit berikutnya
            $siswa->foto_asli_path = $this->taruh($request->file('foto'), $siswa, 'asli');
        }
        $ada = (bool) $lama[0];
        $siswa->foto_diperbarui = now();
        $siswa->save();
        foreach (array_filter($lama) as $p) {
            if ($p !== $siswa->foto_path && $p !== $siswa->foto_asli_path) Storage::disk('local')->delete($p);
        }

        AuditTrail::catat([
            'aksi' => $ada ? 'UBAH_FOTO' : 'UNGGAH_FOTO',
            'kategori' => 'DATA',
            'modul' => 'Siswa',
            'deskripsi' => ($ada ? 'Mengganti' : 'Mengunggah') . " pas foto {$siswa->nama_siswa}",
            'meta' => ['id_siswa' => $siswa->id_siswa],
        ]);

        return response()->json(['success' => true, 'message' => 'Pas foto tersimpan.', 'foto_url' => $siswa->foto_url]);
    }

    public function hapus(Request $request, string $id)
    {
        $siswa = $this->siswaBoleh($request, $id);
        abort_unless($siswa->foto_path, 404, 'Siswa ini belum punya foto.');
        Storage::disk('local')->delete(array_filter([$siswa->foto_path, $siswa->foto_asli_path]));
        $siswa->forceFill(['foto_path' => null, 'foto_asli_path' => null, 'foto_diperbarui' => now()])->save();
        AuditTrail::catat([
            'aksi' => 'HAPUS_FOTO',
            'kategori' => 'DATA',
            'modul' => 'Siswa',
            'deskripsi' => "Menghapus pas foto {$siswa->nama_siswa}",
            'meta' => ['id_siswa' => $siswa->id_siswa],
        ]);
        return response()->json(['success' => true, 'message' => 'Pas foto dihapus.']);
    }

    /**
     * Edit foto dengan penyedia AI sekolah (ganti latar, rapikan pencahayaan, atau perintah bebas).
     * Hasil TIDAK langsung disimpan: dikembalikan sebagai data URL untuk ditinjau di editor lalu disimpan pengguna.
     */
    public function ai(Request $request, string $id, SoalAIService $ai)
    {
        $siswa = $this->siswaBoleh($request, $id);
        $request->validate([
            'foto' => 'required|file|mimes:jpg,jpeg,png,webp|max:5120',
            'perintah' => 'required|string|min:5|max:500',
            'ai_mode' => ['required', Rule::in(SoalAIService::MODES)],
            'setuju' => 'accepted',
        ], ['setuju.accepted' => 'Centang persetujuan pengiriman foto ke penyedia AI terlebih dahulu.']);

        $berkas = $request->file('foto');
        $hasil = $ai->editFoto($request->ai_mode, $berkas->get(), $berkas->getMimeType(), $request->perintah);
        if (!$hasil) return response()->json(['message' => $ai->galat() ?? 'AI tidak mengembalikan foto. Coba lagi.'], 422);

        AuditTrail::catat([
            'aksi' => 'AI_FOTO',
            'kategori' => 'DATA',
            'modul' => 'Siswa',
            'deskripsi' => "Mengedit pas foto {$siswa->nama_siswa} dengan AI ({$hasil['model']}): " . Str::limit($request->perintah, 120),
            'meta' => ['id_siswa' => $siswa->id_siswa],
        ]);

        return response()->json([
            'success' => true,
            'model' => $hasil['model'],
            'gambar' => 'data:' . $hasil['mime'] . ';base64,' . base64_encode($hasil['data']),
        ]);
    }

    /** Admin & kepala sekolah untuk semua siswa; guru hanya untuk siswa di kelas binaannya. */
    private function siswaBoleh(Request $request, string $id): Student
    {
        $siswa = Student::findOrFail($id);
        $u = $request->user();
        abort_unless($u->isAdmin() || $u->isKepsek() || ($u->isGuru() && $siswa->id_kelas && in_array($siswa->id_kelas, $u->kelasBinaan(), true)),
            403, 'Foto siswa hanya bisa diatur admin, kepala sekolah, atau wali kelasnya.');
        return $siswa;
    }

    private function taruh($berkas, Student $siswa, string $jenis): string
    {
        $mime = $berkas->getMimeType();
        abort_unless(isset(self::MIME[$mime]), 422, 'Foto harus JPG, PNG, atau WEBP.');
        $nama = self::FOLDER . '/' . Str::slug($siswa->id_siswa) . "-{$jenis}-" . Str::random(10) . '.' . self::MIME[$mime];
        Storage::disk('local')->put($nama, $berkas->get());
        return $nama;
    }

    private function namaBerkas(Student $siswa, string $path): string
    {
        return 'Pas foto ' . Str::slug($siswa->nama_siswa, ' ') . '.' . pathinfo($path, PATHINFO_EXTENSION);
    }
}

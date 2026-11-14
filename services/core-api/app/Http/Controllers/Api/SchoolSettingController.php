<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\SchoolSetting;
use Illuminate\Http\Request;

class SchoolSettingController extends Controller
{
    public function show(Request $request)
    {
        $setting = SchoolSetting::first();
        // Jika belum ada data, buatkan default kosong
        if (!$setting) {
            // refresh: nilai bawaan kolom (KKTP, skala kokurikuler) ikut terkirim sejak pertama dibuat
            $setting = SchoolSetting::create(['nama_sekolah' => 'Nama Sekolah Default'])->refresh();
        }
        // Nomor peringatan keamanan hanya untuk admin; /settings dibaca semua peran termasuk portal
        if ($request->user()?->role !== 'admin') $setting->makeHidden('no_wa_admin');
        return response()->json($setting);
    }

    public function update(Request $request)
    {
        $setting = SchoolSetting::first();
        
        $request->validate([
            'openkey_base_url' => 'nullable|url:https|max:255',
            'openkey_model_name' => 'nullable|string|max:100',
            'elevenlabs_voice_netral' => ['nullable', 'string', 'max:100', 'regex:/^[A-Za-z0-9]+$/'],
            'elevenlabs_voice_klon' => ['nullable', 'string', 'max:100', 'regex:/^[A-Za-z0-9]+$/'],
            'gemini_tts_voice' => ['nullable', 'string', 'max:50', 'regex:/^[A-Za-z]+$/'],
            'canva_client_id' => ['nullable', 'string', 'max:100', 'regex:/^[A-Za-z0-9_-]+$/'],
            'canva_client_secret' => ['nullable', 'string', 'max:300'],
            'azure_speech_key' => ['nullable', 'string', 'max:200'],
            'azure_speech_region' => ['nullable', 'string', 'max:40', 'regex:/^[a-z0-9]+$/'],
            'ai_model_name' => 'nullable|string|max:100',
            'no_wa_kepsek' => 'nullable|string|max:30',
            'no_wa_admin' => 'nullable|string|max:30',
            'id_wa_group_guru' => 'nullable|string|max:100',
            'status_wa_api' => 'nullable|boolean',
            // Rentang KKTP harus naik: cukup < baik < sangat baik
            'kktp_cukup' => 'sometimes|integer|between:1,98',
            'kktp_baik' => 'sometimes|integer|between:2,99|gt:kktp_cukup',
            'kktp_sangat_baik' => 'sometimes|integer|between:3,100|gt:kktp_baik',
            'skala_kokurikuler' => 'sometimes|in:3,4',
            'batas_nilai_remedial' => 'sometimes|in:KKM,ASLI',
            // Logo dikirim sebagai data URL PNG/JPEG (sudah diperkecil di peramban), maks. ~2 MB
            'logo_sekolah_base64' => 'nullable|string|max:2800000',
            // Ikon aplikasi dari logo: dibuat di peramban (PNG persegi per ukuran), dikirim bersama sakelarnya
            'ikon_dari_logo' => 'sometimes|boolean',
            'ikon_aplikasi' => 'nullable|array',
            'ikon_aplikasi.*' => 'string|max:1500000',
        ], [
            'kktp_baik.gt' => 'Batas Baik harus lebih tinggi dari batas Cukup.',
            'kktp_sangat_baik.gt' => 'Batas Sangat Baik harus lebih tinggi dari batas Baik.',
        ]);

        // logo_sekolah_url tidak boleh diisi bebas dari luar: hanya lewat unggahan atau dikosongkan (hapus logo)
        $data = $request->except(['ttd_kepsek_base64', 'logo_sekolah_base64', 'logo_sekolah_url', 'ikon_aplikasi']);
        $logoBaru = $request->filled('logo_sekolah_base64') ? $this->simpanLogo($request->logo_sekolah_base64) : null;
        if ($logoBaru || ($request->has('logo_sekolah_url') && !$request->filled('logo_sekolah_url'))) {
            $this->hapusBerkasLogo($setting->logo_sekolah_url);
            $data['logo_sekolah_url'] = $logoBaru;
        }
        // Ikon aplikasi: berkas baru disimpan; tanpa logo, sakelar otomatis mati dan ikon kembali ke bawaan
        if ($request->filled('ikon_aplikasi')) $this->simpanIkon($request->input('ikon_aplikasi'));
        $adaLogo = array_key_exists('logo_sekolah_url', $data) ? (bool) $data['logo_sekolah_url'] : (bool) $setting->logo_sekolah_url;
        $ikonAktif = $request->has('ikon_dari_logo') ? $request->boolean('ikon_dari_logo') : (bool) $setting->ikon_dari_logo;
        if ($ikonAktif && (!$adaLogo || !$this->ikonLengkap())) {
            if (!$adaLogo) $ikonAktif = false;
            else throw \Illuminate\Validation\ValidationException::withMessages(['ikon_aplikasi' => 'Ikon aplikasi dari logo belum dibuat. Simpan ulang setelah logo termuat.']);
        }
        if (!$adaLogo) $this->hapusIkon();
        $data['ikon_dari_logo'] = $ikonAktif;
        foreach (SchoolSetting::API_KEY_FIELDS as $field) {
            unset($data["has_{$field}"], $data["hapus_{$field}"]);

            // API key tidak pernah dikirim balik ke frontend, jadi field kosong = tidak diubah.
            // Untuk menghapus key, kirim hapus_<field> = true (mis. hapus_api_key_claude).
            if ($request->boolean("hapus_{$field}")) {
                $data[$field] = null;
            } elseif (!$request->filled($field)) {
                unset($data[$field]);
            }
        }

        if (array_key_exists('ai_model_name', $data) && !$request->filled('ai_model_name')) {
            unset($data['ai_model_name']);
        }

        // Jika ada upload tanda tangan Kepsek (Base64)
        if ($request->filled('ttd_kepsek_base64')) {
            $base64Image = $request->ttd_kepsek_base64;
            
            // Bersihkan header base64
            $image_parts = explode(";base64,", $base64Image);
            $image_base64 = base64_decode($image_parts[1]);
            $fileName = 'ttd_kepsek_' . time() . '.png';
            
            // Simpan ke storage/app/public/signatures/
            \Illuminate\Support\Facades\Storage::disk('public')->put('signatures/' . $fileName, $image_base64);
            
            // Simpan path ke database
            $data['ttd_kepsek_url'] = '/storage/signatures/' . $fileName;
        }

        $setting->update($data);
        return response()->json(['message' => 'Pengaturan berhasil disimpan', 'data' => $setting]);
    }

    /** Simpan logo (PNG/JPEG) ke storage publik; tolak berkas yang bukan gambar sungguhan. */
    private function simpanLogo(string $dataUrl): string
    {
        $tolak = fn(string $pesan) => throw \Illuminate\Validation\ValidationException::withMessages(['logo_sekolah_base64' => $pesan]);
        if (!preg_match('#^data:image/(png|jpeg);base64,#', $dataUrl)) $tolak('Logo harus berupa gambar PNG atau JPG.');
        $biner = base64_decode(substr($dataUrl, strpos($dataUrl, ',') + 1), true);
        if ($biner === false || strlen($biner) > 2 * 1024 * 1024) $tolak('Logo maksimal 2 MB.');
        $info = @getimagesizefromstring($biner);
        if (!$info || !in_array($info[2], [IMAGETYPE_PNG, IMAGETYPE_JPEG], true)) $tolak('Berkas logo bukan gambar PNG/JPG yang valid.');
        if ($info[0] < 32 || $info[1] < 32 || $info[0] > 4000 || $info[1] > 4000) $tolak('Ukuran logo harus antara 32 dan 4000 piksel.');
        $nama = 'logo_sekolah_' . time() . '_' . \Illuminate\Support\Str::lower(\Illuminate\Support\Str::random(6)) . ($info[2] === IMAGETYPE_PNG ? '.png' : '.jpg');
        \Illuminate\Support\Facades\Storage::disk('public')->put('logo/' . $nama, $biner);
        return '/storage/logo/' . $nama;
    }

    private function hapusBerkasLogo(?string $url): void
    {
        if ($url && str_starts_with($url, '/storage/logo/')) {
            \Illuminate\Support\Facades\Storage::disk('public')->delete('logo/' . basename($url));
        }
    }

    /** Nama berkas ikon → ukuran sisi (px). Nama sama dengan ikon bawaan di apps/web/public/icons. */
    public const IKON = ['favicon-32' => 32, 'apple-touch-icon' => 180, 'icon-192' => 192, 'icon-512' => 512, 'icon-maskable-512' => 512];

    private function simpanIkon(array $ikon): void
    {
        $tolak = fn(string $pesan) => throw \Illuminate\Validation\ValidationException::withMessages(['ikon_aplikasi' => $pesan]);
        $berkas = [];
        foreach (self::IKON as $nama => $sisi) {
            $dataUrl = $ikon[$nama] ?? null;
            if (!is_string($dataUrl) || !str_starts_with($dataUrl, 'data:image/png;base64,')) $tolak("Ikon {$nama} harus berupa PNG.");
            $biner = base64_decode(substr($dataUrl, 22), true);
            $info = $biner !== false ? @getimagesizefromstring($biner) : false;
            if (!$info || $info[2] !== IMAGETYPE_PNG || $info[0] !== $sisi || $info[1] !== $sisi) $tolak("Ikon {$nama} harus PNG {$sisi}×{$sisi} piksel.");
            $berkas[$nama] = $biner;
        }
        $disk = \Illuminate\Support\Facades\Storage::disk('public');
        foreach ($berkas as $nama => $biner) $disk->put("ikon/{$nama}.png", $biner);
    }

    private function ikonLengkap(): bool
    {
        $disk = \Illuminate\Support\Facades\Storage::disk('public');
        foreach (array_keys(self::IKON) as $nama) if (!$disk->exists("ikon/{$nama}.png")) return false;
        return true;
    }

    private function hapusIkon(): void
    {
        \Illuminate\Support\Facades\Storage::disk('public')->delete(array_map(fn($n) => "ikon/{$n}.png", array_keys(self::IKON)));
    }

    /**
     * Ikon aplikasi (publik): logo sekolah bila diaktifkan admin, selain itu dialihkan ke ikon bawaan aplikasi web.
     * Dipakai favicon, manifest PWA, apple-touch-icon, dan merek di sidebar.
     */
    public function ikon(string $nama)
    {
        $nama = preg_replace('/\.png$/', '', $nama);
        abort_unless(isset(self::IKON[$nama]), 404);
        $disk = \Illuminate\Support\Facades\Storage::disk('public');
        if (SchoolSetting::first()?->ikon_dari_logo && $disk->exists("ikon/{$nama}.png")) {
            return response()->file($disk->path("ikon/{$nama}.png"), ['Content-Type' => 'image/png', 'Cache-Control' => 'public, max-age=300']);
        }
        // Location relatif: API berada di balik proxy Next.js, jadi tujuan diselesaikan peramban di domain yang sama
        return response('', 302, ['Location' => "/icons/{$nama}.png", 'Cache-Control' => 'public, max-age=300']);
    }

    /** Logo resmi sekolah untuk kop dokumen & halaman masuk (publik, tanpa login; 404 bila belum diunggah). */
    public function logo()
    {
        $url = SchoolSetting::first()?->logo_sekolah_url;
        $disk = \Illuminate\Support\Facades\Storage::disk('public');
        $relatif = $url ? 'logo/' . basename($url) : null;
        if (!$relatif || !$disk->exists($relatif)) abort(404, 'Logo sekolah belum diunggah.');
        return response()->file($disk->path($relatif), ['Cache-Control' => 'public, max-age=300']);
    }
}

<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\SchoolSetting;
use Illuminate\Http\Request;

class SchoolSettingController extends Controller
{
    public function show()
    {
        $setting = SchoolSetting::first();
        // Jika belum ada data, buatkan default kosong
        if (!$setting) {
            $setting = SchoolSetting::create(['nama_sekolah' => 'Nama Sekolah Default']);
        }
        return response()->json($setting);
    }

    public function update(Request $request)
    {
        $setting = SchoolSetting::first();
        
        $request->validate([
            'openkey_base_url' => 'nullable|url:https|max:255',
            'openkey_model_name' => 'nullable|string|max:100',
            'ai_model_name' => 'nullable|string|max:100',
            'no_wa_kepsek' => 'nullable|string|max:30',
            'id_wa_group_guru' => 'nullable|string|max:100',
            'status_wa_api' => 'nullable|boolean',
        ]);

        $data = $request->except(['ttd_kepsek_base64']);
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
}
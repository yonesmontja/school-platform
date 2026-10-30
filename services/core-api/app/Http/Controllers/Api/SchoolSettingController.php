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
        
        $data = $request->except('ttd_kepsek_base64');
        
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
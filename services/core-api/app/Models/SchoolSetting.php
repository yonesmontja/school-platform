<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class SchoolSetting extends Model
{
    protected $fillable = [
        'nama_sekolah',
        'alamat_sekolah',
        'kota',
        'nama_kepsek',
        'nip_kepsek',
        'npsn',
        'ttd_kepsek_url',
        'api_key_gemini',
        'ai_model_name',
    ];

    // API key tidak pernah dikirim ke frontend; cukup status sudah diisi atau belum
    protected $hidden = [
        'api_key_gemini',
    ];

    protected $appends = [
        'has_api_key_gemini',
    ];

    protected $casts = [
        'api_key_gemini' => 'encrypted',
    ];

    public function getHasApiKeyGeminiAttribute(): bool
    {
        return !empty($this->attributes['api_key_gemini']);
    }
}

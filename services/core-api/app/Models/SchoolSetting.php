<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class SchoolSetting extends Model
{
    // Kolom rahasia (API key AI & token WhatsApp): disimpan terenkripsi dan tidak pernah dikirim ke frontend
    public const API_KEY_FIELDS = [
        'api_key_gemini',
        'api_key_qwen',
        'api_key_claude',
        'api_key_deepseek',
        'api_key_openkey',
        'wa_api_token',
    ];

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
        'api_key_qwen',
        'api_key_claude',
        'api_key_deepseek',
        'api_key_openkey',
        'openkey_base_url',
        'openkey_model_name',
        'no_wa_kepsek',
        'no_wa_admin',
        'id_wa_group_guru',
        'status_wa_api',
        'wa_api_token',
        'kktp_cukup',
        'kktp_baik',
        'kktp_sangat_baik',
        'skala_kokurikuler',
        'batas_nilai_remedial',
    ];

    protected $hidden = self::API_KEY_FIELDS;

    // Frontend cukup tahu status sudah diisi atau belum
    protected $appends = [
        'has_api_key_gemini',
        'has_api_key_qwen',
        'has_api_key_claude',
        'has_api_key_deepseek',
        'has_api_key_openkey',
        'has_wa_api_token',
    ];

    protected $casts = [
        'api_key_gemini' => 'encrypted',
        'api_key_qwen' => 'encrypted',
        'api_key_claude' => 'encrypted',
        'api_key_deepseek' => 'encrypted',
        'api_key_openkey' => 'encrypted',
        'wa_api_token' => 'encrypted',
        'status_wa_api' => 'boolean',
        'kktp_cukup' => 'integer',
        'kktp_baik' => 'integer',
        'kktp_sangat_baik' => 'integer',
    ];

    private function hasKey(string $field): bool
    {
        return !empty($this->attributes[$field]);
    }

    public function getHasApiKeyGeminiAttribute(): bool { return $this->hasKey('api_key_gemini'); }
    public function getHasApiKeyQwenAttribute(): bool { return $this->hasKey('api_key_qwen'); }
    public function getHasApiKeyClaudeAttribute(): bool { return $this->hasKey('api_key_claude'); }
    public function getHasApiKeyDeepseekAttribute(): bool { return $this->hasKey('api_key_deepseek'); }
    public function getHasApiKeyOpenkeyAttribute(): bool { return $this->hasKey('api_key_openkey'); }
    public function getHasWaApiTokenAttribute(): bool { return $this->hasKey('wa_api_token'); }
}

<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class SuratDisposisi extends Model
{
    protected $table = 'surat_disposisi';

    protected $fillable = ['id_surat_masuk', 'dari_user', 'kepada_user', 'instruksi', 'batas_waktu', 'status', 'dibaca_at', 'selesai_at', 'tindak_lanjut'];

    protected $casts = ['batas_waktu' => 'date:Y-m-d', 'dibaca_at' => 'datetime', 'selesai_at' => 'datetime'];

    public function surat(): BelongsTo { return $this->belongsTo(SuratMasuk::class, 'id_surat_masuk'); }
    public function dari(): BelongsTo { return $this->belongsTo(User::class, 'dari_user'); }
    public function kepada(): BelongsTo { return $this->belongsTo(User::class, 'kepada_user'); }
}

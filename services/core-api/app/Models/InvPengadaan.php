<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class InvPengadaan extends Model
{
    protected $table = 'inv_pengadaan';

    protected $fillable = [
        'judul', 'tanggal', 'rincian', 'total', 'alasan', 'status', 'catatan_keputusan', 'diajukan_oleh', 'diputuskan_oleh',
        'diputuskan_at', 'selesai_at', 'id_kas',
    ];

    protected $casts = ['rincian' => 'array', 'total' => 'integer', 'tanggal' => 'date:Y-m-d', 'diputuskan_at' => 'datetime', 'selesai_at' => 'datetime'];

    public function pengaju(): BelongsTo { return $this->belongsTo(User::class, 'diajukan_oleh'); }
    public function pemutus(): BelongsTo { return $this->belongsTo(User::class, 'diputuskan_oleh'); }
}

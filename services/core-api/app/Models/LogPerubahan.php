<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** Rincian perubahan satu record dalam sebuah log aktivitas: nilai sebelum dan sesudah. */
class LogPerubahan extends Model
{
    protected $table = 'log_perubahan';
    public $timestamps = false;
    protected $guarded = ['id'];

    protected $casts = [
        'data_lama' => 'array',
        'data_baru' => 'array',
    ];

    public function log(): BelongsTo { return $this->belongsTo(LogAktivitas::class, 'id_log'); }
}

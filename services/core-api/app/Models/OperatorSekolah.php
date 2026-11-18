<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** Penunjukan operator administrasi oleh kepala sekolah (Fase 26 Tahap A). */
class OperatorSekolah extends Model
{
    protected $table = 'operator_sekolah';

    protected $fillable = ['id_user', 'submodul', 'catatan', 'ditunjuk_oleh'];

    protected $casts = ['submodul' => 'array'];

    public function user(): BelongsTo { return $this->belongsTo(User::class, 'id_user'); }
    public function penunjuk(): BelongsTo { return $this->belongsTo(User::class, 'ditunjuk_oleh'); }
}

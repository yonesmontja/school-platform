<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** Satu versi (seperti commit) dari sebuah objek; lihat App\Services\VersiCatatan. */
class TransVersi extends Model
{
    protected $table = 'trans_versi';
    public const UPDATED_AT = null;

    protected $fillable = ['entitas', 'id_entitas', 'versi', 'isi', 'keterangan', 'dibuat_oleh'];
    protected $casts = ['isi' => 'array', 'versi' => 'integer'];

    public function penulis(): BelongsTo { return $this->belongsTo(User::class, 'dibuat_oleh'); }
}

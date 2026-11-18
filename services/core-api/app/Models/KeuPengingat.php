<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class KeuPengingat extends Model
{
    protected $table = 'keu_pengingat';

    protected $fillable = ['id_siswa', 'total_tunggakan', 'cara', 'dikirim_oleh'];

    protected $casts = ['total_tunggakan' => 'integer'];

    public function pengirim(): BelongsTo
    {
        return $this->belongsTo(User::class, 'dikirim_oleh');
    }
}

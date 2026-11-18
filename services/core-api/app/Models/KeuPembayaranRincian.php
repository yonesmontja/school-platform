<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class KeuPembayaranRincian extends Model
{
    protected $table = 'keu_pembayaran_rincian';

    public $timestamps = false;

    protected $fillable = ['id_pembayaran', 'id_tagihan', 'jumlah'];

    protected $casts = ['jumlah' => 'integer'];

    public function pembayaran(): BelongsTo
    {
        return $this->belongsTo(KeuPembayaran::class, 'id_pembayaran');
    }

    public function tagihan(): BelongsTo
    {
        return $this->belongsTo(KeuTagihan::class, 'id_tagihan');
    }
}

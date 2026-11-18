<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class InvStokMutasi extends Model
{
    protected $table = 'inv_stok_mutasi';

    protected $fillable = ['id_stok', 'tanggal', 'arah', 'jumlah', 'keterangan', 'dicatat_oleh'];

    protected $casts = ['jumlah' => 'integer', 'tanggal' => 'date:Y-m-d'];

    public function stok(): BelongsTo { return $this->belongsTo(InvStok::class, 'id_stok'); }
    public function pencatat(): BelongsTo { return $this->belongsTo(User::class, 'dicatat_oleh'); }
}

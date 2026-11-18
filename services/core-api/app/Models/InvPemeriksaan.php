<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class InvPemeriksaan extends Model
{
    protected $table = 'inv_pemeriksaan';

    protected $fillable = ['id_barang', 'tanggal', 'kondisi', 'catatan', 'oleh'];

    protected $casts = ['tanggal' => 'date:Y-m-d'];

    public function pemeriksa(): BelongsTo { return $this->belongsTo(User::class, 'oleh'); }
}

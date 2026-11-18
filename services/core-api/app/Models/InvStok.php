<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

/** Barang habis pakai (ATK, kapur, kertas, sabun, …). */
class InvStok extends Model
{
    protected $table = 'inv_stok';

    protected $fillable = ['nama', 'kategori', 'satuan', 'stok', 'stok_minimum', 'keterangan', 'aktif'];

    protected $casts = ['stok' => 'integer', 'stok_minimum' => 'integer', 'aktif' => 'boolean'];

    public function mutasi(): HasMany { return $this->hasMany(InvStokMutasi::class, 'id_stok'); }
}

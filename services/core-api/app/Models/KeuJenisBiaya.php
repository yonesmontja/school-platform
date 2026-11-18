<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

/** Jenis biaya sekolah (SPP, uang pangkal, kegiatan, …) — Administrasi Tahap C. */
class KeuJenisBiaya extends Model
{
    protected $table = 'keu_jenis_biaya';

    protected $fillable = ['nama', 'periode', 'nominal', 'keterangan', 'aktif'];

    protected $casts = ['nominal' => 'integer', 'aktif' => 'boolean'];

    public function tagihan(): HasMany
    {
        return $this->hasMany(KeuTagihan::class, 'id_jenis_biaya');
    }
}

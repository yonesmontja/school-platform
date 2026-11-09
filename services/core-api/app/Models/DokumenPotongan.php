<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/** Potongan teks dokumen rujukan (± 1.500 karakter) yang dicari dengan full-text search. */
class DokumenPotongan extends Model
{
    protected $table = 'dokumen_potongan';
    public $timestamps = false;
    protected $fillable = ['id_dokumen', 'urutan', 'teks'];
    protected $hidden = ['cari'];
}

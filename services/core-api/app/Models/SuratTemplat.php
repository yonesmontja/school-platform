<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class SuratTemplat extends Model
{
    protected $table = 'surat_templat';

    protected $fillable = ['nama', 'kode_klasifikasi', 'perihal', 'isi', 'aktif'];

    protected $casts = ['aktif' => 'boolean'];
}

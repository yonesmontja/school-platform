<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/** Templat naskah Studio Rakit Video yang disimpan sekolah untuk dipakai ulang. */
class TemplatVideo extends Model
{
    public const KATEGORI = ['PEMBELAJARAN', 'PROMOSI', 'PENGUMUMAN', 'HARI_BESAR', 'PRESTASI', 'LAINNYA'];

    protected $table = 'templat_video';
    protected $primaryKey = 'id_templat';
    public $incrementing = false;
    protected $keyType = 'string';
    protected $fillable = ['id_templat', 'judul', 'kategori', 'deskripsi', 'rasio', 'naskah', 'dibuat_oleh'];
    protected $casts = ['naskah' => 'array'];
}

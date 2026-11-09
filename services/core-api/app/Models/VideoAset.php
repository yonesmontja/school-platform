<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/** Gambar/audio yang diunggah di Studio Rakit Video, beserta penanda foto siswa & izin orang tua. */
class VideoAset extends Model
{
    protected $table = 'video_aset';
    protected $fillable = ['path', 'jenis', 'nama_asli', 'foto_siswa', 'izin_ortu', 'diunggah_oleh'];
    protected $casts = ['foto_siswa' => 'boolean', 'izin_ortu' => 'boolean'];
}

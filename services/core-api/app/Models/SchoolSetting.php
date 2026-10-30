<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class SchoolSetting extends Model
{
    protected $fillable = [
        'nama_sekolah',
        'alamat_sekolah',
        'kota',
        'nama_kepsek',
        'nip_kepsek',
        'npsn',
        'ttd_kepsek_url'
    ];
}

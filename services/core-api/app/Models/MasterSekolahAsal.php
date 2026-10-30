<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class MasterSekolahAsal extends Model
{
    use HasFactory;

    protected $table = 'master_sekolah_asal';
    protected $primaryKey = 'id_sekolah_asal';
    public $incrementing = false;
    protected $keyType = 'string';

    protected $fillable = [
        'id_sekolah_asal', 'npsn_sekolah', 'nama_sekolah', 'jenjang_sekolah', 'alamat_sekolah'
    ];
}
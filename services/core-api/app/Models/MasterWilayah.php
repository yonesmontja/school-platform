<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class MasterWilayah extends Model
{
    use HasFactory;

    protected $table = 'master_wilayah';
    protected $primaryKey = 'id_wilayah';
    public $incrementing = false;
    protected $keyType = 'string';

    protected $fillable = [
        'id_wilayah', 'provinsi', 'kabupaten_kota', 'kecamatan', 'kelurahan_desa', 'kode_pos'
    ];
}
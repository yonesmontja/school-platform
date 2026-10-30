<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class MasterOrtu extends Model
{
    use HasFactory;

    protected $table = 'master_ortu';
    protected $primaryKey = 'id_ortu';
    public $incrementing = false;
    protected $keyType = 'string';

    protected $fillable = [
        'id_ortu', 'nama_ayah', 'id_pekerjaan_ayah', 'nama_ibu', 'id_pekerjaan_ibu', 'jalan_ortu', 'id_wilayah_ortu', 'no_wa'
    ];
}
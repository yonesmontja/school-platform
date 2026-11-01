<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class MasterRuangan extends Model
{
    protected $table = 'master_ruangan';
    protected $primaryKey = 'id_ruangan';
    public $incrementing = false;
    protected $keyType = 'string';

    protected $fillable = ['id_ruangan', 'nama_ruangan', 'kapasitas', 'keterangan'];

    protected $casts = ['kapasitas' => 'integer'];
}

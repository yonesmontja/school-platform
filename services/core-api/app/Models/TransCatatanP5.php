<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class TransCatatanP5 extends Model
{
    protected $table = 'trans_catatan_p5';
    protected $primaryKey = 'id_catatan_p5';
    public $incrementing = false;
    protected $keyType = 'string';

    protected $fillable = ['id_catatan_p5', 'id_siswa', 'id_proyek', 'catatan_proses'];
}

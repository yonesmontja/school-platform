<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class TransNilaiP5 extends Model
{
    protected $table = 'trans_nilai_p5';
    protected $primaryKey = 'id_nilaip5';
    public $incrementing = false;
    protected $keyType = 'string';

    protected $fillable = ['id_nilaip5', 'id_periode', 'id_kelas', 'id_proyek', 'id_siswa', 'id_target', 'skor_rata2', 'predikat'];

    protected $casts = ['skor_rata2' => 'float'];
}

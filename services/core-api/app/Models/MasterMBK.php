<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;

class MasterMBK extends Model {
    protected $table = 'master_mbk';
    protected $primaryKey = 'id_jenis';
    public $incrementing = false;
    protected $keyType = 'string';
    protected $fillable = ['id_jenis', 'kategori_penilaian', 'jenis_asesmen', 'keterangan', 'mat_S', 'mat_T', 'mat_N', 'mat_K', 'mat_M'];
}
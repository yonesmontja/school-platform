<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;

class MasterPeriode extends Model {
    protected $table = 'master_periode';
    protected $primaryKey = 'id_periode';
    public $incrementing = false;
    protected $keyType = 'string';
    protected $fillable = ['id_periode', 'tahun_ajaran', 'semester', 'status_aktif'];
}
<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class MasterPekerjaan extends Model
{
    use HasFactory;

    protected $table = 'master_pekerjaan';
    protected $primaryKey = 'id_pekerjaan';
    public $incrementing = false;
    protected $keyType = 'string';

    protected $fillable = ['id_pekerjaan', 'nama_pekerjaan'];
}
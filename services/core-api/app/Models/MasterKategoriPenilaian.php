<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;

class MasterKategoriPenilaian extends Model {
    protected $table = 'master_kategori_penilaian';
    protected $primaryKey = 'id_kategori';
    public $incrementing = false;
    protected $keyType = 'string';
    protected $fillable = ['id_kategori', 'nama_kategori', 'keterangan'];
}
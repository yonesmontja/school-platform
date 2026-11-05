<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class MasterWali extends Model
{
    use HasFactory;

    protected $table = 'master_wali';
    protected $primaryKey = 'id_wali';
    public $incrementing = false;
    protected $keyType = 'string';

    protected $fillable = [
        'id_wali', 'nama_wali', 'id_pekerjaan_wali', 'jalan_wali', 'id_wilayah_wali', 'no_wa'
    ];

    public function anak()
    {
        return $this->hasMany(Student::class, 'id_wali', 'id_wali');
    }

    // Akun portal orang tua/wali yang terhubung (bila sudah dibuat di Manajemen Pengguna)
    public function akun()
    {
        return $this->hasOne(User::class, 'id_wali', 'id_wali');
    }
}

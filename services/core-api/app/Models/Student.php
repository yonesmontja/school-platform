<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Student extends Model
{
    use HasFactory;

    protected $table = 'students';
    protected $primaryKey = 'id_siswa';
    public $incrementing = false;
    protected $keyType = 'string';

    protected $fillable = [
        'id_siswa', 'nisn', 'nama_siswa', 'panggilan', 'id_kelas',
        'jenis_kelamin', 'tempat_lahir', 'tgl_lahir', 'id_suku',
        'id_agama', 'id_sekolah_asal', 'status_tempat_tinggal',
        'jalan_siswa', 'id_wilayah_siswa', 'id_ortu', 'id_wali', 'no_wa',
    ];

    // Relasi ke Kelas
    public function kelas(): BelongsTo
    {
        return $this->belongsTo(Classes::class, 'id_kelas', 'id_kelas');
    }

    // Relasi ke Suku
    public function suku(): BelongsTo
    {
        return $this->belongsTo(MasterSuku::class, 'id_suku', 'id_suku');
    }

    // Relasi ke Agama
    public function agama(): BelongsTo
    {
        return $this->belongsTo(MasterAgama::class, 'id_agama', 'id_agama');
    }

    // Relasi ke Sekolah Asal
    public function sekolahAsal(): BelongsTo
    {
        return $this->belongsTo(MasterSekolahAsal::class, 'id_sekolah_asal', 'id_sekolah_asal');
    }

    // Relasi ke Wilayah
    public function wilayah(): BelongsTo
    {
        return $this->belongsTo(MasterWilayah::class, 'id_wilayah_siswa', 'id_wilayah');
    }

    // Relasi ke Orang Tua
    public function ortu(): BelongsTo
    {
        return $this->belongsTo(MasterOrtu::class, 'id_ortu', 'id_ortu');
    }

    // Relasi ke Wali
    public function wali(): BelongsTo
    {
        return $this->belongsTo(MasterWali::class, 'id_wali', 'id_wali');
    }
}
<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class TransPresensi extends Model
{
    protected $table = 'trans_presensi';
    protected $primaryKey = 'id_presensi';
    public $incrementing = false;
    protected $keyType = 'string';

    protected $fillable = ['id_presensi', 'tanggal', 'id_siswa', 'id_kelas', 'id_periode', 'status_kehadiran'];

    protected $casts = ['tanggal' => 'date:Y-m-d'];

    public function siswa(): BelongsTo { return $this->belongsTo(Student::class, 'id_siswa', 'id_siswa'); }
}

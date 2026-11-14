<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** Presensi per mapel oleh guru mapel. Rapor tetap memakai presensi harian (TransPresensi). */
class TransPresensiMapel extends Model
{
    protected $table = 'trans_presensi_mapel';
    protected $primaryKey = 'id_presensi_mapel';
    public $incrementing = false;
    protected $keyType = 'string';

    protected $fillable = [
        'id_presensi_mapel', 'tanggal', 'id_mapel', 'id_kelas', 'id_periode', 'id_siswa', 'id_jadwal',
        'status_kehadiran', 'keterangan', 'id_jurnal', 'id_guru', 'dicatat_oleh',
    ];

    protected $casts = ['tanggal' => 'date:Y-m-d'];

    public function siswa(): BelongsTo { return $this->belongsTo(Student::class, 'id_siswa', 'id_siswa'); }
    public function mapel(): BelongsTo { return $this->belongsTo(Subject::class, 'id_mapel', 'id_mapel'); }
}

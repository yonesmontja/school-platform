<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class TransNilai extends Model
{
    protected $table = 'trans_nilai';
    protected $primaryKey = 'id_nilai';
    public $incrementing = false;
    protected $keyType = 'string';

    protected $fillable = [
        'id_nilai', 'tanggal', 'id_siswa', 'id_mapel', 'id_guru', 
        'id_periode', 'id_jenis', 'id_materi', 'id_kelas', 'nilai',
        'poin_S', 'poin_T', 'poin_N', 'poin_K', 'poin_M', 'metode_stnkm'
    ];

    public function siswa(): BelongsTo { return $this->belongsTo(Student::class, 'id_siswa', 'id_siswa'); }
    public function mapel(): BelongsTo { return $this->belongsTo(Subject::class, 'id_mapel', 'id_mapel'); }
    public function periode(): BelongsTo { return $this->belongsTo(MasterPeriode::class, 'id_periode', 'id_periode'); }
    public function jenis(): BelongsTo { return $this->belongsTo(MasterMBK::class, 'id_jenis', 'id_jenis'); }
    public function materi(): BelongsTo { return $this->belongsTo(MasterMateri::class, 'id_materi', 'id_materi'); }
    public function kelas(): BelongsTo { return $this->belongsTo(Classes::class, 'id_kelas', 'id_kelas'); }
}
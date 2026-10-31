<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class TransJurnal extends Model
{
    protected $table = 'trans_jurnal';
    protected $primaryKey = 'id_jurnal';
    public $incrementing = false;
    protected $keyType = 'string';

    protected $fillable = [
        'id_jurnal', 'tanggal', 'id_siswa', 'id_kelas', 'id_guru',
        'id_jenis', 'id_materi', 'narasi_kejadian', 'lampiran_url',
        'mode_dampak', 'val_S', 'val_T', 'val_N', 'val_K', 'val_M',
        'ai_mode', 'ai_raw_response'
    ];

    protected $casts = [
        'tanggal' => 'date:Y-m-d',
        'val_S' => 'float',
        'val_T' => 'float',
        'val_N' => 'float',
        'val_K' => 'float',
        'val_M' => 'float',
    ];

    public function siswa(): BelongsTo { return $this->belongsTo(Student::class, 'id_siswa', 'id_siswa'); }
    public function kelas(): BelongsTo { return $this->belongsTo(Classes::class, 'id_kelas', 'id_kelas'); }
    public function guru(): BelongsTo { return $this->belongsTo(Teacher::class, 'id_guru', 'id_guru'); }
    public function jenis(): BelongsTo { return $this->belongsTo(MasterMBK::class, 'id_jenis', 'id_jenis'); }
    public function materi(): BelongsTo { return $this->belongsTo(MasterMateri::class, 'id_materi', 'id_materi'); }
}

<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class MasterTargetP5 extends Model
{
    protected $table = 'master_target_p5';
    protected $primaryKey = 'id_target';
    public $incrementing = false;
    protected $keyType = 'string';

    protected $fillable = ['id_target', 'id_proyek', 'id_kategori', 'dimensi', 'elemen', 'sub_elemen', 'capaian_akhir_fase', 'relasi_stnkm'];

    public function proyek(): BelongsTo { return $this->belongsTo(MasterProyek::class, 'id_proyek', 'id_proyek'); }
}

<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** Nilai 0-100 satu indikator dalam satu baris trans_nilai (sesi penilaian siswa). */
class TransNilaiIndikator extends Model {
    protected $table = 'trans_nilai_indikator';
    protected $fillable = ['id_nilai', 'id_indikator', 'nilai'];
    protected $casts = ['nilai' => 'float'];

    public function indikator(): BelongsTo { return $this->belongsTo(MasterIndikator::class, 'id_indikator', 'id_indikator'); }
}

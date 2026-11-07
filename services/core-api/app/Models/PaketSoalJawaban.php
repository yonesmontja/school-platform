<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** Jawaban dan skor satu siswa untuk satu paket soal. */
class PaketSoalJawaban extends Model
{
    protected $table = 'paket_soal_jawaban';
    protected $fillable = ['id_paket', 'id_siswa', 'jawaban', 'skor_manual', 'skor', 'total', 'nilai', 'lengkap', 'foto', 'dikoreksi_oleh'];
    protected $casts = [
        'jawaban' => 'array', 'skor_manual' => 'array', 'skor' => 'array', 'foto' => 'array',
        'total' => 'float', 'nilai' => 'float', 'lengkap' => 'boolean',
    ];

    public function siswa(): BelongsTo { return $this->belongsTo(Student::class, 'id_siswa', 'id_siswa'); }
}

<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** Jawaban dan skor satu siswa untuk satu paket soal. */
class PaketSoalJawaban extends Model
{
    protected $table = 'paket_soal_jawaban';
    protected $fillable = [
        'id_paket', 'id_siswa', 'jawaban', 'skor_manual', 'skor', 'total', 'nilai', 'lengkap', 'foto', 'dikoreksi_oleh',
        'sumber', 'mulai_pada', 'selesai_pada', 'terakhir_aktif', 'urutan', 'pelanggaran',
    ];
    protected $casts = [
        'jawaban' => 'array', 'skor_manual' => 'array', 'skor' => 'array', 'foto' => 'array',
        'total' => 'float', 'nilai' => 'float', 'lengkap' => 'boolean',
        'urutan' => 'array', 'mulai_pada' => 'datetime', 'selesai_pada' => 'datetime', 'terakhir_aktif' => 'datetime', 'pelanggaran' => 'integer',
    ];

    /** Tes online yang sedang dikerjakan belum boleh dinilai, dikirim, atau dianalisis. */
    public function sedangDikerjakan(): bool
    {
        return $this->sumber === 'ONLINE' && $this->selesai_pada === null;
    }

    public function siswa(): BelongsTo { return $this->belongsTo(Student::class, 'id_siswa', 'id_siswa'); }
}

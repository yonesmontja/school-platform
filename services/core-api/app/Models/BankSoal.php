<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Satu butir soal. Isi & kunci bergantung bentuk (lihat App\Services\BankSoalService::normalisasi).
 * Alur status: DRAF → DIAJUKAN → DISETUJUI, atau REVISI (dengan catatan kepala sekolah) → diajukan lagi.
 */
class BankSoal extends Model
{
    protected $table = 'bank_soal';
    protected $primaryKey = 'id_soal';
    public $incrementing = false;
    protected $keyType = 'string';

    public const BENTUK = ['PG', 'PG_KOMPLEKS', 'BENAR_SALAH', 'ISIAN', 'URAIAN', 'MENJODOHKAN', 'MENGURUTKAN', 'LENGKAPI_GAMBAR', 'MEMBACA_NYARING'];
    public const LEVEL = ['C1', 'C2', 'C3', 'C4', 'C5', 'C6'];
    public const KESULITAN = ['MUDAH', 'SEDANG', 'SULIT'];
    public const STATUS = ['DRAF', 'DIAJUKAN', 'DISETUJUI', 'REVISI'];
    public const DIMENSI = ['S', 'T', 'N', 'K', 'M'];

    protected $fillable = [
        'id_soal', 'id_mapel', 'id_kelas', 'id_materi', 'id_indikator', 'id_kisi_baris',
        'bentuk', 'level_kognitif', 'tingkat_kesulitan', 'dim_S', 'dim_T', 'dim_N', 'dim_K', 'dim_M',
        'pertanyaan', 'gambar_svg', 'gambar_url', 'isi', 'kunci', 'rubrik', 'pembahasan', 'skor_maks',
        'status', 'catatan_revisi', 'versi', 'sumber', 'ai_mode', 'dibuat_oleh', 'disetujui_oleh', 'disetujui_pada',
    ];

    protected $casts = [
        'isi' => 'array',
        'kunci' => 'array',
        'dim_S' => 'float', 'dim_T' => 'float', 'dim_N' => 'float', 'dim_K' => 'float', 'dim_M' => 'float',
        'skor_maks' => 'integer',
        'versi' => 'integer',
        'disetujui_pada' => 'datetime',
    ];

    public function mapel(): BelongsTo { return $this->belongsTo(Subject::class, 'id_mapel', 'id_mapel'); }
    public function kelas(): BelongsTo { return $this->belongsTo(Classes::class, 'id_kelas', 'id_kelas'); }
    public function materi(): BelongsTo { return $this->belongsTo(MasterMateri::class, 'id_materi', 'id_materi'); }
    public function indikator(): BelongsTo { return $this->belongsTo(MasterIndikator::class, 'id_indikator', 'id_indikator'); }
    public function pembuat(): BelongsTo { return $this->belongsTo(User::class, 'dibuat_oleh'); }
    public function penyetuju(): BelongsTo { return $this->belongsTo(User::class, 'disetujui_oleh'); }
}

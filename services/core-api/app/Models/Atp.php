<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/** Alur Tujuan Pembelajaran per mapel, kelas, dan periode; Draf → Diajukan → Disetujui / Perlu revisi. */
class Atp extends Model
{
    public const STATUS = ['DRAF', 'DIAJUKAN', 'DISETUJUI', 'REVISI'];
    // Dimensi Profil Lulusan (Pembelajaran Mendalam)
    public const PROFIL_LULUSAN = ['Keimanan dan Ketakwaan', 'Kewargaan', 'Penalaran Kritis', 'Kreativitas', 'Kolaborasi', 'Kemandirian', 'Kesehatan', 'Komunikasi'];

    protected $table = 'atp';
    protected $primaryKey = 'id_atp';
    public $incrementing = false;
    protected $keyType = 'string';
    protected $fillable = [
        'id_atp', 'judul', 'id_mapel', 'id_kelas', 'id_periode', 'fase', 'jp_per_minggu', 'minggu_efektif',
        'status', 'catatan_revisi', 'versi', 'sumber', 'ai_mode', 'dibuat_oleh', 'disetujui_oleh', 'disetujui_pada',
    ];
    protected $casts = ['jp_per_minggu' => 'integer', 'minggu_efektif' => 'integer', 'versi' => 'integer', 'disetujui_pada' => 'datetime'];

    public function baris(): HasMany { return $this->hasMany(AtpBaris::class, 'id_atp', 'id_atp')->orderBy('urutan'); }
    public function mapel(): BelongsTo { return $this->belongsTo(Subject::class, 'id_mapel', 'id_mapel'); }
    public function kelas(): BelongsTo { return $this->belongsTo(Classes::class, 'id_kelas', 'id_kelas'); }
    public function periode(): BelongsTo { return $this->belongsTo(MasterPeriode::class, 'id_periode', 'id_periode'); }
    public function pembuat(): BelongsTo { return $this->belongsTo(User::class, 'dibuat_oleh'); }
    public function penyetuju(): BelongsTo { return $this->belongsTo(User::class, 'disetujui_oleh'); }
}

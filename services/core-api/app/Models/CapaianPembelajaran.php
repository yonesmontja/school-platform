<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** Capaian Pembelajaran (CP) resmi per mapel, fase (A: kelas 1–2, B: 3–4, C: 5–6), dan elemen. */
class CapaianPembelajaran extends Model
{
    public const FASE = ['A', 'B', 'C'];

    protected $table = 'capaian_pembelajaran';
    protected $primaryKey = 'id_cp';
    public $incrementing = false;
    protected $keyType = 'string';
    protected $fillable = ['id_cp', 'id_mapel', 'fase', 'elemen', 'teks', 'urutan', 'dibuat_oleh'];
    protected $casts = ['urutan' => 'integer'];

    public function mapel(): BelongsTo { return $this->belongsTo(Subject::class, 'id_mapel', 'id_mapel'); }

    /** Fase SD dari nama kelas ("4A" → B). */
    public static function faseKelas(?string $namaKelas): ?string
    {
        if (!$namaKelas || !preg_match('/\d+/', $namaKelas, $m)) return null;
        $t = (int) $m[0];
        return $t >= 1 && $t <= 2 ? 'A' : ($t <= 4 && $t >= 3 ? 'B' : ($t >= 5 && $t <= 6 ? 'C' : null));
    }
}

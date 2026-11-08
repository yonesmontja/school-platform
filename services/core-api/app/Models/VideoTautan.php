<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** Tautan video ke modul ajar (per pertemuan) atau sesi jadwal. */
class VideoTautan extends Model
{
    public const JENIS = ['MODUL', 'JADWAL'];

    protected $table = 'video_tautan';
    public bool $tanpaAudit = true;
    protected $fillable = ['id_video', 'jenis', 'id_target', 'pertemuan_ke', 'urutan'];
    protected $casts = ['pertemuan_ke' => 'integer', 'urutan' => 'integer'];

    public function video(): BelongsTo { return $this->belongsTo(VideoBelajar::class, 'id_video', 'id_video'); }
}

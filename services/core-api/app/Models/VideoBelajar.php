<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/** Video belajar (motion graphic / unggahan); Draf → Diajukan → Disetujui / Perlu revisi. Siswa hanya melihat yang disetujui. */
class VideoBelajar extends Model
{
    public const SUMBER = ['REMOTION', 'RENDER', 'UNGGAH'];

    protected $table = 'video_belajar';
    protected $primaryKey = 'id_video';
    public $incrementing = false;
    protected $keyType = 'string';
    protected $fillable = [
        'id_video', 'judul', 'deskripsi', 'id_mapel', 'id_kelas', 'fase', 'id_materi', 'tp', 'file_url', 'poster_url',
        'durasi_detik', 'ukuran_kb', 'sumber', 'komposisi', 'props', 'narasi', 'status', 'catatan_revisi',
        'dibuat_oleh', 'disetujui_oleh', 'disetujui_pada',
    ];
    protected $casts = ['tp' => 'array', 'props' => 'array', 'durasi_detik' => 'integer', 'ukuran_kb' => 'integer', 'disetujui_pada' => 'datetime'];

    public function mapel(): BelongsTo { return $this->belongsTo(Subject::class, 'id_mapel', 'id_mapel'); }
    public function kelas(): BelongsTo { return $this->belongsTo(Classes::class, 'id_kelas', 'id_kelas'); }
    public function materi(): BelongsTo { return $this->belongsTo(MasterMateri::class, 'id_materi', 'id_materi'); }
    public function pembuat(): BelongsTo { return $this->belongsTo(User::class, 'dibuat_oleh'); }
    public function tautan(): HasMany { return $this->hasMany(VideoTautan::class, 'id_video', 'id_video'); }

    /** Data ringkas untuk ditempel di modul, jadwal, soal, dan portal. */
    public function ringkas(): array
    {
        return $this->only(['id_video', 'judul', 'file_url', 'poster_url', 'durasi_detik', 'status']);
    }
}

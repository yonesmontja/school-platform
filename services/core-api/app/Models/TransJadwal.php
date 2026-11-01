<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class TransJadwal extends Model
{
    protected $table = 'trans_jadwal';
    protected $primaryKey = 'id_jadwal';
    public $incrementing = false;
    protected $keyType = 'string';

    protected $fillable = [
        'id_jadwal', 'id_group', 'id_periode', 'id_kelas', 'id_guru', 'id_mapel', 'id_materi', 'id_ruangan',
        'judul', 'mulai', 'selesai', 'warna', 'catatan', 'lampiran_url', 'lampiran_nama', 'status_sesi',
    ];

    // Waktu lokal sekolah tanpa zona; dikirim sebagai "YYYY-MM-DDTHH:mm" agar tidak bergeser di browser
    protected $casts = [
        'mulai' => 'datetime:Y-m-d\TH:i',
        'selesai' => 'datetime:Y-m-d\TH:i',
    ];

    public function guru(): BelongsTo { return $this->belongsTo(Teacher::class, 'id_guru', 'id_guru'); }
    public function mapel(): BelongsTo { return $this->belongsTo(Subject::class, 'id_mapel', 'id_mapel'); }
    public function materi(): BelongsTo { return $this->belongsTo(MasterMateri::class, 'id_materi', 'id_materi'); }
    public function kelas(): BelongsTo { return $this->belongsTo(Classes::class, 'id_kelas', 'id_kelas'); }
    public function ruangan(): BelongsTo { return $this->belongsTo(MasterRuangan::class, 'id_ruangan', 'id_ruangan'); }
}

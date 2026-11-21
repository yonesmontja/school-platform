<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** Tindak lanjut pantauan kenaikan kelas (lihat App\Services\PantauanKenaikan). */
class TransKenaikanPantau extends Model
{
    public const JENIS = ['CATATAN', 'REMEDIAL', 'PEMBINAAN', 'PANGGIL_ORTU', 'KABARI_ORTU'];

    protected $table = 'trans_kenaikan_pantau';
    protected $fillable = ['id_siswa', 'tahun_ajaran', 'id_periode', 'jenis', 'catatan', 'tingkat', 'dibuat_oleh'];

    public function siswa(): BelongsTo { return $this->belongsTo(Student::class, 'id_siswa', 'id_siswa'); }
    public function pembuat(): BelongsTo { return $this->belongsTo(User::class, 'dibuat_oleh'); }
}

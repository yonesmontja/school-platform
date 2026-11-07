<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/** Kisi-kisi soal: rencana butir per TP (bentuk, level kognitif, dimensi STNKM, jumlah). */
class KisiKisi extends Model
{
    protected $table = 'kisi_kisi';
    protected $primaryKey = 'id_kisi';
    public $incrementing = false;
    protected $keyType = 'string';

    protected $fillable = ['id_kisi', 'judul', 'id_mapel', 'id_kelas', 'id_periode', 'catatan', 'dibuat_oleh'];

    public function baris(): HasMany { return $this->hasMany(KisiKisiBaris::class, 'id_kisi', 'id_kisi')->orderBy('urutan'); }
    public function mapel(): BelongsTo { return $this->belongsTo(Subject::class, 'id_mapel', 'id_mapel'); }
    public function kelas(): BelongsTo { return $this->belongsTo(Classes::class, 'id_kelas', 'id_kelas'); }
    public function pembuat(): BelongsTo { return $this->belongsTo(User::class, 'dibuat_oleh'); }
}

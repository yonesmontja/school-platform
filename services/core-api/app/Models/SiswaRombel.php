<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** Rombel seorang siswa pada satu semester (riwayat). Kelas saat ini tetap di students.id_kelas. */
class SiswaRombel extends Model
{
    protected $table = 'siswa_rombel';
    protected $fillable = ['id_siswa', 'id_periode', 'id_kelas'];

    public function kelas(): BelongsTo
    {
        return $this->belongsTo(Classes::class, 'id_kelas', 'id_kelas');
    }

    public function periode(): BelongsTo
    {
        return $this->belongsTo(MasterPeriode::class, 'id_periode', 'id_periode');
    }
}

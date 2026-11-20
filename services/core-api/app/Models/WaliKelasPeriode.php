<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** Wali kelas sebuah rombel pada satu semester, agar rapor semester lama tetap memuat wali saat itu. */
class WaliKelasPeriode extends Model
{
    protected $table = 'wali_kelas_periode';
    protected $fillable = ['id_kelas', 'id_periode', 'id_guru'];

    public function guru(): BelongsTo
    {
        return $this->belongsTo(Teacher::class, 'id_guru', 'id_guru');
    }
}

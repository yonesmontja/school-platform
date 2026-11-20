<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Pembagian mengajar per semester: guru yang mengampu satu mapel di satu rombel.
 * Mapel tanpa pembagian pada semester itu memakai guru bawaan di Mata Pelajaran (subjects.id_guru).
 */
class PengampuMapel extends Model
{
    protected $table = 'pengampu_mapel';
    protected $fillable = ['id_periode', 'id_kelas', 'id_mapel', 'id_guru'];

    public function guru(): BelongsTo
    {
        return $this->belongsTo(Teacher::class, 'id_guru', 'id_guru');
    }
}

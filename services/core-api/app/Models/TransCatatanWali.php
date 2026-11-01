<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class TransCatatanWali extends Model
{
    protected $table = 'trans_catatan_wali';
    protected $primaryKey = 'id_catatan_wali';
    public $incrementing = false;
    protected $keyType = 'string';

    protected $fillable = ['id_catatan_wali', 'id_siswa', 'id_periode', 'catatan_final'];

    public function siswa(): BelongsTo { return $this->belongsTo(Student::class, 'id_siswa', 'id_siswa'); }
}

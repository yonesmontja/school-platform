<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class TransPeringatanTindak extends Model
{
    protected $table = 'trans_peringatan_tindak';
    protected $fillable = ['id_siswa', 'id_periode', 'kunci_alasan', 'alasan', 'skor', 'catatan', 'dibuat_oleh'];
    protected $casts = ['alasan' => 'array', 'skor' => 'integer'];

    public function siswa(): BelongsTo { return $this->belongsTo(Student::class, 'id_siswa', 'id_siswa'); }
    public function pembuat(): BelongsTo { return $this->belongsTo(User::class, 'dibuat_oleh'); }
}

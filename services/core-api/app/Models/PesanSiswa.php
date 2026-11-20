<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PesanSiswa extends Model
{
    protected $table = 'pesan_siswa';
    protected $fillable = ['id_siswa', 'dari_user', 'peran_pengirim', 'isi'];
    // Isi pesan pribadi tidak disalin ke log perubahan; pengiriman dicatat ringkas oleh PesanController
    public bool $tanpaAudit = true;

    public function siswa(): BelongsTo { return $this->belongsTo(Student::class, 'id_siswa', 'id_siswa'); }
    public function pengirim(): BelongsTo { return $this->belongsTo(User::class, 'dari_user'); }
}

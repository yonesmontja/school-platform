<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** Satu pesan akses aplikasi (WhatsApp) yang disiapkan Admin. Tanpa kata sandi dan tanpa isi pesan. */
class KirimAkses extends Model
{
    protected $table = 'trans_kirim_akses';

    protected $fillable = ['user_id', 'nama_penerima', 'role', 'login', 'no_wa', 'sandi', 'tindakan', 'dikirim_oleh'];

    public function penerima(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id');
    }

    public function pengirim(): BelongsTo
    {
        return $this->belongsTo(User::class, 'dikirim_oleh');
    }
}

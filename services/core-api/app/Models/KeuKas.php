<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** Kas di luar pembayaran siswa: pemasukan lain dan pengeluaran sekolah. */
class KeuKas extends Model
{
    protected $table = 'keu_kas';

    protected $fillable = ['tanggal', 'arah', 'kategori', 'jumlah', 'keterangan', 'dicatat_oleh'];

    protected $casts = ['jumlah' => 'integer', 'tanggal' => 'date:Y-m-d'];

    public function pencatat(): BelongsTo
    {
        return $this->belongsTo(User::class, 'dicatat_oleh');
    }
}

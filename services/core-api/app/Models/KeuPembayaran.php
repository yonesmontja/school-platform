<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class KeuPembayaran extends Model
{
    protected $table = 'keu_pembayaran';

    protected $fillable = [
        'nomor_kuitansi', 'id_siswa', 'tanggal', 'metode', 'jumlah', 'penyetor', 'keterangan',
        'dicatat_oleh', 'dibatalkan_at', 'dibatalkan_oleh', 'alasan_batal',
    ];

    protected $casts = ['jumlah' => 'integer', 'tanggal' => 'date:Y-m-d', 'dibatalkan_at' => 'datetime'];

    public function siswa(): BelongsTo
    {
        return $this->belongsTo(Student::class, 'id_siswa', 'id_siswa');
    }

    public function rincian(): HasMany
    {
        return $this->hasMany(KeuPembayaranRincian::class, 'id_pembayaran');
    }

    public function pencatat(): BelongsTo
    {
        return $this->belongsTo(User::class, 'dicatat_oleh');
    }

    public function pembatal(): BelongsTo
    {
        return $this->belongsTo(User::class, 'dibatalkan_oleh');
    }
}

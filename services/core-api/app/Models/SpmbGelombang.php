<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class SpmbGelombang extends Model
{
    protected $table = 'spmb_gelombang';

    protected $fillable = ['nama', 'tahun_ajaran', 'tgl_buka', 'tgl_tutup', 'tgl_pengumuman', 'kuota', 'berkas_wajib', 'info', 'diumumkan_at', 'dibuat_oleh'];

    protected $casts = [
        'tgl_buka' => 'date:Y-m-d', 'tgl_tutup' => 'date:Y-m-d', 'tgl_pengumuman' => 'date:Y-m-d',
        'berkas_wajib' => 'array', 'diumumkan_at' => 'datetime', 'kuota' => 'integer',
    ];

    public function pendaftar(): HasMany
    {
        return $this->hasMany(SpmbPendaftar::class, 'id_gelombang');
    }

    /** Formulir dibuka bila hari ini (zona sekolah) berada di antara tanggal buka dan tutup. */
    public function sedangBuka(): bool
    {
        $hariIni = now(config('app.zona_sekolah'))->toDateString();
        return $this->tgl_buka->toDateString() <= $hariIni && $hariIni <= $this->tgl_tutup->toDateString();
    }
}

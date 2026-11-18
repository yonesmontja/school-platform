<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/** Rekening bank / e-wallet sekolah yang ditampilkan ke orang tua sebagai tujuan pembayaran. */
class KeuTujuanBayar extends Model
{
    protected $table = 'keu_tujuan_bayar';

    protected $fillable = ['jenis', 'penyedia', 'nomor', 'atas_nama', 'catatan', 'aktif', 'urutan'];

    protected $casts = ['aktif' => 'boolean', 'urutan' => 'integer'];
}

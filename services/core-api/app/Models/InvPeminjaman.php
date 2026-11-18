<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class InvPeminjaman extends Model
{
    protected $table = 'inv_peminjaman';

    protected $fillable = [
        'id_barang', 'jumlah', 'peminjam', 'keperluan', 'tgl_pinjam', 'rencana_kembali', 'tgl_kembali', 'kondisi_kembali',
        'catatan_kembali', 'status', 'dicatat_oleh',
    ];

    protected $casts = ['jumlah' => 'integer', 'tgl_pinjam' => 'date:Y-m-d', 'rencana_kembali' => 'date:Y-m-d', 'tgl_kembali' => 'date:Y-m-d'];

    public function barang(): BelongsTo { return $this->belongsTo(InvBarang::class, 'id_barang'); }
    public function pencatat(): BelongsTo { return $this->belongsTo(User::class, 'dicatat_oleh'); }
}

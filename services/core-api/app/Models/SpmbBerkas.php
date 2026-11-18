<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class SpmbBerkas extends Model
{
    protected $table = 'spmb_berkas';

    protected $fillable = ['id_pendaftar', 'jenis', 'path', 'nama_asli', 'mime', 'ukuran', 'status', 'catatan'];

    // Lokasi berkas di disk privat tidak dikirim ke klien; unduhan lewat rute yang memeriksa hak akses
    protected $hidden = ['path'];

    public function pendaftar(): BelongsTo
    {
        return $this->belongsTo(SpmbPendaftar::class, 'id_pendaftar');
    }
}

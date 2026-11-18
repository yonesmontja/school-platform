<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class SuratKeluar extends Model
{
    protected $table = 'surat_keluar';

    protected $fillable = [
        'id_templat', 'nomor', 'urut', 'tahun', 'tanggal', 'kode_klasifikasi', 'perihal', 'tujuan', 'sifat', 'lampiran', 'isi',
        'status', 'kode_verifikasi', 'dibuat_oleh', 'diterbitkan_oleh', 'diterbitkan_at', 'ditandatangani_oleh', 'ditandatangani_at', 'alasan_batal',
    ];

    protected $casts = ['tanggal' => 'date:Y-m-d', 'diterbitkan_at' => 'datetime', 'ditandatangani_at' => 'datetime'];

    public function templat(): BelongsTo { return $this->belongsTo(SuratTemplat::class, 'id_templat'); }
    public function pembuat(): BelongsTo { return $this->belongsTo(User::class, 'dibuat_oleh'); }
    public function penerbit(): BelongsTo { return $this->belongsTo(User::class, 'diterbitkan_oleh'); }
    public function penandatangan(): BelongsTo { return $this->belongsTo(User::class, 'ditandatangani_oleh'); }
}

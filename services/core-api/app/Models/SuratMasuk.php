<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class SuratMasuk extends Model
{
    protected $table = 'surat_masuk';

    protected $fillable = [
        'tahun', 'nomor_agenda', 'nomor_surat', 'tanggal_surat', 'tanggal_terima', 'pengirim', 'perihal', 'ringkasan', 'sifat',
        'berkas_path', 'berkas_nama', 'berkas_mime', 'status', 'dicatat_oleh',
    ];

    // Lokasi berkas di disk privat tidak dikirim; unduhan lewat rute yang memeriksa hak akses
    protected $hidden = ['berkas_path'];

    protected $casts = ['tanggal_surat' => 'date:Y-m-d', 'tanggal_terima' => 'date:Y-m-d'];

    public function disposisi(): HasMany { return $this->hasMany(SuratDisposisi::class, 'id_surat_masuk'); }
    public function pencatat(): BelongsTo { return $this->belongsTo(User::class, 'dicatat_oleh'); }
}

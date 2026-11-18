<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** Arsip digital berlabel; jenis LEGAL = dokumen legal sekolah dengan masa berlaku. */
class ArsipDokumen extends Model
{
    protected $table = 'arsip_dokumen';

    protected $fillable = [
        'jenis', 'judul', 'kategori', 'label', 'nomor_dokumen', 'tanggal_dokumen', 'berlaku_sampai', 'keterangan',
        'berkas_path', 'berkas_nama', 'berkas_mime', 'berkas_ukuran', 'dicatat_oleh',
    ];

    protected $hidden = ['berkas_path'];

    protected $casts = ['label' => 'array', 'tanggal_dokumen' => 'date:Y-m-d', 'berlaku_sampai' => 'date:Y-m-d'];

    public function pencatat(): BelongsTo { return $this->belongsTo(User::class, 'dicatat_oleh'); }
}

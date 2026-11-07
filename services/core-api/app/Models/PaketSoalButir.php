<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** Satu butir dalam paket: salinan soal bank saat ditambahkan (bentuk, isi, kunci, TP, bobot STNKM). */
class PaketSoalButir extends Model
{
    protected $table = 'paket_soal_butir';
    // Salinan soal (bisa memuat gambar besar) tidak direkam di Log Aktivitas; tindakan paketnya tetap tercatat
    public bool $tanpaAudit = true;
    protected $fillable = ['id_paket', 'id_soal', 'urutan', 'skor_maks', 'versi', 'soal'];
    protected $casts = ['soal' => 'array', 'skor_maks' => 'integer', 'urutan' => 'integer', 'versi' => 'integer'];

    public function paket(): BelongsTo { return $this->belongsTo(PaketSoal::class, 'id_paket', 'id_paket'); }
    public function bankSoal(): BelongsTo { return $this->belongsTo(BankSoal::class, 'id_soal', 'id_soal'); }
}

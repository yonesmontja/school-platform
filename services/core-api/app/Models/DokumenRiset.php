<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/** Hasil riset AI atas satu dokumen pustaka (Notebook AI, Fase 23). */
class DokumenRiset extends Model
{
    protected $table = 'dokumen_riset';

    public const JENIS = ['RINGKAS', 'RINCI', 'POIN', 'ISTILAH', 'EKSTRAK', 'FAQ'];

    protected $fillable = ['id_dokumen', 'jenis', 'pertanyaan', 'hasil', 'rujukan', 'karakter_dibaca', 'versi_dokumen', 'ai_mode', 'dibuat_oleh'];
    protected $casts = ['hasil' => 'array', 'rujukan' => 'array', 'karakter_dibaca' => 'integer', 'versi_dokumen' => 'integer'];

    public function dokumen() { return $this->belongsTo(DokumenRujukan::class, 'id_dokumen', 'id_dokumen'); }
    public function pembuat() { return $this->belongsTo(User::class, 'dibuat_oleh'); }
}

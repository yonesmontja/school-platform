<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class KisiKisiBaris extends Model
{
    protected $table = 'kisi_kisi_baris';

    protected $fillable = ['id_kisi', 'urutan', 'id_materi', 'id_indikator', 'bentuk', 'level_kognitif', 'tingkat_kesulitan', 'dimensi', 'jumlah'];

    protected $casts = ['urutan' => 'integer', 'jumlah' => 'integer'];

    public function kisi(): BelongsTo { return $this->belongsTo(KisiKisi::class, 'id_kisi', 'id_kisi'); }
    public function materi(): BelongsTo { return $this->belongsTo(MasterMateri::class, 'id_materi', 'id_materi'); }
    public function indikator(): BelongsTo { return $this->belongsTo(MasterIndikator::class, 'id_indikator', 'id_indikator'); }
    public function soal(): HasMany { return $this->hasMany(BankSoal::class, 'id_kisi_baris'); }
}

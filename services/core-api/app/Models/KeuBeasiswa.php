<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** Beasiswa / potongan tetap per siswa; diterapkan otomatis saat tagihan dibuat. */
class KeuBeasiswa extends Model
{
    protected $table = 'keu_beasiswa';

    protected $fillable = ['id_siswa', 'id_jenis_biaya', 'nama', 'bentuk', 'nilai', 'aktif'];

    protected $casts = ['nilai' => 'integer', 'aktif' => 'boolean'];

    public function siswa(): BelongsTo
    {
        return $this->belongsTo(Student::class, 'id_siswa', 'id_siswa');
    }

    public function jenisBiaya(): BelongsTo
    {
        return $this->belongsTo(KeuJenisBiaya::class, 'id_jenis_biaya');
    }

    /** Besar potongan untuk satu nominal tagihan. */
    public function potonganUntuk(int $nominal): int
    {
        return $this->bentuk === 'PERSEN' ? intdiv($nominal * min(100, $this->nilai), 100) : min($nominal, $this->nilai);
    }
}

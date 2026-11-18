<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/** Pengaturan kecil Administrasi Sekolah (kunci → nilai JSON). */
class AdmPengaturan extends Model
{
    protected $table = 'adm_pengaturan';
    protected $primaryKey = 'kunci';
    public $incrementing = false;
    protected $keyType = 'string';

    protected $fillable = ['kunci', 'nilai'];

    protected $casts = ['nilai' => 'array'];

    public static function ambil(string $kunci, mixed $bawaan = null): mixed
    {
        return static::find($kunci)?->nilai ?? $bawaan;
    }

    public static function simpan(string $kunci, mixed $nilai): void
    {
        static::updateOrCreate(['kunci' => $kunci], ['nilai' => $nilai]);
    }
}

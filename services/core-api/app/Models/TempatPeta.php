<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/** Tempat terverifikasi untuk adegan peta (gerbang verifikasi): titik (kota, pangkalan) atau wilayah (selat, laut). */
class TempatPeta extends Model
{
    protected $table = 'tempat_peta';
    protected $fillable = ['kode', 'nama', 'alias', 'jenis', 'lon', 'lat', 'bbox', 'negara', 'sumber'];
    protected $casts = ['alias' => 'array', 'bbox' => 'array', 'lon' => 'float', 'lat' => 'float'];

    /** Cari berdasarkan kode, nama, atau alias (tanpa membedakan huruf besar/kecil). */
    public static function cari(string $q): ?self
    {
        $q = trim($q);
        if ($q === '') return null;
        $kecil = mb_strtolower($q);
        return static::where('kode', $kecil)->first()
            ?? static::whereRaw('LOWER(nama) = ?', [$kecil])->orderByRaw("CASE WHEN jenis = 'wilayah' THEN 1 ELSE 0 END")->first()
            ?? static::whereRaw("EXISTS (SELECT 1 FROM json_array_elements_text(alias) a WHERE LOWER(a) = ?)", [$kecil])->first();
    }
}

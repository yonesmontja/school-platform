<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Str;

/** Aplikasi luar yang boleh memakai API render v1. Kunci disimpan sebagai SHA-256, aslinya ditampilkan sekali. */
class ApiKlien extends Model
{
    protected $table = 'api_klien';
    protected $fillable = ['nama', 'awalan', 'kunci_hash', 'aktif', 'dibuat_oleh', 'terakhir_dipakai'];
    protected $hidden = ['kunci_hash'];
    protected $casts = ['aktif' => 'boolean', 'terakhir_dipakai' => 'datetime'];

    /** @return array{0: self, 1: string} klien baru dan kunci aslinya */
    public static function buat(string $nama, ?int $olehUser): array
    {
        $kunci = 'srk_' . Str::random(40);
        $k = static::create(['nama' => $nama, 'awalan' => substr($kunci, 0, 10), 'kunci_hash' => hash('sha256', $kunci), 'dibuat_oleh' => $olehUser]);
        return [$k, $kunci];
    }

    public static function dariKunci(?string $kunci): ?self
    {
        if (!$kunci || !str_starts_with($kunci, 'srk_') || strlen($kunci) > 100) return null;
        return static::where('kunci_hash', hash('sha256', $kunci))->where('aktif', true)->first();
    }
}

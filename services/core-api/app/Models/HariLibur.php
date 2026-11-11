<?php

namespace App\Models;

use Carbon\CarbonInterface;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Cache;

class HariLibur extends Model
{
    protected $table = 'hari_libur';
    protected $fillable = ['tanggal', 'nama', 'jenis', 'perlu_cek'];
    protected $casts = ['tanggal' => 'date:Y-m-d', 'perlu_cek' => 'boolean'];

    public const JENIS = ['NASIONAL' => 'Libur nasional', 'CUTI_BERSAMA' => 'Cuti bersama', 'SEKOLAH' => 'Libur sekolah'];
    private const KUNCI = 'hari_libur_peta';

    /** Peta tanggal (Y-m-d) → nama libur; disimpan di cache dan dibersihkan setiap kali data berubah. */
    public static function peta(): array
    {
        return Cache::rememberForever(self::KUNCI, fn() => static::query()->get(['tanggal', 'nama'])
            ->mapWithKeys(fn($h) => [$h->tanggal->format('Y-m-d') => $h->nama])->all());
    }

    public static function namaPada(CarbonInterface $tanggal): ?string
    {
        return self::peta()[$tanggal->format('Y-m-d')] ?? null;
    }

    protected static function booted(): void
    {
        $bersih = fn() => Cache::forget(self::KUNCI);
        static::saved($bersih);
        static::deleted($bersih);
    }
}

<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Classes extends Model
{
    use HasFactory;

    protected $table = 'classes';
    protected $primaryKey = 'id_kelas';
    public $incrementing = false;
    protected $keyType = 'string';

    protected $fillable = [
        'id_kelas', 'nama_kelas', 'tingkat', 'wali_kelas'
    ];

    protected $casts = ['tingkat' => 'integer'];

    protected static function booted(): void
    {
        // Tingkat diisi dari nama kelas bila admin tidak mengisinya ("Kelas 2A" → 2)
        static::saving(function (self $k) {
            if (!$k->tingkat && $k->nama_kelas) $k->tingkat = \App\Services\RiwayatRombel::tingkatDariNama($k->nama_kelas);
        });
        // Wali kelas sekarang langsung tercatat di riwayat semester aktif
        static::saved(function (self $k) {
            if ($k->wasRecentlyCreated || $k->wasChanged('wali_kelas')) \App\Services\RiwayatRombel::catatWali($k);
        });
    }

    public function waliKelas(): BelongsTo
    {
        return $this->belongsTo(Teacher::class, 'wali_kelas', 'id_guru');
    }

    public function students(): HasMany
    {
        return $this->hasMany(Student::class, 'id_kelas', 'id_kelas');
    }

    /**
     * Rombel yang dinonaktifkan admin pada semester tertentu (bawaan: semester aktif).
     * Kelas tanpa catatan dianggap aktif, sehingga sekolah yang belum mengatur apa pun tidak terdampak.
     */
    public static function idNonaktif(?string $idPeriode = null): array
    {
        $idPeriode ??= MasterPeriode::where('status_aktif', 'AKTIF')->value('id_periode');
        if (!$idPeriode) return [];
        return \Illuminate\Support\Facades\DB::table('kelas_periode')
            ->where('id_periode', $idPeriode)->where('aktif', false)->pluck('id_kelas')->all();
    }

    /** Hanya rombel yang aktif di semester aktif. */
    public function scopeAktifSemester(Builder $q, ?string $idPeriode = null): Builder
    {
        $nonaktif = self::idNonaktif($idPeriode);
        return $nonaktif ? $q->whereNotIn($this->qualifyColumn('id_kelas'), $nonaktif) : $q;
    }

    /**
     * Daftar kelas untuk pilihan di formulir: guru hanya melihat rombel aktif semester ini;
     * admin & kepsek melihat semuanya (rombel nonaktif ditandai lewat atribut aktif_semester).
     */
    public function scopeUntukPengguna(Builder $q, ?User $user): Builder
    {
        return $user && $user->role === 'guru' ? $q->aktifSemester() : $q;
    }
}

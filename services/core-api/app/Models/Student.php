<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Facades\URL;

class Student extends Model
{
    use HasFactory;

    protected $table = 'students';
    protected $primaryKey = 'id_siswa';
    public $incrementing = false;
    protected $keyType = 'string';

    protected $fillable = [
        'id_siswa', 'nisn', 'nama_siswa', 'panggilan', 'id_kelas',
        'jenis_kelamin', 'tempat_lahir', 'tgl_lahir', 'id_suku',
        'id_agama', 'id_sekolah_asal', 'status_tempat_tinggal',
        'jalan_siswa', 'id_wilayah_siswa', 'id_ortu', 'id_wali', 'no_wa',
    ];

    // Lokasi berkas foto tidak pernah dikirim; yang dikirim tautan bertanda tangan (foto_url)
    protected $hidden = ['foto_path', 'foto_asli_path'];
    protected $appends = ['foto_url'];
    protected $casts = ['foto_diperbarui' => 'datetime'];

    /**
     * Tautan pas foto bertanda tangan (relatif terhadap asal API), berlaku sampai akhir besok.
     * Masa berlaku dibulatkan per hari agar peramban bisa menyimpan cache; v berubah setiap foto diganti.
     */
    public function getFotoUrlAttribute(): ?string
    {
        if (!$this->foto_path) return null;
        return URL::temporarySignedRoute('siswa.foto', now()->startOfDay()->addDays(2), [
            'id' => $this->id_siswa,
            'v' => $this->foto_diperbarui?->timestamp ?? 0,
        ], absolute: false);
    }

    // Relasi ke Kelas
    public function kelas(): BelongsTo
    {
        return $this->belongsTo(Classes::class, 'id_kelas', 'id_kelas');
    }

    // Relasi ke Suku
    public function suku(): BelongsTo
    {
        return $this->belongsTo(MasterSuku::class, 'id_suku', 'id_suku');
    }

    // Relasi ke Agama
    public function agama(): BelongsTo
    {
        return $this->belongsTo(MasterAgama::class, 'id_agama', 'id_agama');
    }

    // Relasi ke Sekolah Asal
    public function sekolahAsal(): BelongsTo
    {
        return $this->belongsTo(MasterSekolahAsal::class, 'id_sekolah_asal', 'id_sekolah_asal');
    }

    // Relasi ke Wilayah
    public function wilayah(): BelongsTo
    {
        return $this->belongsTo(MasterWilayah::class, 'id_wilayah_siswa', 'id_wilayah');
    }

    // Relasi ke Orang Tua
    public function ortu(): BelongsTo
    {
        return $this->belongsTo(MasterOrtu::class, 'id_ortu', 'id_ortu');
    }

    // Relasi ke Wali
    public function wali(): BelongsTo
    {
        return $this->belongsTo(MasterWali::class, 'id_wali', 'id_wali');
    }
}
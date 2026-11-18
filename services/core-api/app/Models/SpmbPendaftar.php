<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class SpmbPendaftar extends Model
{
    protected $table = 'spmb_pendaftar';

    protected $fillable = [
        'id_gelombang', 'nomor_daftar', 'kode_akses', 'nama_siswa', 'panggilan', 'nisn', 'jenis_kelamin', 'tempat_lahir', 'tgl_lahir',
        'id_agama', 'id_suku', 'sekolah_asal', 'alamat', 'nama_ayah', 'id_pekerjaan_ayah', 'nama_ibu', 'id_pekerjaan_ibu',
        'nama_wali', 'id_pekerjaan_wali', 'no_wa', 'status', 'catatan_verifikasi', 'skor', 'diverifikasi_oleh', 'diverifikasi_at',
        'daftar_ulang_at', 'id_siswa', 'selesai_at',
    ];

    // Kode akses (hash) tidak pernah dikirim ke klien dan tidak dicatat di Log Aktivitas
    protected $hidden = ['kode_akses'];

    protected $casts = [
        'tgl_lahir' => 'date:Y-m-d', 'skor' => 'float',
        'diverifikasi_at' => 'datetime', 'daftar_ulang_at' => 'datetime', 'selesai_at' => 'datetime',
    ];

    public function gelombang(): BelongsTo
    {
        return $this->belongsTo(SpmbGelombang::class, 'id_gelombang');
    }

    public function berkas(): HasMany
    {
        return $this->hasMany(SpmbBerkas::class, 'id_pendaftar');
    }

    public function verifikator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'diverifikasi_oleh');
    }

    public function siswa(): BelongsTo
    {
        return $this->belongsTo(Student::class, 'id_siswa', 'id_siswa');
    }
}

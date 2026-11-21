<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\URL;

/** Satu karya di e-portofolio siswa (foto/video di disk local: portofolio/...). */
class TransPortofolio extends Model
{
    public const KATEGORI = ['KARYA', 'P5', 'PRESTASI', 'KEGIATAN'];
    public const STATUS = ['MENUNGGU', 'DISETUJUI', 'DITOLAK'];

    protected $table = 'trans_portofolio';
    protected $fillable = ['id_siswa', 'id_periode', 'id_kelas', 'kategori', 'id_proyek', 'judul', 'deskripsi', 'tanggal', 'jenis', 'path', 'mime',
        'ukuran', 'kelompok', 'status', 'unggulan', 'tanggapan', 'ditinjau_oleh', 'ditinjau_pada', 'dibuat_oleh'];
    protected $hidden = ['path'];
    protected $casts = ['tanggal' => 'date:Y-m-d', 'unggulan' => 'boolean', 'ditinjau_pada' => 'datetime', 'ukuran' => 'integer'];
    protected $appends = ['url'];

    public function siswa() { return $this->belongsTo(Student::class, 'id_siswa', 'id_siswa'); }
    public function pembuat() { return $this->belongsTo(User::class, 'dibuat_oleh'); }
    public function peninjau() { return $this->belongsTo(User::class, 'ditinjau_oleh'); }
    public function proyek() { return $this->belongsTo(MasterProyek::class, 'id_proyek', 'id_proyek'); }
    public function periode() { return $this->belongsTo(MasterPeriode::class, 'id_periode', 'id_periode'); }

    /** Tautan berkas bertanda tangan (relatif), berlaku sampai akhir besok agar peramban bisa menyimpan cache. */
    public function getUrlAttribute(): string
    {
        return URL::temporarySignedRoute('portofolio.berkas', now()->startOfDay()->addDays(2), ['id' => $this->id], absolute: false);
    }
}

<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasOne;

class TransRencanaRemedial extends Model
{
    protected $table = 'trans_rencana_remedial';
    protected $primaryKey = 'id_rencana';
    public $incrementing = false;
    protected $keyType = 'string';

    // Opsi tindak lanjut bagi siswa yang belum mencapai KKM
    public const OPSI = [
        'Pengulangan Materi',
        'Tugas Tambahan',
        'Tes Ulang',
        'Bimbingan Individual',
        'Tutor Sebaya',
        'Kelompok Kecil',
        'Media / Alat Peraga',
    ];

    protected $fillable = [
        'id_rencana', 'id_nilai_asal', 'id_siswa', 'id_mapel', 'opsi_tindakan', 'catatan',
        'tanggal_rencana', 'status', 'tanggal_selesai', 'id_jadwal', 'dibuat_oleh',
    ];

    protected $casts = [
        'tanggal_rencana' => 'date:Y-m-d',
        'tanggal_selesai' => 'date:Y-m-d',
    ];

    public function nilaiAsal(): BelongsTo { return $this->belongsTo(TransNilai::class, 'id_nilai_asal', 'id_nilai'); }
    public function nilaiRemedial(): HasOne { return $this->hasOne(TransNilai::class, 'id_rencana', 'id_rencana'); }
    public function siswa(): BelongsTo { return $this->belongsTo(Student::class, 'id_siswa', 'id_siswa'); }
    public function mapel(): BelongsTo { return $this->belongsTo(Subject::class, 'id_mapel', 'id_mapel'); }
    public function jadwal(): BelongsTo { return $this->belongsTo(TransJadwal::class, 'id_jadwal', 'id_jadwal'); }
}

<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/** Paket soal (naskah ujian) dari soal bank yang sudah disetujui, beserta jawaban siswanya. */
class PaketSoal extends Model
{
    protected $table = 'paket_soal';
    protected $primaryKey = 'id_paket';
    public $incrementing = false;
    protected $keyType = 'string';

    protected $fillable = [
        'id_paket', 'judul', 'id_mapel', 'id_kelas', 'id_periode', 'id_kisi', 'id_jenis',
        'tanggal', 'durasi_menit', 'petunjuk', 'terkirim_pada', 'dibuat_oleh',
        'online', 'online_mulai', 'online_selesai', 'acak_soal', 'acak_pilihan', 'token', 'tampilkan_nilai',
    ];

    protected $casts = [
        'tanggal' => 'date:Y-m-d', 'terkirim_pada' => 'datetime', 'durasi_menit' => 'integer',
        'online' => 'boolean', 'online_mulai' => 'datetime', 'online_selesai' => 'datetime',
        'acak_soal' => 'boolean', 'acak_pilihan' => 'boolean', 'tampilkan_nilai' => 'boolean',
    ];

    public function butir(): HasMany { return $this->hasMany(PaketSoalButir::class, 'id_paket', 'id_paket')->orderBy('urutan')->orderBy('id'); }
    public function jawaban(): HasMany { return $this->hasMany(PaketSoalJawaban::class, 'id_paket', 'id_paket'); }
    public function mapel(): BelongsTo { return $this->belongsTo(Subject::class, 'id_mapel', 'id_mapel'); }
    public function kelas(): BelongsTo { return $this->belongsTo(Classes::class, 'id_kelas', 'id_kelas'); }
    public function periode(): BelongsTo { return $this->belongsTo(MasterPeriode::class, 'id_periode', 'id_periode'); }
    public function jenis(): BelongsTo { return $this->belongsTo(MasterMBK::class, 'id_jenis', 'id_jenis'); }
    public function kisi(): BelongsTo { return $this->belongsTo(KisiKisi::class, 'id_kisi', 'id_kisi'); }
    public function pembuat(): BelongsTo { return $this->belongsTo(User::class, 'dibuat_oleh'); }
}

<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasOne;

class TransNilai extends Model
{
    protected $table = 'trans_nilai';
    protected $primaryKey = 'id_nilai';
    public $incrementing = false;
    protected $keyType = 'string';

    protected $fillable = [
        'id_nilai', 'tanggal', 'id_siswa', 'id_mapel', 'id_guru', 
        'id_periode', 'id_jenis', 'id_materi', 'id_kelas', 'nilai',
        'poin_S', 'poin_T', 'poin_N', 'poin_K', 'poin_M', 'metode_stnkm',
        'tipe_nilai', 'id_rencana',
    ];

    public function siswa(): BelongsTo { return $this->belongsTo(Student::class, 'id_siswa', 'id_siswa'); }
    public function mapel(): BelongsTo { return $this->belongsTo(Subject::class, 'id_mapel', 'id_mapel'); }
    public function periode(): BelongsTo { return $this->belongsTo(MasterPeriode::class, 'id_periode', 'id_periode'); }
    public function jenis(): BelongsTo { return $this->belongsTo(MasterMBK::class, 'id_jenis', 'id_jenis'); }
    public function materi(): BelongsTo { return $this->belongsTo(MasterMateri::class, 'id_materi', 'id_materi'); }
    public function kelas(): BelongsTo { return $this->belongsTo(Classes::class, 'id_kelas', 'id_kelas'); }

    // Rencana tindak lanjut terbaru yang dipicu nilai ini
    public function rencana(): HasOne
    {
        return $this->hasOne(TransRencanaRemedial::class, 'id_nilai_asal', 'id_nilai')->latestOfMany('created_at');
    }

    // Untuk nilai REMEDIAL: rencana yang dituntaskannya
    public function rencanaAsal(): BelongsTo { return $this->belongsTo(TransRencanaRemedial::class, 'id_rencana', 'id_rencana'); }

    /**
     * Nilai yang dipakai rekap (rapor, laporan, dasbor): nilai yang sudah diperbaiki lewat remedial
     * digantikan oleh nilai remedialnya, sehingga satu capaian tidak terhitung dua kali.
     */
    public function scopeEfektif(Builder $query): Builder
    {
        return $query->whereNotExists(fn($q) => $q->selectRaw('1')
            ->from('trans_rencana_remedial as rr')
            ->join('trans_nilai as rem', 'rem.id_rencana', '=', 'rr.id_rencana')
            ->whereColumn('rr.id_nilai_asal', 'trans_nilai.id_nilai'));
    }
}

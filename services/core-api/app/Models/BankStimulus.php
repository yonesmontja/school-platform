<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/** Stimulus AKM bersama: bacaan, tabel, atau grafik yang dipakai beberapa soal (CBT Tahap B). */
class BankStimulus extends Model
{
    protected $table = 'bank_stimulus';
    protected $primaryKey = 'id_stimulus';
    public $incrementing = false;
    protected $keyType = 'string';

    public const JENIS = [
        'LITERASI_INFORMASI' => 'Literasi teks informasi',
        'LITERASI_FIKSI' => 'Literasi teks fiksi',
        'NUMERASI' => 'Numerasi',
    ];
    public const KONTEKS = ['PERSONAL' => 'Personal', 'SOSIAL_BUDAYA' => 'Sosial budaya', 'SAINTIFIK' => 'Saintifik'];

    protected $fillable = ['id_stimulus', 'id_mapel', 'id_kelas', 'judul', 'jenis', 'konteks', 'konten', 'gambar_url', 'sumber_teks', 'dibuat_oleh'];

    public function mapel(): BelongsTo { return $this->belongsTo(Subject::class, 'id_mapel', 'id_mapel'); }
    public function kelas(): BelongsTo { return $this->belongsTo(Classes::class, 'id_kelas', 'id_kelas'); }
    public function pembuat(): BelongsTo { return $this->belongsTo(User::class, 'dibuat_oleh'); }
    public function soal(): HasMany { return $this->hasMany(BankSoal::class, 'id_stimulus', 'id_stimulus'); }

    /** Salinan untuk butir paket dan tampilan siswa. */
    public function ringkas(): array
    {
        return $this->only(['id_stimulus', 'judul', 'jenis', 'konteks', 'konten', 'gambar_url', 'sumber_teks']);
    }

    /** Domain AKM dari jenis stimulus: LITERASI atau NUMERASI. */
    public static function domain(?string $jenis): ?string
    {
        return $jenis ? ($jenis === 'NUMERASI' ? 'NUMERASI' : 'LITERASI') : null;
    }
}

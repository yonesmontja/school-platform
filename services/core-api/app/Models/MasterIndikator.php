<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/** Indikator Ketercapaian Tujuan Pembelajaran (IKTP) milik satu materi. */
class MasterIndikator extends Model {
    protected $table = 'master_indikator';
    protected $primaryKey = 'id_indikator';
    public $incrementing = false;
    protected $keyType = 'string';
    protected $fillable = ['id_indikator', 'id_materi', 'deskripsi', 'urutan', 'aktif', 'dibuat_oleh'];
    protected $casts = ['aktif' => 'boolean', 'urutan' => 'integer'];

    public function materi(): BelongsTo { return $this->belongsTo(MasterMateri::class, 'id_materi', 'id_materi'); }
    public function nilai(): HasMany { return $this->hasMany(TransNilaiIndikator::class, 'id_indikator', 'id_indikator'); }

    /** Sudah dipakai menilai: tidak boleh dihapus, hanya dinonaktifkan. */
    public function sudahDipakai(): bool { return $this->nilai()->exists(); }
}

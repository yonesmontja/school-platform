<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class MasterMateri extends Model {
    protected $table = 'master_materi';
    protected $primaryKey = 'id_materi';
    public $incrementing = false;
    protected $keyType = 'string';
    protected $fillable = [
        'id_materi', 'id_mapel', 'id_kelas', 'id_periode', 'id_kategori', 
        'nama_materi', 'deskripsi_kompetensi', 
        'mat_S', 'mat_T', 'mat_N', 'mat_K', 'mat_M'
    ];

    public function mapel(): BelongsTo { return $this->belongsTo(Subject::class, 'id_mapel', 'id_mapel'); }
    public function kelas(): BelongsTo { return $this->belongsTo(Classes::class, 'id_kelas', 'id_kelas'); }
    public function periode(): BelongsTo { return $this->belongsTo(MasterPeriode::class, 'id_periode', 'id_periode'); }
    public function kategori(): BelongsTo { return $this->belongsTo(MasterKategoriPenilaian::class, 'id_kategori', 'id_kategori'); }
    /** Indikator Ketercapaian TP, urut sesuai susunan guru/admin */
    public function indikator(): HasMany { return $this->hasMany(MasterIndikator::class, 'id_materi', 'id_materi')->orderBy('urutan')->orderBy('created_at'); }
}
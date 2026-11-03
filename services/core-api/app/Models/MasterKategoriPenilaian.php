<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class MasterKategoriPenilaian extends Model {
    protected $table = 'master_kategori_penilaian';
    protected $primaryKey = 'id_kategori';
    public $incrementing = false;
    protected $keyType = 'string';
    // id_mapel null = High Level (Elemen CP) berlaku untuk semua mapel
    protected $fillable = ['id_kategori', 'id_mapel', 'nama_kategori', 'keterangan'];

    public function mapel(): BelongsTo { return $this->belongsTo(Subject::class, 'id_mapel', 'id_mapel'); }

    /** Boleh dipakai materi mapel tersebut: khusus mapel itu atau berlaku semua mapel. */
    public function berlakuUntuk(?string $idMapel): bool { return $this->id_mapel === null || $this->id_mapel === $idMapel; }
}
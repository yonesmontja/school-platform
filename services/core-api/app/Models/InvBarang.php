<?php

namespace App\Models;

use Carbon\Carbon;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/** Aset inventaris sekolah per ruang (Administrasi Tahap E). */
class InvBarang extends Model
{
    protected $table = 'inv_barang';

    protected $fillable = [
        'kode', 'nama', 'kategori', 'id_ruangan', 'merek', 'jumlah', 'satuan', 'kondisi', 'tanggal_perolehan', 'harga_perolehan',
        'umur_ekonomis', 'sumber_dana', 'keterangan', 'dihapus_at', 'alasan_hapus',
    ];

    protected $casts = [
        'jumlah' => 'integer', 'harga_perolehan' => 'integer', 'umur_ekonomis' => 'integer',
        'tanggal_perolehan' => 'date:Y-m-d', 'dihapus_at' => 'datetime',
    ];

    /** Nilai buku total (penyusutan garis lurus, nilai sisa 0). */
    public function nilaiBuku(?Carbon $per = null): int
    {
        $total = $this->harga_perolehan * $this->jumlah;
        if (!$this->umur_ekonomis || !$this->tanggal_perolehan) return $total;
        $per ??= now(config('app.zona_sekolah'));
        $tahun = max(0, $this->tanggal_perolehan->floatDiffInYears($per, false));
        return (int) round($total * max(0, 1 - $tahun / $this->umur_ekonomis));
    }

    public function ruangan(): BelongsTo { return $this->belongsTo(MasterRuangan::class, 'id_ruangan', 'id_ruangan'); }
    public function peminjaman(): HasMany { return $this->hasMany(InvPeminjaman::class, 'id_barang'); }
    public function pemeriksaan(): HasMany { return $this->hasMany(InvPemeriksaan::class, 'id_barang'); }
}

<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * Dokumen resmi (CP, regulasi, panduan) atau tautan pemerintah yang dibaca AI sebagai konteks.
 * Admin & kepala sekolah langsung AKTIF; unggahan guru (bila diizinkan admin) DIAJUKAN dulu ke kepala sekolah.
 */
class DokumenRujukan extends Model
{
    public const JENIS = ['CP', 'KURIKULUM', 'REGULASI', 'PANDUAN', 'LAINNYA'];
    public const STATUS = ['DIAJUKAN', 'AKTIF', 'DITOLAK', 'NONAKTIF'];
    public const EKSTENSI = ['pdf', 'docx', 'txt', 'md'];
    /** Ukuran berkas maksimal (KB); php.ini & proxy Next.js disetel di atasnya untuk teks hasil baca browser. */
    public const MAKS_KB = 51200;

    protected $table = 'dokumen_rujukan';
    protected $primaryKey = 'id_dokumen';
    public $incrementing = false;
    protected $keyType = 'string';
    protected $fillable = ['id_dokumen', 'judul', 'jenis', 'sumber_tipe', 'file_path', 'nama_berkas', 'ukuran_kb', 'url_tautan', 'id_mapel', 'fase',
        'keterangan', 'teks', 'jumlah_karakter', 'status_teks', 'ringkasan', 'status', 'catatan_review', 'versi', 'diunggah_oleh', 'disetujui_oleh', 'disetujui_pada'];
    protected $hidden = ['teks', 'file_path'];
    protected $casts = ['disetujui_pada' => 'datetime', 'versi' => 'integer', 'ukuran_kb' => 'integer', 'jumlah_karakter' => 'integer'];

    public function mapel(): BelongsTo { return $this->belongsTo(Subject::class, 'id_mapel', 'id_mapel'); }
    public function pengunggah(): BelongsTo { return $this->belongsTo(User::class, 'diunggah_oleh'); }
    public function penyetuju(): BelongsTo { return $this->belongsTo(User::class, 'disetujui_oleh'); }
    public function potongan(): HasMany { return $this->hasMany(DokumenPotongan::class, 'id_dokumen', 'id_dokumen'); }
}

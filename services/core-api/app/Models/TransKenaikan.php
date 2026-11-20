<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** Keputusan kenaikan kelas akhir tahun per siswa (semester Genap). */
class TransKenaikan extends Model
{
    // Setelah semester Genap ditutup & dikunci, keputusan hanya bisa diubah admin
    use Concerns\TerkunciPeriode;

    public const KEPUTUSAN = ['NAIK', 'TIDAK_NAIK', 'LULUS'];

    protected $table = 'trans_kenaikan';
    protected $fillable = ['id_siswa', 'id_periode', 'id_kelas', 'keputusan', 'ke_tingkat', 'alasan', 'diisi_oleh', 'disahkan', 'disahkan_oleh', 'disahkan_pada', 'diterapkan_pada'];
    protected $casts = ['disahkan' => 'boolean', 'disahkan_pada' => 'datetime', 'diterapkan_pada' => 'datetime', 'ke_tingkat' => 'integer'];

    public function siswa(): BelongsTo
    {
        return $this->belongsTo(Student::class, 'id_siswa', 'id_siswa');
    }

    public function pengisi(): BelongsTo
    {
        return $this->belongsTo(User::class, 'diisi_oleh');
    }

    public function pengesah(): BelongsTo
    {
        return $this->belongsTo(User::class, 'disahkan_oleh');
    }
}

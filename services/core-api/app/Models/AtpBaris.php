<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** Satu langkah ATP: TP (yang sudah ada atau usulan baru), materi, elemen CP, alokasi waktu, dan dimensi. */
class AtpBaris extends Model
{
    protected $table = 'atp_baris';
    // Baris disimpan ulang setiap kali ATP disunting; tindakan ATP-nya tetap tercatat di Log Aktivitas
    public bool $tanpaAudit = true;
    protected $fillable = [
        'id_atp', 'urutan', 'id_cp', 'id_materi', 'id_indikator', 'materi_usulan', 'tp_usulan',
        'alokasi_jp', 'minggu', 'dimensi', 'profil_lulusan', 'catatan',
    ];
    protected $casts = ['urutan' => 'integer', 'alokasi_jp' => 'integer', 'profil_lulusan' => 'array'];

    public function cp(): BelongsTo { return $this->belongsTo(CapaianPembelajaran::class, 'id_cp', 'id_cp'); }
    public function materi(): BelongsTo { return $this->belongsTo(MasterMateri::class, 'id_materi', 'id_materi'); }
    public function indikator(): BelongsTo { return $this->belongsTo(MasterIndikator::class, 'id_indikator', 'id_indikator'); }
}

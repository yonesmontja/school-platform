<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** Jawaban dan skor satu siswa untuk satu paket soal. */
class PaketSoalJawaban extends Model
{
    protected $table = 'paket_soal_jawaban';
    protected $fillable = [
        'id_paket', 'id_siswa', 'jawaban', 'skor_manual', 'skor', 'total', 'nilai', 'lengkap', 'foto', 'dikoreksi_oleh',
        'sumber', 'mulai_pada', 'selesai_pada', 'terakhir_aktif', 'urutan', 'pelanggaran',
        'id_sesi', 'perangkat', 'terkunci', 'alasan_kunci', 'tambahan_menit', 'log',
    ];
    // Jenis peristiwa mode ujian; yang termasuk PELANGGARAN menambah hitungan pelanggaran
    public const PERISTIWA = ['KELUAR_TAB', 'KELUAR_LAYAR_PENUH', 'OFFLINE', 'ONLINE', 'MASUK', 'PERANGKAT_LAIN', 'TERKUNCI', 'DIIZINKAN', 'TAMBAH_WAKTU', 'DIAKHIRI'];
    public const PELANGGARAN = ['KELUAR_TAB', 'KELUAR_LAYAR_PENUH'];
    protected $casts = [
        'jawaban' => 'array', 'skor_manual' => 'array', 'skor' => 'array', 'foto' => 'array',
        'total' => 'float', 'nilai' => 'float', 'lengkap' => 'boolean',
        'urutan' => 'array', 'mulai_pada' => 'datetime', 'selesai_pada' => 'datetime', 'terakhir_aktif' => 'datetime', 'pelanggaran' => 'integer',
        'terkunci' => 'boolean', 'tambahan_menit' => 'integer', 'log' => 'array',
    ];

    public function sesi(): BelongsTo { return $this->belongsTo(UjianSesi::class, 'id_sesi', 'id_sesi'); }

    /** Tambah peristiwa ke log (maks. 200 terakhir). */
    public function catat(string $jenis, ?string $ket = null, ?string $waktu = null): void
    {
        $log = $this->log ?? [];
        $log[] = array_filter(['t' => $waktu ?: now()->toIso8601String(), 'jenis' => $jenis, 'ket' => $ket ? mb_substr($ket, 0, 200) : null]);
        $this->log = array_slice($log, -200);
    }

    /** Tes online yang sedang dikerjakan belum boleh dinilai, dikirim, atau dianalisis. */
    public function sedangDikerjakan(): bool
    {
        return $this->sumber === 'ONLINE' && $this->selesai_pada === null;
    }

    public function siswa(): BelongsTo { return $this->belongsTo(Student::class, 'id_siswa', 'id_siswa'); }
}

<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** Penerbitan rapor resmi satu siswa × semester (versi, kode QR, tanda tangan elektronik, tanda terima orang tua). */
class TransRaporTerbit extends Model
{
    protected $table = 'trans_rapor_terbit';
    protected $fillable = [
        'id_siswa', 'id_kelas', 'id_periode', 'versi', 'kode_verifikasi', 'status', 'mode_kalkulasi', 'bobot', 'tanggal_rapor',
        'ringkasan', 'sidik', 'diterbitkan_oleh', 'nama_wali', 'diterbitkan_pada', 'disahkan_oleh', 'nama_kepsek', 'disahkan_pada',
        'diterima_oleh', 'diterima_pada', 'tanggapan_ortu',
    ];
    protected $casts = [
        'bobot' => 'array', 'ringkasan' => 'array', 'tanggal_rapor' => 'date:Y-m-d', 'versi' => 'integer',
        'diterbitkan_pada' => 'datetime', 'disahkan_pada' => 'datetime', 'diterima_pada' => 'datetime',
    ];
    protected $hidden = ['sidik'];

    public function siswa(): BelongsTo { return $this->belongsTo(Student::class, 'id_siswa', 'id_siswa'); }
    public function penerima(): BelongsTo { return $this->belongsTo(User::class, 'diterima_oleh'); }

    public function scopeBerlaku($q) { return $q->where('status', 'BERLAKU'); }

    /** Kode QR acak 10 karakter tanpa huruf/angka yang mirip (0/O, 1/I). */
    public static function kodeBaru(): string
    {
        $abjad = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        do {
            $kode = '';
            for ($i = 0; $i < 10; $i++) $kode .= $abjad[random_int(0, strlen($abjad) - 1)];
        } while (self::where('kode_verifikasi', $kode)->exists());
        return $kode;
    }
}

<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class TransJadwal extends Model
{
    protected $table = 'trans_jadwal';
    protected $primaryKey = 'id_jadwal';
    public $incrementing = false;
    protected $keyType = 'string';

    protected $fillable = [
        'id_jadwal', 'id_group', 'id_periode', 'id_kelas', 'id_guru', 'id_mapel', 'id_materi', 'id_ruangan',
        'judul', 'mulai', 'selesai', 'warna', 'catatan', 'lampiran_url', 'lampiran_nama', 'status_sesi',
        'id_modul', 'pertemuan_ke', 'perangkat',
    ];

    /** Jenis perangkat ajar yang ditautkan lewat kolom JSON `perangkat` (modul, materi, video punya tautan sendiri). */
    public const JENIS_PERANGKAT = ['CP', 'ATP', 'INDIKATOR', 'SOAL'];

    // Waktu lokal sekolah tanpa zona; dikirim sebagai "YYYY-MM-DDTHH:mm" agar tidak bergeser di browser
    protected $casts = [
        'mulai' => 'datetime:Y-m-d\TH:i',
        'selesai' => 'datetime:Y-m-d\TH:i',
        'perangkat' => 'array',
    ];

    /** Status sesi menurut jam sekolah: sebelum mulai Menunggu, di antara Berlangsung, sesudahnya Selesai. Batal tetap manual. */
    public static function statusMenurutWaktu($mulai, $selesai): string
    {
        $kini = now(config('app.zona_sekolah'))->format('Y-m-d H:i:s');
        $m = $mulai instanceof \DateTimeInterface ? $mulai->format('Y-m-d H:i:s') : str_replace('T', ' ', substr($mulai, 0, 16)) . ':00';
        $s = $selesai instanceof \DateTimeInterface ? $selesai->format('Y-m-d H:i:s') : str_replace('T', ' ', substr($selesai, 0, 16)) . ':00';
        return $kini < $m ? 'Menunggu' : ($kini < $s ? 'Berlangsung' : 'Selesai');
    }

    /**
     * Selaraskan status semua sesi (kecuali Batal) dengan waktu sekarang. Dipanggil penjadwal tiap menit dan saat data dibaca.
     * Lewat query builder agar tidak membanjiri Log Aktivitas.
     */
    public static function perbaruiStatusOtomatis(): int
    {
        $kini = now(config('app.zona_sekolah'))->format('Y-m-d H:i:s');
        $aktif = fn() => static::query()->where('status_sesi', '!=', 'Batal');
        return $aktif()->where('selesai', '<=', $kini)->where('status_sesi', '!=', 'Selesai')->update(['status_sesi' => 'Selesai'])
            + $aktif()->where('mulai', '<=', $kini)->where('selesai', '>', $kini)->where('status_sesi', '!=', 'Berlangsung')->update(['status_sesi' => 'Berlangsung'])
            + $aktif()->where('mulai', '>', $kini)->where('status_sesi', '!=', 'Menunggu')->update(['status_sesi' => 'Menunggu']);
    }

    /** Jam pelajaran (35 menit, SD) yang dipakai sesi ini; minimal 1. */
    public function jp(): int
    {
        return max(1, (int) round($this->mulai->diffInMinutes($this->selesai) / 35));
    }

    public function guru(): BelongsTo { return $this->belongsTo(Teacher::class, 'id_guru', 'id_guru'); }
    public function mapel(): BelongsTo { return $this->belongsTo(Subject::class, 'id_mapel', 'id_mapel'); }
    public function materi(): BelongsTo { return $this->belongsTo(MasterMateri::class, 'id_materi', 'id_materi'); }
    public function kelas(): BelongsTo { return $this->belongsTo(Classes::class, 'id_kelas', 'id_kelas'); }
    public function ruangan(): BelongsTo { return $this->belongsTo(MasterRuangan::class, 'id_ruangan', 'id_ruangan'); }

    public function modul(): \Illuminate\Database\Eloquent\Relations\BelongsTo { return $this->belongsTo(ModulAjar::class, 'id_modul', 'id_modul'); }
}

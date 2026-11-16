<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;

/**
 * Sesi ujian CBT: satu paket soal dikerjakan beberapa kelas pada jendela waktu yang sama, dengan token sesi
 * (boleh berganti otomatis tiap N menit seperti ANBK), ruang, pengawas, dan aturan mode ujian.
 */
class UjianSesi extends Model
{
    public const HURUF_TOKEN = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

    protected $table = 'ujian_sesi';
    protected $primaryKey = 'id_sesi';
    public $incrementing = false;
    protected $keyType = 'string';
    protected $fillable = [
        'id_sesi', 'nama', 'id_paket', 'kelas', 'mulai', 'selesai', 'durasi_menit', 'token', 'token_ganti_menit',
        'acak_soal', 'acak_pilihan', 'tampilkan_nilai', 'wajib_layar_penuh', 'batas_pelanggaran', 'kunci_perangkat',
        'ruang', 'id_pengawas', 'aktif', 'dibuat_oleh',
    ];
    protected $casts = [
        'kelas' => 'array', 'mulai' => 'datetime', 'selesai' => 'datetime', 'durasi_menit' => 'integer', 'token_ganti_menit' => 'integer',
        'acak_soal' => 'boolean', 'acak_pilihan' => 'boolean', 'tampilkan_nilai' => 'boolean', 'wajib_layar_penuh' => 'boolean',
        'batas_pelanggaran' => 'integer', 'kunci_perangkat' => 'boolean', 'aktif' => 'boolean',
    ];
    protected $hidden = ['token'];

    public function paket(): BelongsTo { return $this->belongsTo(PaketSoal::class, 'id_paket', 'id_paket'); }
    public function pengawas(): BelongsTo { return $this->belongsTo(Teacher::class, 'id_pengawas', 'id_guru'); }
    public function pembuat(): BelongsTo { return $this->belongsTo(User::class, 'dibuat_oleh'); }

    public static function tokenAcak(int $panjang = 6): string
    {
        return collect(range(1, $panjang))->map(fn() => self::HURUF_TOKEN[random_int(0, strlen(self::HURUF_TOKEN) - 1)])->implode('');
    }

    /** Token yang berlaku pada waktu tertentu: token dasar, atau turunan per selang waktu bila token berganti. */
    public function tokenPada(?Carbon $pada = null): string
    {
        if (!$this->token_ganti_menit) return $this->token;
        $selang = intdiv(($pada ?? now())->getTimestamp(), $this->token_ganti_menit * 60);
        $hash = hash_hmac('sha256', "{$this->id_sesi}|{$this->token}|{$selang}", (string) config('app.key'));
        $hasil = '';
        for ($i = 0; $i < 6; $i++) $hasil .= self::HURUF_TOKEN[hexdec(substr($hash, $i * 2, 2)) % strlen(self::HURUF_TOKEN)];
        return $hasil;
    }

    /** Detik sampai token berganti (null bila token tetap). */
    public function detikGantiToken(): ?int
    {
        if (!$this->token_ganti_menit) return null;
        $selang = $this->token_ganti_menit * 60;
        return $selang - (now()->getTimestamp() % $selang);
    }

    /** Token yang diketik siswa sah: token sekarang, atau token selang sebelumnya (kelonggaran saat pergantian). */
    public function tokenSah(?string $input): bool
    {
        $input = mb_strtoupper(trim((string) $input));
        if ($input === '') return false;
        if ($input === $this->tokenPada()) return true;
        return $this->token_ganti_menit && $input === $this->tokenPada(now()->subMinutes($this->token_ganti_menit));
    }

    /** Pasang aturan sesi ke paket (di memori saja, tidak disimpan) agar logika tes online memakai waktu & acakan sesi. */
    public function terapkan(PaketSoal $paket): PaketSoal
    {
        $paket->forceFill([
            'online_mulai' => $this->mulai, 'online_selesai' => $this->selesai, 'durasi_menit' => $this->durasi_menit,
            'acak_soal' => $this->acak_soal, 'acak_pilihan' => $this->acak_pilihan, 'tampilkan_nilai' => $this->tampilkan_nilai,
        ]);
        $paket->setRelation('sesiUjian', $this);
        return $paket;
    }

    /** Siswa semua kelas peserta sesi. */
    public function siswa()
    {
        return Student::whereIn('id_kelas', $this->kelas ?: ['-'])->orderBy('id_kelas')->orderBy('nama_siswa');
    }
}

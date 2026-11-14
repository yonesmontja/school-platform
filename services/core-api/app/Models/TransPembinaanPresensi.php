<?php

namespace App\Models;

use Carbon\Carbon;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Collection;

/**
 * Rencana pembinaan bagi siswa yang kehadirannya perlu perhatian.
 * Status OTOMATIS mengikuti data presensi: Direncanakan sebelum tanggal mulai, Berlangsung sesudahnya,
 * dan Selesai sendiri setelah HARI_PULIH hari presensi berturut-turut tanpa alpa (dihitung sejak mulai, diulang dari nol setiap kali alpa).
 */
class TransPembinaanPresensi extends Model
{
    protected $table = 'trans_pembinaan_presensi';
    protected $primaryKey = 'id_pembinaan';
    public $incrementing = false;
    protected $keyType = 'string';

    public const STATUS = ['OTOMATIS', 'BERLANGSUNG', 'SELESAI', 'BATAL'];
    public const HARI_PULIH = 10;

    public const OPSI = [
        'Bicara empat mata dengan siswa',
        'Menghubungi orang tua/wali (WA atau telepon)',
        'Pertemuan dengan orang tua di sekolah',
        'Kunjungan rumah',
        'Kesepakatan kehadiran bersama siswa',
        'Pendampingan teman sebaya',
        'Pemantauan kehadiran harian',
        'Rujukan ke kepala sekolah / guru BK',
    ];

    protected $fillable = [
        'id_pembinaan', 'id_siswa', 'id_kelas', 'id_periode', 'tindakan', 'catatan', 'tanggal_mulai', 'tanggal_tindak_lanjut',
        'status', 'hasil', 'tanggal_selesai', 'jurnal', 'ringkasan_awal', 'dibuat_oleh',
    ];

    protected $casts = [
        'tindakan' => 'array', 'jurnal' => 'array', 'ringkasan_awal' => 'array',
        'tanggal_mulai' => 'date:Y-m-d', 'tanggal_tindak_lanjut' => 'date:Y-m-d', 'tanggal_selesai' => 'date:Y-m-d',
    ];

    public function siswa(): BelongsTo { return $this->belongsTo(Student::class, 'id_siswa', 'id_siswa'); }
    public function kelas(): BelongsTo { return $this->belongsTo(Classes::class, 'id_kelas', 'id_kelas'); }
    public function pembuat(): BelongsTo { return $this->belongsTo(User::class, 'dibuat_oleh'); }

    /**
     * Status efektif tiap rencana (DIRENCANAKAN | BERLANGSUNG | SELESAI | BATAL) beserta kemajuan pemulihan,
     * dihitung sekaligus untuk banyak rencana dari presensi harian siswa-siswanya.
     * @return array<string, array{status: string, otomatis: bool, hari_tercatat: int, alpa: int, beruntun: int}>
     */
    public static function statusEfektif(Collection $daftar, ?string $hariIni = null): array
    {
        $hariIni ??= now(config('app.zona_sekolah'))->toDateString();
        $otomatis = $daftar->where('status', 'OTOMATIS');
        $presensi = $otomatis->isEmpty() ? collect() : TransPresensi::whereIn('id_siswa', $otomatis->pluck('id_siswa')->unique())
            ->where('tanggal', '>=', $otomatis->min(fn($r) => $r->tanggal_mulai->toDateString()))
            ->get(['id_siswa', 'tanggal', 'status_kehadiran'])->groupBy('id_siswa');

        $hasil = [];
        foreach ($daftar as $r) {
            $sejak = ($presensi[$r->id_siswa] ?? collect())->filter(fn($p) => $p->tanggal->toDateString() >= $r->tanggal_mulai->toDateString())
                ->sortBy(fn($p) => $p->tanggal->toDateString())->values();
            // Hari tercatat berturut-turut tanpa alpa sejak alpa terakhir
            $beruntun = 0;
            foreach ($sejak as $p) $beruntun = $p->status_kehadiran === 'ALPA' ? 0 : $beruntun + 1;
            $info = ['hari_tercatat' => $sejak->count(), 'alpa' => $sejak->where('status_kehadiran', 'ALPA')->count(), 'beruntun' => $beruntun, 'otomatis' => $r->status === 'OTOMATIS'];
            $info['status'] = match (true) {
                $r->status !== 'OTOMATIS' => $r->status,
                $r->tanggal_mulai->toDateString() > $hariIni => 'DIRENCANAKAN',
                $beruntun >= self::HARI_PULIH => 'SELESAI',
                default => 'BERLANGSUNG',
            };
            $hasil[$r->id_pembinaan] = $info;
        }
        return $hasil;
    }
}

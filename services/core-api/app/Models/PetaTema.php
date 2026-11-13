<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Str;

/**
 * Peta Tema (spider web) kurikulum Pengkajian Budaya Papua dan Modernisasi (PBPM): satu tema lintas mapel per kelas.
 * - jaring: {kategori, mapel: [{id, id_mapel, nama, kalibrasi, tp[]}], konsep: [{id, label, detail}]}
 * - minggu: [{ke, judul, realita, imajinasi, makna, produk}] sebanyak jumlah_minggu
 * - pola: {senin..sabtu: teks kegiatan}
 * Alur status sama dengan ATP & modul ajar: DRAF → DIAJUKAN → DISETUJUI / REVISI.
 */
class PetaTema extends Model
{
    public const HARI = ['senin', 'selasa', 'rabu', 'kamis', 'jumat', 'sabtu'];
    public const KOLOM_MINGGU = ['judul', 'realita', 'imajinasi', 'makna', 'produk'];
    public const MAKS_CABANG = 12;
    public const MAKS_MINGGU = 12;
    public const PENDEKATAN_BAWAAN = 'Belajar dimulai dari inisiatif anak (anak memilih di tiap Rencana Sukses); alur MBK Syntax: '
        . 'Discovery - Konsep - Rencana Sukses - Implementasi - Evaluasi; penilaian STNKM skala 1-4; tidak ada perbandingan antarsiswa.';

    protected $table = 'peta_tema';
    protected $primaryKey = 'id_peta';
    public $incrementing = false;
    protected $keyType = 'string';
    protected $fillable = [
        'id_peta', 'judul', 'id_kelas', 'id_periode', 'fase', 'tanggal_mulai', 'jumlah_minggu', 'pendekatan', 'konteks_lokal',
        'jaring', 'minggu', 'pola', 'status', 'catatan_revisi', 'versi', 'sumber', 'ai_mode', 'dibuat_oleh', 'disetujui_oleh', 'disetujui_pada',
    ];
    protected $casts = [
        'jaring' => 'array', 'minggu' => 'array', 'pola' => 'array', 'tanggal_mulai' => 'date:Y-m-d',
        'jumlah_minggu' => 'integer', 'versi' => 'integer', 'disetujui_pada' => 'datetime',
    ];

    public function kelas(): BelongsTo { return $this->belongsTo(Classes::class, 'id_kelas', 'id_kelas'); }
    public function periode(): BelongsTo { return $this->belongsTo(MasterPeriode::class, 'id_periode', 'id_periode'); }
    public function pembuat(): BelongsTo { return $this->belongsTo(User::class, 'dibuat_oleh'); }
    public function penyetuju(): BelongsTo { return $this->belongsTo(User::class, 'disetujui_oleh'); }

    private static function teks($v, int $maks): string
    {
        return is_scalar($v) ? mb_substr(trim((string) $v), 0, $maks) : '';
    }

    /** Rapikan jaring dari formulir/AI: batasi panjang & jumlah, beri id stabil, buang cabang kosong. */
    public static function normalJaring($jaring): array
    {
        $jaring = is_array($jaring) ? $jaring : [];
        $mapel = collect(is_array($jaring['mapel'] ?? null) ? $jaring['mapel'] : [])->filter(fn($c) => is_array($c))
            ->map(fn($c) => [
                'id' => self::teks($c['id'] ?? '', 40) ?: Str::lower(Str::random(8)),
                'id_mapel' => self::teks($c['id_mapel'] ?? '', 50) ?: null,
                'nama' => self::teks($c['nama'] ?? '', 80),
                'kalibrasi' => self::teks($c['kalibrasi'] ?? '', 600),
                'tp' => array_values(array_unique(array_filter(array_map(fn($t) => self::teks($t, 50), is_array($c['tp'] ?? null) ? $c['tp'] : [])))),
            ])->filter(fn($c) => $c['nama'] !== '')->take(self::MAKS_CABANG)->values()->all();
        $konsep = collect(is_array($jaring['konsep'] ?? null) ? $jaring['konsep'] : [])->filter(fn($c) => is_array($c))
            ->map(fn($c) => [
                'id' => self::teks($c['id'] ?? '', 40) ?: Str::lower(Str::random(8)),
                'label' => self::teks($c['label'] ?? '', 60),
                'detail' => self::teks($c['detail'] ?? '', 400),
            ])->filter(fn($c) => $c['label'] !== '')->take(self::MAKS_CABANG)->values()->all();
        return ['kategori' => self::teks($jaring['kategori'] ?? '', 40), 'mapel' => $mapel, 'konsep' => $konsep];
    }

    /** Peta mingguan tepat sebanyak $jumlah minggu (baris yang ada dipertahankan, sisanya kosong). */
    public static function normalMinggu($minggu, int $jumlah): array
    {
        $ada = collect(is_array($minggu) ? $minggu : [])->filter(fn($c) => is_array($c))->values();
        return collect(range(1, max(1, min(self::MAKS_MINGGU, $jumlah))))->map(function ($ke) use ($ada) {
            $baris = $ada->first(fn($m) => (int) ($m['ke'] ?? 0) === $ke) ?? $ada->get($ke - 1) ?? [];
            return ['ke' => $ke] + collect(self::KOLOM_MINGGU)->mapWithKeys(fn($k) => [$k => self::teks($baris[$k] ?? '', $k === 'judul' ? 80 : 800)])->all();
        })->all();
    }

    public static function normalPola($pola): array
    {
        $pola = is_array($pola) ? $pola : [];
        return collect(self::HARI)->mapWithKeys(fn($h) => [$h => self::teks($pola[$h] ?? '', 600)])->all();
    }
}

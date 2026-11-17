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
 * - pola_slot: {menit_jp, jam_masuk, jam_pulang, slot: [{id, hari 1..6, mulai, selesai, id_mapel|null, kegiatan, ulang}]}
 *   pola terstruktur yang dijadikan sesi Jadwal (slot tanpa mapel = kegiatan kelas, tidak menjadi sesi).
 * Disusun & ditetapkan kepala sekolah (admin boleh mengisi atas nama kepala sekolah); guru/wali kelas melihat.
 * DISETUJUI = "Ditetapkan". Setelah jadwal dibuat, pola hanya boleh berubah BATAS_PERUBAHAN kali sebelum terkunci.
 */
class PetaTema extends Model
{
    public const HARI = ['senin', 'selasa', 'rabu', 'kamis', 'jumat', 'sabtu'];
    public const KOLOM_MINGGU = ['judul', 'realita', 'imajinasi', 'makna', 'produk'];
    public const MAKS_CABANG = 12;
    public const MAKS_MINGGU = 12;
    public const MODE_LOKAL = 'LOKAL'; // rekomendasi pola mingguan tanpa AI
    public const BATAS_PERUBAHAN = 3;
    public const FREKUENSI = ['HARIAN', 'PILIH', 'DUA_MINGGU'];
    public const ULANG = ['MINGGUAN', 'GANJIL', 'GENAP']; // GANJIL/GENAP = minggu tema ke-1,3,5… / ke-2,4,6…
    public const MAKS_SLOT = 80;
    public const PENDEKATAN_BAWAAN = 'Belajar dimulai dari inisiatif anak (anak memilih di tiap Rencana Sukses); alur MBK Syntax: '
        . 'Discovery - Konsep - Rencana Sukses - Implementasi - Evaluasi; penilaian STNKM skala 1-4; tidak ada perbandingan antarsiswa.';

    protected $table = 'peta_tema';
    protected $primaryKey = 'id_peta';
    public $incrementing = false;
    protected $keyType = 'string';
    protected $fillable = [
        'id_peta', 'judul', 'id_kelas', 'id_periode', 'fase', 'tanggal_mulai', 'jumlah_minggu', 'pendekatan', 'konteks_lokal',
        'jaring', 'minggu', 'pola', 'pola_slot', 'id_kategori', 'jadwal_dibuat_pada', 'jumlah_perubahan', 'riwayat_pola', 'diinput_oleh', 'status', 'catatan_revisi', 'versi', 'sumber', 'ai_mode', 'dibuat_oleh', 'disetujui_oleh', 'disetujui_pada',
    ];
    protected $casts = [
        'jaring' => 'array', 'minggu' => 'array', 'pola' => 'array', 'pola_slot' => 'array', 'riwayat_pola' => 'array',
        'jadwal_dibuat_pada' => 'datetime', 'jumlah_perubahan' => 'integer', 'tanggal_mulai' => 'date:Y-m-d',
        'jumlah_minggu' => 'integer', 'versi' => 'integer', 'disetujui_pada' => 'datetime',
    ];

    public function kelas(): BelongsTo { return $this->belongsTo(Classes::class, 'id_kelas', 'id_kelas'); }
    public function periode(): BelongsTo { return $this->belongsTo(MasterPeriode::class, 'id_periode', 'id_periode'); }
    public function pembuat(): BelongsTo { return $this->belongsTo(User::class, 'dibuat_oleh'); }
    public function penyetuju(): BelongsTo { return $this->belongsTo(User::class, 'disetujui_oleh'); }
    public function penginput(): BelongsTo { return $this->belongsTo(User::class, 'diinput_oleh'); }
    /** High Level peta tema (dulu "Kategori pusat"); Materi kelas ini memakai High Level yang sama. */
    public function kategori(): BelongsTo { return $this->belongsTo(MasterKategoriPenilaian::class, 'id_kategori', 'id_kategori'); }

    /** Setelah jadwal dibuat, pola sudah diubah sebanyak batas: guru tidak bisa lagi mengubah sesi tema. */
    public function terkunci(): bool
    {
        return $this->jadwal_dibuat_pada !== null && $this->jumlah_perubahan >= self::BATAS_PERUBAHAN;
    }

    /** Catat satu perubahan pola (setelah jadwal dibuat) ke riwayat untuk dipantau kepala sekolah. */
    public function catatPerubahan(?User $oleh, string $sumber, string $ringkas, bool $hitung = true): void
    {
        $riwayat = $this->riwayat_pola ?? [];
        $riwayat[] = ['waktu' => now(config('app.zona_sekolah'))->format('Y-m-d H:i'), 'oleh' => $oleh?->id, 'nama' => $oleh?->name,
            'peran' => $oleh?->role, 'sumber' => $sumber, 'ringkas' => mb_substr($ringkas, 0, 300), 'dihitung' => $hitung];
        $this->riwayat_pola = array_slice($riwayat, -50);
        if ($hitung) $this->jumlah_perubahan = $this->jumlah_perubahan + 1;
    }

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
                // Parameter jadwal: JP per minggu & hari yang mengikuti pola (setiap hari, hari pilihan, atau dua minggu sekali)
                'jp_minggu' => max(0, min(40, (int) ($c['jp_minggu'] ?? 0))),
                'frekuensi' => in_array($c['frekuensi'] ?? null, self::FREKUENSI, true) ? $c['frekuensi'] : 'PILIH',
                'hari' => array_values(array_unique(array_filter(array_map('intval', is_array($c['hari'] ?? null) ? $c['hari'] : []), fn($h) => $h >= 1 && $h <= 6))),
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

    /** Rapikan pola terstruktur; slot tidak sah (jam terbalik, hari di luar Senin–Sabtu) dibuang, diurut per hari & jam. */
    public static function normalSlot($pola): array
    {
        $pola = is_array($pola) ? $pola : [];
        $jam = fn($v, $bawaan) => is_string($v) && preg_match('/^([01]\d|2[0-3]):[0-5]\d$/', $v) ? $v : $bawaan;
        $slot = collect(is_array($pola['slot'] ?? null) ? $pola['slot'] : [])->filter(fn($x) => is_array($x))
            ->map(fn($x) => [
                'id' => self::teks($x['id'] ?? '', 40) ?: Str::lower(Str::random(8)),
                'hari' => (int) ($x['hari'] ?? 0),
                'mulai' => $jam($x['mulai'] ?? null, ''), 'selesai' => $jam($x['selesai'] ?? null, ''),
                'id_mapel' => self::teks($x['id_mapel'] ?? '', 50) ?: null,
                'kegiatan' => self::teks($x['kegiatan'] ?? '', 300),
                'ulang' => in_array($x['ulang'] ?? null, self::ULANG, true) ? $x['ulang'] : 'MINGGUAN',
            ])
            ->filter(fn($x) => $x['hari'] >= 1 && $x['hari'] <= 6 && $x['mulai'] !== '' && $x['selesai'] > $x['mulai'] && ($x['id_mapel'] || $x['kegiatan'] !== ''))
            ->unique('id')->sortBy(fn($x) => sprintf('%d %s', $x['hari'], $x['mulai']))->take(self::MAKS_SLOT)->values()->all();
        return [
            'menit_jp' => max(20, min(60, (int) ($pola['menit_jp'] ?? 35))),
            'jam_masuk' => $jam($pola['jam_masuk'] ?? null, '07:30'), 'jam_pulang' => $jam($pola['jam_pulang'] ?? null, '12:30'),
            'slot' => $slot,
        ];
    }

    public static function normalPola($pola): array
    {
        $pola = is_array($pola) ? $pola : [];
        return collect(self::HARI)->mapWithKeys(fn($h) => [$h => self::teks($pola[$h] ?? '', 600)])->all();
    }
}

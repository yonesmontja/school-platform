<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Modul ajar format Perencanaan Pembelajaran Mendalam (RPM); Draf → Diajukan → Disetujui / Perlu revisi.
 * Isi: lihat ModulAjar::kosong() untuk susunannya.
 */
class ModulAjar extends Model
{
    // Bagian isi (teks bebas, boleh berbaris) per kelompok RPM
    public const BAGIAN = [
        'identifikasi' => ['peserta_didik', 'materi'],
        'desain' => ['capaian', 'lintas_disiplin', 'tujuan', 'topik', 'praktik_pedagogis', 'kemitraan', 'lingkungan', 'digital'],
        'asesmen' => ['awal', 'proses', 'akhir'],
    ];
    public const LANGKAH = ['awal', 'memahami', 'mengaplikasi', 'merefleksi', 'penutup'];

    protected $table = 'modul_ajar';
    protected $primaryKey = 'id_modul';
    public $incrementing = false;
    protected $keyType = 'string';
    protected $fillable = [
        'id_modul', 'judul', 'id_mapel', 'id_kelas', 'id_periode', 'id_atp', 'id_materi', 'id_paket', 'fase', 'tp',
        'jumlah_pertemuan', 'jp_per_pertemuan', 'isi', 'status', 'catatan_revisi', 'versi', 'sumber', 'ai_mode',
        'dibuat_oleh', 'disetujui_oleh', 'disetujui_pada',
    ];
    protected $casts = ['tp' => 'array', 'isi' => 'array', 'jumlah_pertemuan' => 'integer', 'jp_per_pertemuan' => 'integer', 'versi' => 'integer', 'disetujui_pada' => 'datetime'];

    public function mapel(): BelongsTo { return $this->belongsTo(Subject::class, 'id_mapel', 'id_mapel'); }
    public function kelas(): BelongsTo { return $this->belongsTo(Classes::class, 'id_kelas', 'id_kelas'); }
    public function periode(): BelongsTo { return $this->belongsTo(MasterPeriode::class, 'id_periode', 'id_periode'); }
    public function atp(): BelongsTo { return $this->belongsTo(Atp::class, 'id_atp', 'id_atp'); }
    public function materi(): BelongsTo { return $this->belongsTo(MasterMateri::class, 'id_materi', 'id_materi'); }
    public function paket(): BelongsTo { return $this->belongsTo(PaketSoal::class, 'id_paket', 'id_paket'); }
    public function pembuat(): BelongsTo { return $this->belongsTo(User::class, 'dibuat_oleh'); }
    public function penyetuju(): BelongsTo { return $this->belongsTo(User::class, 'disetujui_oleh'); }

    /** Isi kosong yang lengkap susunannya. */
    public static function kosong(int $pertemuan = 1): array
    {
        $isi = [];
        foreach (self::BAGIAN as $k => $bagian) $isi[$k] = array_fill_keys($bagian, '');
        $isi['identifikasi']['profil_lulusan'] = [];
        $isi['pertemuan'] = array_map(fn($i) => ['ke' => $i + 1, 'jp' => null] + array_fill_keys(self::LANGKAH, ''), range(0, max(1, $pertemuan) - 1));
        $isi['diferensiasi'] = '';
        $isi['lkpd'] = '';
        return $isi;
    }

    /** Bersihkan isi dari editor/AI: hanya bagian yang dikenal, teks dipangkas. */
    public static function normalisasi(mixed $isi, int $pertemuan): array
    {
        $isi = is_array($isi) ? $isi : [];
        $teks = fn($v, $maks = 8000) => mb_substr(trim(is_array($v) ? implode("\n", array_map(fn($x) => is_scalar($x) ? (string) $x : '', $v)) : (is_scalar($v) ? (string) $v : '')), 0, $maks);
        $hasil = self::kosong($pertemuan);
        foreach (self::BAGIAN as $k => $bagian) {
            foreach ($bagian as $b) $hasil[$k][$b] = $teks($isi[$k][$b] ?? '');
        }
        $hasil['identifikasi']['profil_lulusan'] = array_values(array_intersect((array) ($isi['identifikasi']['profil_lulusan'] ?? []), Atp::PROFIL_LULUSAN));
        $dari = array_values(array_filter((array) ($isi['pertemuan'] ?? []), 'is_array'));
        foreach ($hasil['pertemuan'] as $i => &$p) {
            $p['jp'] = is_numeric($dari[$i]['jp'] ?? null) ? min(max((int) $dari[$i]['jp'], 0), 40) : null;
            foreach (self::LANGKAH as $l) $p[$l] = $teks($dari[$i][$l] ?? '');
        }
        unset($p);
        $hasil['diferensiasi'] = $teks($isi['diferensiasi'] ?? '');
        $hasil['lkpd'] = $teks($isi['lkpd'] ?? '', 15000);
        return $hasil;
    }
}

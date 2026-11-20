<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class TransJurnal extends Model
{
    // Data semester yang sudah ditutup & dikunci hanya bisa dibaca (kecuali admin)
    use \App\Models\Concerns\TerkunciPeriode;

    protected $table = 'trans_jurnal';
    protected $primaryKey = 'id_jurnal';
    public $incrementing = false;
    protected $keyType = 'string';

    protected $fillable = [
        'id_jurnal', 'tanggal', 'id_siswa', 'id_kelas', 'id_guru',
        'id_jenis', 'id_materi', 'narasi_kejadian', 'lampiran_url',
        'mode_dampak', 'sensitif', 'val_S', 'val_T', 'val_N', 'val_K', 'val_M',
        'ai_mode', 'ai_raw_response', 'dicatat_oleh'
    ];

    // Akun yang menulis jurnal tercatat otomatis (form, impor, presensi, pembinaan); bisa berbeda dari guru yang tercatat
    protected static function booted(): void
    {
        static::creating(function (self $j) {
            if (!$j->dicatat_oleh && auth()->id()) $j->dicatat_oleh = auth()->id();
        });
    }

    protected $casts = [
        'tanggal' => 'date:Y-m-d',
        'sensitif' => 'boolean',
        'val_S' => 'float',
        'val_T' => 'float',
        'val_N' => 'float',
        'val_K' => 'float',
        'val_M' => 'float',
    ];

    /**
     * Narasi jurnal sensitif hanya boleh dibaca admin, kepala sekolah, guru penulisnya, dan wali kelas siswa.
     * Peninjau, guru lain, dan akun portal hanya tahu ada catatan tertutup; skor STNKM tetap dihitung.
     */
    public function bolehDibaca(?User $user): bool
    {
        if (!$this->sensitif) return true;
        if (!$user) return false;
        if ($user->isAdmin() || $user->isKepsek()) return true;
        if ($this->dicatat_oleh && $this->dicatat_oleh === $user->id) return true;
        return $user->isGuru() && $user->id_guru
            && ($this->id_guru === $user->id_guru || in_array($this->id_kelas, $user->kelasBinaan(), true));
    }

    /** Kosongkan narasi, lampiran, dan respons AI jurnal sensitif yang tidak boleh dibaca akun ini. */
    public static function samarkan(iterable $jurnal, ?User $user): iterable
    {
        foreach ($jurnal as $j) {
            if ($j->bolehDibaca($user)) continue;
            $j->narasi_kejadian = null;
            $j->lampiran_url = null;
            $j->ai_raw_response = null;
            $j->setAttribute('tersembunyi', true);
        }
        return $jurnal;
    }

    public function siswa(): BelongsTo { return $this->belongsTo(Student::class, 'id_siswa', 'id_siswa'); }
    public function kelas(): BelongsTo { return $this->belongsTo(Classes::class, 'id_kelas', 'id_kelas'); }
    public const PEMISAH_RESPONS = "
Respons siswa: ";

    /** Isi satu versi catatan (riwayat seperti git): catatan & respons siswa dipisah, tanggal, dan skor STNKM. */
    public function isiVersi(): array
    {
        [$catatan, $respons] = array_pad(explode(self::PEMISAH_RESPONS, (string) $this->narasi_kejadian, 2), 2, '');
        return [
            'tanggal' => $this->tanggal?->toDateString(), 'catatan' => $catatan, 'respons' => $respons,
            'skor' => ['S' => (float) $this->val_S, 'T' => (float) $this->val_T, 'N' => (float) $this->val_N, 'K' => (float) $this->val_K, 'M' => (float) $this->val_M],
        ];
    }

    public function pencatat(): BelongsTo { return $this->belongsTo(User::class, 'dicatat_oleh'); }
    public function guru(): BelongsTo { return $this->belongsTo(Teacher::class, 'id_guru', 'id_guru'); }
    public function jenis(): BelongsTo { return $this->belongsTo(MasterMBK::class, 'id_jenis', 'id_jenis'); }
    public function materi(): BelongsTo { return $this->belongsTo(MasterMateri::class, 'id_materi', 'id_materi'); }
}

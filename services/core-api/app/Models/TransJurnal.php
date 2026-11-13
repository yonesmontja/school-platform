<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class TransJurnal extends Model
{
    protected $table = 'trans_jurnal';
    protected $primaryKey = 'id_jurnal';
    public $incrementing = false;
    protected $keyType = 'string';

    protected $fillable = [
        'id_jurnal', 'tanggal', 'id_siswa', 'id_kelas', 'id_guru',
        'id_jenis', 'id_materi', 'narasi_kejadian', 'lampiran_url',
        'mode_dampak', 'sensitif', 'val_S', 'val_T', 'val_N', 'val_K', 'val_M',
        'ai_mode', 'ai_raw_response'
    ];

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
    public function guru(): BelongsTo { return $this->belongsTo(Teacher::class, 'id_guru', 'id_guru'); }
    public function jenis(): BelongsTo { return $this->belongsTo(MasterMBK::class, 'id_jenis', 'id_jenis'); }
    public function materi(): BelongsTo { return $this->belongsTo(MasterMateri::class, 'id_materi', 'id_materi'); }
}

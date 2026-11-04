<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** Hasil asesmen diagnostik non-kognitif satu siswa pada satu semester. */
class TransDiagnostikNonkognitif extends Model
{
    protected $table = 'trans_diagnostik_nonkognitif';

    public const GAYA_BELAJAR = ['VISUAL', 'AUDITORI', 'KINESTETIK'];
    public const KESEJAHTERAAN = ['BAIK', 'CUKUP', 'PERLU_PERHATIAN'];
    public const DUKUNGAN = ['BAIK', 'CUKUP', 'KURANG'];

    protected $fillable = ['id_siswa', 'id_periode', 'gaya_belajar', 'minat', 'kesejahteraan', 'dukungan_rumah', 'catatan', 'diisi_oleh'];

    public function siswa(): BelongsTo { return $this->belongsTo(Student::class, 'id_siswa', 'id_siswa'); }
}

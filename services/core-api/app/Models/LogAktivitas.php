<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use LogicException;

/**
 * Satu tindakan pengguna dalam audit trail. Hanya bisa ditambah; mengubah atau menghapusnya ditolak.
 */
class LogAktivitas extends Model
{
    protected $table = 'log_aktivitas';
    public $timestamps = false;
    protected $guarded = ['id'];

    protected $casts = [
        'waktu' => 'datetime',
        'meta' => 'array',
        'berhasil' => 'boolean',
    ];

    protected static function booted(): void
    {
        static::updating(fn() => throw new LogicException('Log aktivitas tidak boleh diubah.'));
        static::deleting(fn() => throw new LogicException('Log aktivitas tidak boleh dihapus.'));
    }

    public function user(): BelongsTo { return $this->belongsTo(User::class); }
    public function perubahan(): HasMany { return $this->hasMany(LogPerubahan::class, 'id_log'); }
}

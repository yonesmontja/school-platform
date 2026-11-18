<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class KeuTagihan extends Model
{
    protected $table = 'keu_tagihan';

    protected $fillable = [
        'id_siswa', 'id_jenis_biaya', 'periode_kode', 'judul', 'nominal', 'potongan', 'keterangan_potongan',
        'terbayar', 'jatuh_tempo', 'status', 'alasan_batal', 'dibuat_oleh',
    ];

    protected $casts = ['nominal' => 'integer', 'potongan' => 'integer', 'terbayar' => 'integer', 'jatuh_tempo' => 'date:Y-m-d'];

    protected $appends = ['sisa'];

    public function getSisaAttribute(): int
    {
        return $this->status === 'BATAL' ? 0 : max(0, $this->nominal - $this->potongan - $this->terbayar);
    }

    /** Hitung ulang jumlah terbayar dari pembayaran yang tidak dibatalkan, lalu status. */
    public function hitungUlang(): void
    {
        if ($this->status === 'BATAL') return;
        $this->terbayar = (int) KeuPembayaranRincian::where('id_tagihan', $this->id)
            ->whereHas('pembayaran', fn($q) => $q->whereNull('dibatalkan_at'))->sum('jumlah');
        $harus = $this->nominal - $this->potongan;
        $this->status = $this->terbayar >= $harus ? 'LUNAS' : ($this->terbayar > 0 ? 'SEBAGIAN' : 'BELUM');
        $this->save();
    }

    public function siswa(): BelongsTo
    {
        return $this->belongsTo(Student::class, 'id_siswa', 'id_siswa');
    }

    public function jenisBiaya(): BelongsTo
    {
        return $this->belongsTo(KeuJenisBiaya::class, 'id_jenis_biaya');
    }

    public function rincian(): HasMany
    {
        return $this->hasMany(KeuPembayaranRincian::class, 'id_tagihan');
    }

    public function pembuat(): BelongsTo
    {
        return $this->belongsTo(User::class, 'dibuat_oleh');
    }
}

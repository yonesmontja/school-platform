<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/** Foto/video yang disisipkan di editor catatan (berkas di disk public: lampiran/...). */
class TransLampiran extends Model
{
    protected $table = 'trans_lampiran';
    protected $primaryKey = 'id_lampiran';
    public $incrementing = false;
    protected $keyType = 'string';

    protected $fillable = ['id_lampiran', 'entitas', 'id_entitas', 'jenis', 'path', 'nama_asli', 'mime', 'ukuran', 'dibuat_oleh'];
    protected $appends = ['url'];

    public function getUrlAttribute(): string { return '/storage/' . $this->path; }
}

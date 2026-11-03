<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class MasterProyek extends Model
{
    protected $table = 'master_proyek';
    protected $primaryKey = 'id_proyek';
    public $incrementing = false;
    protected $keyType = 'string';

    protected $fillable = ['id_proyek', 'judul_proyek', 'bentuk', 'deskripsi_proyek', 'fase', 'id_kelas', 'id_periode'];

    public function targets(): HasMany { return $this->hasMany(MasterTargetP5::class, 'id_proyek', 'id_proyek'); }
    public function kelas(): BelongsTo { return $this->belongsTo(Classes::class, 'id_kelas', 'id_kelas'); }
}

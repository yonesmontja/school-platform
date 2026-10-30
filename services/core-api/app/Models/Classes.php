<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Classes extends Model
{
    use HasFactory;

    protected $table = 'classes';
    protected $primaryKey = 'id_kelas';
    public $incrementing = false;
    protected $keyType = 'string';

    protected $fillable = [
        'id_kelas', 'nama_kelas', 'wali_kelas'
    ];

    public function waliKelas(): BelongsTo
    {
        return $this->belongsTo(Teacher::class, 'wali_kelas', 'id_guru');
    }

    public function students(): HasMany
    {
        return $this->hasMany(Student::class, 'id_kelas', 'id_kelas');
    }
}
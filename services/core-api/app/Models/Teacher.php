<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Teacher extends Model
{
    use HasFactory;

    protected $table = 'teachers';
    protected $primaryKey = 'id_guru';
    public $incrementing = false;
    protected $keyType = 'string';

    protected $fillable = [
        'id_guru', 'nama_guru', 'nip_nik', 'ttd_guru_url'
    ];

    public function classes(): HasMany
    {
        return $this->hasMany(Classes::class, 'wali_kelas', 'id_guru');
    }
}
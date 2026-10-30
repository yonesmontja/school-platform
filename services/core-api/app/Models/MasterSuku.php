<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class MasterSuku extends Model
{
    use HasFactory;

    protected $table = 'master_suku';
    protected $primaryKey = 'id_suku';
    public $incrementing = false;
    protected $keyType = 'string';

    protected $fillable = ['id_suku', 'nama_suku'];

    public function students(): HasMany
    {
        return $this->hasMany(Student::class, 'id_suku', 'id_suku');
    }
}
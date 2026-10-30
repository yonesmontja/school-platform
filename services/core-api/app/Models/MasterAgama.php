<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class MasterAgama extends Model
{
    use HasFactory;

    protected $table = 'master_agama';
    protected $primaryKey = 'id_agama';
    public $incrementing = false;
    protected $keyType = 'string';

    protected $fillable = ['id_agama', 'nama_agama'];

    public function students(): HasMany
    {
        return $this->hasMany(Student::class, 'id_agama', 'id_agama');
    }
}
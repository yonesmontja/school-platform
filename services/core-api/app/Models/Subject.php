<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Subject extends Model {
    protected $table = 'subjects';
    protected $primaryKey = 'id_mapel';
    public $incrementing = false;
    protected $keyType = 'string';
    protected $fillable = ['id_mapel', 'nama_mapel', 'kelompok', 'id_guru'];

    public function guru(): BelongsTo {
        return $this->belongsTo(Teacher::class, 'id_guru', 'id_guru');
    }
}
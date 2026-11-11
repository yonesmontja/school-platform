<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class RenderApi extends Model
{
    protected $table = 'render_api';
    public $incrementing = false;
    protected $keyType = 'string';
    protected $fillable = ['id', 'id_klien', 'status', 'episode', 'templat', 'payload', 'props', 'suara', 'peringatan', 'pesan',
        'file_path', 'poster_path', 'durasi_detik', 'ukuran_kb', 'aset', 'mulai_render', 'selesai_pada'];
    protected $casts = ['payload' => 'array', 'props' => 'array', 'peringatan' => 'array', 'aset' => 'array',
        'mulai_render' => 'datetime', 'selesai_pada' => 'datetime'];

    public function klien() { return $this->belongsTo(ApiKlien::class, 'id_klien'); }
}

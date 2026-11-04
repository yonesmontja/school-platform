<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/** Penanda notifikasi yang sudah dibaca seorang pengguna (tidak masuk audit trail). */
class NotifikasiDibaca extends Model
{
    protected $table = 'notifikasi_dibaca';
    public $timestamps = false;
    protected $fillable = ['user_id', 'kunci', 'dibaca_pada'];
    public bool $tanpaAudit = true;
}

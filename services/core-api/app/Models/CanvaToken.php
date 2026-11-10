<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/** Token Canva Connect milik satu pengguna (E3). Token terenkripsi dan tidak pernah dikirim ke frontend. */
class CanvaToken extends Model
{
    protected $table = 'canva_token';
    protected $fillable = ['id_user', 'access_token', 'refresh_token', 'kedaluwarsa', 'nama_canva'];
    protected $hidden = ['access_token', 'refresh_token'];
    protected $casts = ['access_token' => 'encrypted', 'refresh_token' => 'encrypted', 'kedaluwarsa' => 'datetime'];
}

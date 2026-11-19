<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;

/** Notebook riset beberapa dokumen Pustaka (Notebook AI, Fase 23 Tahap B). Milik pribadi pembuatnya. */
class Notebook extends Model
{
    protected $table = 'notebook';
    protected $primaryKey = 'id_notebook';

    public const MAKS_DOKUMEN = 8;

    protected $fillable = ['judul', 'dibuat_oleh'];

    public function dokumen(): BelongsToMany
    {
        return $this->belongsToMany(DokumenRujukan::class, 'notebook_dokumen', 'id_notebook', 'id_dokumen', 'id_notebook', 'id_dokumen');
    }

    public function catatan(): HasMany { return $this->hasMany(NotebookCatatan::class, 'id_notebook', 'id_notebook'); }
}

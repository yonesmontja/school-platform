<?php

namespace App\Models\Concerns;

use App\Models\MasterPeriode;
use Illuminate\Database\Eloquent\Model;

/**
 * Data semester yang sudah dikunci (Tutup Semester) hanya bisa dibaca. Admin tetap boleh memperbaiki
 * (perubahannya tercatat di Log Aktivitas). Proses tanpa akun (perintah konsol, antrean) tidak dibatasi.
 * Model tanpa kolom id_periode (jurnal) dicocokkan lewat tanggal terhadap rentang semester terkunci.
 */
trait TerkunciPeriode
{
    public static function bootTerkunciPeriode(): void
    {
        static::saving(fn(Model $m) => static::cekKunciPeriode($m));
        static::deleting(fn(Model $m) => static::cekKunciPeriode($m));
    }

    protected static function cekKunciPeriode(Model $m): void
    {
        $user = auth()->user();
        if (!$user || $user->role === 'admin') return;

        $nama = static::semesterTerkunci($m->getAttributes())
            ?? ($m->exists ? static::semesterTerkunci($m->getRawOriginal()) : null);
        if ($nama) {
            abort(423, "Semester {$nama} sudah ditutup dan dikunci. Data semester itu hanya bisa dibaca; minta admin bila perlu perbaikan.");
        }
    }

    /** Nama semester terkunci yang memuat data ini, atau null. */
    protected static function semesterTerkunci(array $attr): ?string
    {
        if (array_key_exists('id_periode', $attr)) {
            if (!$attr['id_periode']) return null;
            $p = MasterPeriode::where('id_periode', $attr['id_periode'])->where('terkunci', true)->first(['tahun_ajaran', 'semester']);
            return $p ? "{$p->tahun_ajaran} {$p->semester}" : null;
        }
        if (empty($attr['tanggal'])) return null;
        $tanggal = substr((string) $attr['tanggal'], 0, 10);
        foreach (MasterPeriode::where('terkunci', true)->get() as $p) {
            [$mulai, $selesai] = $p->rentang();
            if ($tanggal >= $mulai->toDateString() && $tanggal <= $selesai->toDateString()) return "{$p->tahun_ajaran} {$p->semester}";
        }
        return null;
    }
}

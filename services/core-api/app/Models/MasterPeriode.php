<?php
namespace App\Models;

use Carbon\Carbon;
use Illuminate\Database\Eloquent\Model;

class MasterPeriode extends Model {
    protected $table = 'master_periode';
    protected $primaryKey = 'id_periode';
    public $incrementing = false;
    protected $keyType = 'string';
    protected $fillable = ['id_periode', 'tahun_ajaran', 'semester', 'status_aktif', 'tanggal_mulai', 'tanggal_selesai', 'minggu_tidak_efektif'];
    protected $casts = ['tanggal_mulai' => 'date:Y-m-d', 'tanggal_selesai' => 'date:Y-m-d', 'minggu_tidak_efektif' => 'array'];

    /**
     * Rentang tanggal semester. Bila belum diisi admin, dipakai kalender pendidikan umum:
     * Ganjil pertengahan Juli–pertengahan Desember (tahun pertama), Genap awal Januari–akhir Juni (tahun kedua).
     *
     * @return array{0: Carbon, 1: Carbon, 2: bool} [mulai, selesai, bawaan?]
     */
    public function rentang(): array
    {
        if ($this->tanggal_mulai && $this->tanggal_selesai) return [$this->tanggal_mulai->copy()->startOfDay(), $this->tanggal_selesai->copy()->endOfDay(), false];
        preg_match('/(\d{4})\D+(\d{4})/', (string) $this->tahun_ajaran, $m);
        $th1 = (int) ($m[1] ?? now()->year);
        $th2 = (int) ($m[2] ?? $th1 + 1);
        return $this->semester === 'Genap'
            ? [Carbon::create($th2, 1, 1)->startOfWeek()->addWeek()->startOfDay(), Carbon::create($th2, 6, 27)->endOfDay(), true]
            : [Carbon::create($th1, 7, 1)->startOfWeek()->addWeeks(2)->startOfDay(), Carbon::create($th1, 12, 19)->endOfDay(), true];
    }
}

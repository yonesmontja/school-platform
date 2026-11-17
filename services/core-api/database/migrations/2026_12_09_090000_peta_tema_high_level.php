<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * "Kategori pusat" Peta Tema = High Level (master_kategori_penilaian) yang dipakai Materi. Peta tema ditentukan lebih dulu,
 * lalu Materi kelas itu otomatis memakai High Level dari peta temanya. Teks kategori lama dicocokkan ke High Level bernama sama.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('peta_tema', function (Blueprint $table) {
            $table->string('id_kategori', 50)->nullable();
            $table->foreign('id_kategori')->references('id_kategori')->on('master_kategori_penilaian')->nullOnDelete();
        });
        $kategori = DB::table('master_kategori_penilaian')->get(['id_kategori', 'nama_kategori']);
        foreach (DB::table('peta_tema')->get(['id_peta', 'jaring']) as $p) {
            $teks = mb_strtolower(trim((string) (json_decode($p->jaring ?? '{}', true)['kategori'] ?? '')));
            $cocok = $teks !== '' ? $kategori->first(fn($k) => mb_strtolower(trim($k->nama_kategori)) === $teks) : null;
            if ($cocok) DB::table('peta_tema')->where('id_peta', $p->id_peta)->update(['id_kategori' => $cocok->id_kategori]);
        }
    }

    public function down(): void
    {
        Schema::table('peta_tema', function (Blueprint $table) {
            $table->dropForeign(['id_kategori']);
            $table->dropColumn('id_kategori');
        });
    }
};

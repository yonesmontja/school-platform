<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Fase 20: sesi jadwal menautkan perangkat ajar (CP, baris ATP/TP, indikator, butir bank soal) sebagai JSON,
 * dan semester punya rentang tanggal agar minggu efektif Program Semester (Promes) dan Program Tahunan (Prota)
 * bisa dihitung dari kalender sekolah dan hari libur.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('trans_jadwal', function (Blueprint $table) {
            $table->jsonb('perangkat')->nullable(); // [{jenis: CP|ATP|INDIKATOR|SOAL, id, label, atp?}]
        });
        Schema::table('master_periode', function (Blueprint $table) {
            $table->date('tanggal_mulai')->nullable();
            $table->date('tanggal_selesai')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('trans_jadwal', fn(Blueprint $table) => $table->dropColumn('perangkat'));
        Schema::table('master_periode', fn(Blueprint $table) => $table->dropColumn(['tanggal_mulai', 'tanggal_selesai']));
    }
};

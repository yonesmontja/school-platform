<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** Fase 17 Tahap C: sesi jadwal menautkan modul ajar dan pertemuan ke-berapa yang dilaksanakan. */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('trans_jadwal', function (Blueprint $table) {
            $table->string('id_modul', 50)->nullable();
            $table->unsignedSmallInteger('pertemuan_ke')->nullable();
            $table->foreign('id_modul')->references('id_modul')->on('modul_ajar')->nullOnDelete();
            $table->index(['id_modul', 'pertemuan_ke']);
        });
    }

    public function down(): void
    {
        Schema::table('trans_jadwal', function (Blueprint $table) {
            $table->dropForeign(['id_modul']);
            $table->dropIndex(['id_modul', 'pertemuan_ke']);
            $table->dropColumn(['id_modul', 'pertemuan_ke']);
        });
    }
};

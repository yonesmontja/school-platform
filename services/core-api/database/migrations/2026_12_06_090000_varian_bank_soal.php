<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Variasi bank soal (Fase 24 bagian bank soal): soal varian buatan AI menunjuk soal induknya yang sudah disetujui,
 * dengan jenis perubahannya (ANGKA, KONTEKS, KESULITAN, LEVEL).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('bank_soal', function (Blueprint $t) {
            $t->string('id_induk')->nullable()->after('id_kisi_baris');
            $t->string('jenis_varian', 20)->nullable()->after('id_induk');
            $t->foreign('id_induk')->references('id_soal')->on('bank_soal')->nullOnDelete();
            $t->index('id_induk');
        });
    }

    public function down(): void
    {
        Schema::table('bank_soal', function (Blueprint $t) {
            $t->dropForeign(['id_induk']);
            $t->dropIndex(['id_induk']);
            $t->dropColumn(['id_induk', 'jenis_varian']);
        });
    }
};

<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Kriteria Ketercapaian Tujuan Pembelajaran (KKTP) sekolah: batas bawah tiap tingkat capaian
 * (di bawah "cukup" = Perlu Bimbingan). Batas tuntas tetap KKM per mapel.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('school_settings', function (Blueprint $table) {
            $table->unsignedTinyInteger('kktp_cukup')->default(70);
            $table->unsignedTinyInteger('kktp_baik')->default(80);
            $table->unsignedTinyInteger('kktp_sangat_baik')->default(90);
        });
    }

    public function down(): void
    {
        Schema::table('school_settings', fn (Blueprint $table) => $table->dropColumn(['kktp_cukup', 'kktp_baik', 'kktp_sangat_baik']));
    }
};

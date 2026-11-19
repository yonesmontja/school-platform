<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Pas foto siswa untuk biodata rapor dan profil portal. Berkas disimpan privat (disk local):
 * foto_path = hasil edit yang dipakai di rapor, foto_asli_path = unggahan asli agar bisa diedit ulang tanpa menurun kualitasnya.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('students', function (Blueprint $table) {
            $table->string('foto_path', 200)->nullable();
            $table->string('foto_asli_path', 200)->nullable();
            $table->timestamp('foto_diperbarui')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('students', function (Blueprint $table) {
            $table->dropColumn(['foto_path', 'foto_asli_path', 'foto_diperbarui']);
        });
    }
};

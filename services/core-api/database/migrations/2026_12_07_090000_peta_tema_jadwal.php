<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Peta Tema menggerakkan Jadwal: pola mingguan terstruktur (slot jam per hari & mapel) dijadikan sesi Jadwal kelas,
 * sesi tema tertaut balik ke peta & slotnya (sinkron dua arah), perubahan pola setelah jadwal dibuat dibatasi 3 kali.
 * Peta tema ditetapkan kepala sekolah; bila admin yang mengisi, akun admin tercatat di diinput_oleh.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('peta_tema', function (Blueprint $table) {
            $table->jsonb('pola_slot')->nullable();
            $table->timestamp('jadwal_dibuat_pada')->nullable();
            $table->unsignedSmallInteger('jumlah_perubahan')->default(0);
            $table->jsonb('riwayat_pola')->nullable();
            $table->foreignId('diinput_oleh')->nullable()->constrained('users')->nullOnDelete();
        });
        Schema::table('trans_jadwal', function (Blueprint $table) {
            $table->string('id_peta', 50)->nullable();
            $table->string('id_slot_tema', 40)->nullable();
            $table->foreign('id_peta')->references('id_peta')->on('peta_tema')->nullOnDelete();
            $table->index(['id_peta', 'id_slot_tema']);
        });
    }

    public function down(): void
    {
        Schema::table('trans_jadwal', function (Blueprint $table) {
            $table->dropForeign(['id_peta']);
            $table->dropIndex(['id_peta', 'id_slot_tema']);
            $table->dropColumn(['id_peta', 'id_slot_tema']);
        });
        Schema::table('peta_tema', function (Blueprint $table) {
            $table->dropConstrainedForeignId('diinput_oleh');
            $table->dropColumn(['pola_slot', 'jadwal_dibuat_pada', 'jumlah_perubahan', 'riwayat_pola']);
        });
    }
};

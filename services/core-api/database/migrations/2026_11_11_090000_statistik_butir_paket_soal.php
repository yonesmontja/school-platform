<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Fase 16 Tahap D: hasil analisis butir disimpan per butir paket (tingkat kesukaran p, daya beda D, jumlah siswa)
 * agar bank soal tahu soal mana yang teruji baik dan AI belajar darinya saat menyusun draf baru.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('paket_soal_butir', function (Blueprint $table) {
            $table->decimal('stat_p', 4, 2)->nullable();
            $table->decimal('stat_d', 4, 2)->nullable();
            $table->unsignedSmallInteger('stat_n')->nullable();
            $table->string('stat_saran', 255)->nullable();
            $table->timestamp('stat_pada')->nullable();
            $table->index(['id_soal', 'stat_n']);
        });
    }

    public function down(): void
    {
        Schema::table('paket_soal_butir', function (Blueprint $table) {
            $table->dropIndex(['id_soal', 'stat_n']);
            $table->dropColumn(['stat_p', 'stat_d', 'stat_n', 'stat_saran', 'stat_pada']);
        });
    }
};

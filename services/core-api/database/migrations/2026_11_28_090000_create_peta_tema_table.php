<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Peta Tema (spider web) kurikulum PBPM: tema lintas mapel per kelas & semester — jaring mata pelajaran (dengan kalibrasi),
 * jaring konsep, peta mingguan Realita → Imajinasi → Makna → Produk anak, dan pola mingguan. Disetujui kepala sekolah.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('peta_tema', function (Blueprint $table) {
            $table->string('id_peta', 50)->primary();
            $table->string('judul', 200);
            $table->string('id_kelas', 50)->nullable();
            $table->string('id_periode', 50)->nullable();
            $table->string('fase', 5)->nullable();
            $table->date('tanggal_mulai')->nullable();
            $table->unsignedSmallInteger('jumlah_minggu')->default(3);
            $table->text('pendekatan')->nullable();
            $table->text('konteks_lokal')->nullable();
            $table->jsonb('jaring')->nullable();
            $table->jsonb('minggu')->nullable();
            $table->jsonb('pola')->nullable();
            $table->string('status', 20)->default('DRAF');
            $table->text('catatan_revisi')->nullable();
            $table->unsignedInteger('versi')->default(1);
            $table->string('sumber', 10)->default('MANUAL');
            $table->string('ai_mode', 20)->nullable();
            $table->foreignId('dibuat_oleh')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('disetujui_oleh')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('disetujui_pada')->nullable();
            $table->timestamps();

            $table->foreign('id_kelas')->references('id_kelas')->on('classes')->nullOnDelete();
            $table->foreign('id_periode')->references('id_periode')->on('master_periode')->nullOnDelete();
            $table->index(['status', 'id_kelas']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('peta_tema');
    }
};

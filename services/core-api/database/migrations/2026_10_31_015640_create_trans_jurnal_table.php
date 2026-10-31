<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('trans_jurnal', function (Blueprint $table) {
            $table->string('id_jurnal', 50)->primary();
            $table->date('tanggal');

            // Relasi
            $table->string('id_siswa', 50);
            $table->string('id_kelas', 50); // Denormalized untuk filter cepat
            $table->string('id_guru', 50)->nullable();
            $table->string('id_jenis', 50)->nullable(); // MBK (opsional)
            $table->string('id_materi', 50)->nullable(); // Materi (opsional)

            // Narasi & Lampiran
            $table->text('narasi_kejadian');
            $table->string('lampiran_url', 500)->nullable();

            // Mode Dampak
            $table->enum('mode_dampak', ['BONUS', 'PISAH'])->default('PISAH');

            // Poin STNKM Hasil AI (Range -5.0 sampai +5.0)
            $table->decimal('val_S', 5, 2)->default(0);
            $table->decimal('val_T', 5, 2)->default(0);
            $table->decimal('val_N', 5, 2)->default(0);
            $table->decimal('val_K', 5, 2)->default(0);
            $table->decimal('val_M', 5, 2)->default(0);

            // Metadata AI
            $table->enum('ai_mode', ['GEMINI', 'HEURISTIK'])->default('HEURISTIK');
            $table->text('ai_raw_response')->nullable(); // Untuk debug

            $table->timestamps();

            // Foreign Keys
            $table->foreign('id_siswa')->references('id_siswa')->on('students')->cascadeOnDelete();
            $table->foreign('id_kelas')->references('id_kelas')->on('classes')->cascadeOnDelete();

            // Index untuk performa
            $table->index(['id_kelas', 'tanggal']);
            $table->index(['id_siswa', 'tanggal']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('trans_jurnal');
    }
};

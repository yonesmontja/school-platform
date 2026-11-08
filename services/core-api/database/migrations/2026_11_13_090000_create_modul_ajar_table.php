<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Fase 17 Tahap B: modul ajar berformat Perencanaan Pembelajaran Mendalam (RPM): identifikasi, desain pembelajaran,
 * pengalaman belajar per pertemuan (awal, memahami–mengaplikasi–merefleksi, penutup), dan asesmen.
 * Isi disimpan sebagai JSON; TP yang dicakup dan paket soal asesmen ditautkan.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('modul_ajar', function (Blueprint $table) {
            $table->string('id_modul', 50)->primary();
            $table->string('judul', 200);
            $table->string('id_mapel', 50);
            $table->string('id_kelas', 50)->nullable();
            $table->string('id_periode', 50)->nullable();
            $table->string('id_atp', 50)->nullable();
            $table->string('id_materi', 50)->nullable();
            $table->string('id_paket', 50)->nullable(); // paket soal untuk asesmen akhir
            $table->string('fase', 1)->nullable();
            $table->json('tp')->nullable(); // [id_indikator, ...]
            $table->unsignedSmallInteger('jumlah_pertemuan')->default(1);
            $table->unsignedSmallInteger('jp_per_pertemuan')->nullable();
            $table->json('isi')->nullable();
            $table->string('status', 20)->default('DRAF'); // DRAF | DIAJUKAN | DISETUJUI | REVISI
            $table->text('catatan_revisi')->nullable();
            $table->unsignedInteger('versi')->default(1);
            $table->string('sumber', 20)->default('MANUAL');
            $table->string('ai_mode', 20)->nullable();
            $table->foreignId('dibuat_oleh')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('disetujui_oleh')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('disetujui_pada')->nullable();
            $table->timestamps();
            $table->foreign('id_mapel')->references('id_mapel')->on('subjects')->cascadeOnDelete();
            $table->foreign('id_kelas')->references('id_kelas')->on('classes')->nullOnDelete();
            $table->foreign('id_periode')->references('id_periode')->on('master_periode')->nullOnDelete();
            $table->foreign('id_atp')->references('id_atp')->on('atp')->nullOnDelete();
            $table->foreign('id_materi')->references('id_materi')->on('master_materi')->nullOnDelete();
            $table->foreign('id_paket')->references('id_paket')->on('paket_soal')->nullOnDelete();
            $table->index(['status', 'id_mapel']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('modul_ajar');
    }
};

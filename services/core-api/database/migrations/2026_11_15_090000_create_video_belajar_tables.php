<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Fase 19 Tahap A: pustaka Video Belajar. Satu video disimpan sekali lalu ditautkan ke mana saja:
 * modul ajar (per pertemuan), sesi jadwal, stimulus soal (bank_soal.id_video), dan Portal Siswa.
 * Sumber: REMOTION (jalur A, dibuat di remotion-video), RENDER (jalur B, dirender server dari templat), UNGGAH (berkas guru).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('video_belajar', function (Blueprint $table) {
            $table->string('id_video', 50)->primary();
            $table->string('judul', 200);
            $table->text('deskripsi')->nullable();
            $table->string('id_mapel', 50)->nullable();
            $table->string('id_kelas', 50)->nullable();
            $table->string('fase', 1)->nullable();
            $table->string('id_materi', 50)->nullable();
            $table->json('tp')->nullable();
            $table->string('file_url', 500);
            $table->string('poster_url', 500)->nullable();
            $table->unsignedInteger('durasi_detik')->nullable();
            $table->unsignedInteger('ukuran_kb')->nullable();
            $table->string('sumber', 20)->default('UNGGAH'); // REMOTION | RENDER | UNGGAH
            $table->string('komposisi', 100)->nullable(); // id komposisi Remotion (jalur A/B)
            $table->json('props')->nullable();
            $table->string('narasi', 20)->nullable(); // Tahap B: GURU | NETRAL | KLON
            $table->string('status', 20)->default('DRAF'); // DRAF | DIAJUKAN | DISETUJUI | REVISI
            $table->text('catatan_revisi')->nullable();
            $table->foreignId('dibuat_oleh')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('disetujui_oleh')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('disetujui_pada')->nullable();
            $table->timestamps();
            $table->foreign('id_mapel')->references('id_mapel')->on('subjects')->nullOnDelete();
            $table->foreign('id_kelas')->references('id_kelas')->on('classes')->nullOnDelete();
            $table->foreign('id_materi')->references('id_materi')->on('master_materi')->nullOnDelete();
            $table->index(['status', 'id_mapel']);
        });

        // Tautan ke modul ajar (per pertemuan) dan sesi jadwal; satu video bisa ditautkan berkali-kali
        Schema::create('video_tautan', function (Blueprint $table) {
            $table->id();
            $table->string('id_video', 50);
            $table->string('jenis', 20); // MODUL | JADWAL
            $table->string('id_target', 50);
            $table->unsignedSmallInteger('pertemuan_ke')->nullable();
            $table->unsignedSmallInteger('urutan')->default(0);
            $table->timestamps();
            $table->foreign('id_video')->references('id_video')->on('video_belajar')->cascadeOnDelete();
            $table->unique(['id_video', 'jenis', 'id_target', 'pertemuan_ke']);
            $table->index(['jenis', 'id_target']);
        });

        Schema::table('bank_soal', function (Blueprint $table) {
            $table->string('id_video', 50)->nullable();
            $table->foreign('id_video')->references('id_video')->on('video_belajar')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('bank_soal', function (Blueprint $table) {
            $table->dropForeign(['id_video']);
            $table->dropColumn('id_video');
        });
        Schema::dropIfExists('video_tautan');
        Schema::dropIfExists('video_belajar');
    }
};

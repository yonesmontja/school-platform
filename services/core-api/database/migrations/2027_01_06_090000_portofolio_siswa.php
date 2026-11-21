<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * E-portofolio siswa: foto/video karya, projek P5/kokurikuler, prestasi, dan kegiatan. Berkas disimpan privat (disk local)
 * dan ditampilkan lewat tautan bertanda tangan. Karya kelompok memakai satu berkas untuk beberapa siswa (kolom kelompok).
 * Unggahan siswa/orang tua menunggu persetujuan wali kelas; unggahan staf langsung disetujui.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('trans_portofolio', function (Blueprint $table) {
            $table->id();
            $table->string('id_siswa', 50)->index();
            $table->foreign('id_siswa')->references('id_siswa')->on('students')->cascadeOnDelete();
            $table->string('id_periode', 50)->nullable()->index();
            $table->string('id_kelas', 50)->nullable();
            $table->string('kategori', 20);
            $table->string('id_proyek', 50)->nullable();
            $table->string('judul', 150);
            $table->text('deskripsi')->nullable();
            $table->date('tanggal');
            $table->string('jenis', 10);
            $table->string('path');
            $table->string('mime', 100);
            $table->unsignedBigInteger('ukuran')->default(0);
            $table->string('kelompok', 40)->nullable()->index();
            $table->string('status', 12)->default('MENUNGGU')->index();
            $table->boolean('unggulan')->default(false);
            $table->text('tanggapan')->nullable();
            $table->foreignId('ditinjau_oleh')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('ditinjau_pada')->nullable();
            $table->foreignId('dibuat_oleh')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('trans_portofolio');
    }
};

<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Fase 16 Tahap B: paket soal (naskah ujian dari soal yang sudah disetujui), jawaban siswa per paket
 * (diinput cepat guru atau dibaca AI dari foto lembar jawaban), lalu nilai per TP dikirim ke Input Nilai.
 * Butir menyimpan salinan soal saat ditambahkan, sehingga perubahan soal di bank tidak mengubah ujian
 * yang sudah dicetak atau dikoreksi.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('paket_soal', function (Blueprint $table) {
            $table->string('id_paket', 50)->primary();
            $table->string('judul', 200);
            $table->string('id_mapel', 50);
            $table->string('id_kelas', 50)->nullable();
            $table->string('id_periode', 50)->nullable();
            $table->string('id_kisi', 50)->nullable();
            $table->string('id_jenis', 50)->nullable(); // jenis penilaian (master_mbk) saat dikirim ke Input Nilai
            $table->date('tanggal')->nullable();
            $table->unsignedSmallInteger('durasi_menit')->nullable();
            $table->text('petunjuk')->nullable();
            $table->timestamp('terkirim_pada')->nullable();
            $table->foreignId('dibuat_oleh')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->foreign('id_mapel')->references('id_mapel')->on('subjects')->cascadeOnDelete();
            $table->foreign('id_kelas')->references('id_kelas')->on('classes')->nullOnDelete();
            $table->foreign('id_periode')->references('id_periode')->on('master_periode')->nullOnDelete();
            $table->foreign('id_kisi')->references('id_kisi')->on('kisi_kisi')->nullOnDelete();
            $table->foreign('id_jenis')->references('id_jenis')->on('master_mbk')->nullOnDelete();
        });

        Schema::create('paket_soal_butir', function (Blueprint $table) {
            $table->id();
            $table->string('id_paket', 50);
            $table->string('id_soal', 50)->nullable();
            $table->unsignedSmallInteger('urutan')->default(0);
            $table->unsignedSmallInteger('skor_maks')->default(1);
            $table->unsignedInteger('versi')->default(1);
            $table->json('soal'); // salinan soal saat ditambahkan
            $table->timestamps();

            $table->foreign('id_paket')->references('id_paket')->on('paket_soal')->cascadeOnDelete();
            $table->foreign('id_soal')->references('id_soal')->on('bank_soal')->nullOnDelete();
            $table->index(['id_paket', 'urutan']);
        });

        Schema::create('paket_soal_jawaban', function (Blueprint $table) {
            $table->id();
            $table->string('id_paket', 50);
            $table->string('id_siswa', 50);
            $table->json('jawaban')->nullable();     // {id_butir: jawaban}
            $table->json('skor_manual')->nullable(); // {id_butir: skor} yang ditetapkan guru
            $table->json('skor')->nullable();        // {id_butir: skor akhir}; butir yang belum dinilai tidak ada
            $table->decimal('total', 8, 2)->default(0);
            $table->decimal('nilai', 5, 2)->default(0);
            $table->boolean('lengkap')->default(false); // semua butir sudah punya skor
            $table->json('foto')->nullable();        // url foto lembar jawaban
            $table->foreignId('dikoreksi_oleh')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->foreign('id_paket')->references('id_paket')->on('paket_soal')->cascadeOnDelete();
            $table->foreign('id_siswa')->references('id_siswa')->on('students')->cascadeOnDelete();
            $table->unique(['id_paket', 'id_siswa']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('paket_soal_jawaban');
        Schema::dropIfExists('paket_soal_butir');
        Schema::dropIfExists('paket_soal');
    }
};

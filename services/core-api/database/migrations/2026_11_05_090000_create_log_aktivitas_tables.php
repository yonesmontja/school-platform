<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Audit trail: satu baris log per tindakan pengguna (login, simpan, hapus, cetak, ekspor, kirim WA, buka halaman),
 * dengan rincian perubahan data per record (nilai sebelum & sesudah) di log_perubahan.
 * Log hanya ditambah, tidak pernah diubah atau dihapus lewat aplikasi.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('log_aktivitas', function (Blueprint $table) {
            $table->id();
            $table->timestamp('waktu')->useCurrent();
            $table->unsignedBigInteger('user_id')->nullable();
            // Salinan identitas saat kejadian: tetap terbaca meski akun kelak diubah atau dihapus
            $table->string('nama_user', 255)->nullable();
            $table->string('peran', 20)->nullable();
            $table->string('kategori', 20);   // AUTH, DATA, OUTPUT, NAVIGASI, SISTEM
            $table->string('aksi', 30);       // LOGIN, LOGIN_GAGAL, LOGOUT, TAMBAH, UBAH, HAPUS, SIMPAN, IMPORT, CETAK, EKSPOR, KIRIM_WA, AI, BUKA_HALAMAN, ...
            $table->string('modul', 60)->nullable();
            $table->text('deskripsi');
            $table->boolean('berhasil')->default(true);
            $table->string('metode', 10)->nullable();
            $table->string('rute', 255)->nullable();
            $table->unsignedSmallInteger('status_http')->nullable();
            $table->unsignedInteger('durasi_ms')->nullable();
            $table->string('ip', 45)->nullable();
            $table->string('user_agent', 500)->nullable();
            $table->jsonb('meta')->nullable(); // isian permintaan (sudah disensor), jumlah data, info output
            $table->unsignedInteger('jumlah_perubahan')->default(0);

            $table->foreign('user_id')->references('id')->on('users')->nullOnDelete();
            $table->index('waktu');
            $table->index(['user_id', 'waktu']);
            $table->index(['kategori', 'waktu']);
            $table->index(['modul', 'waktu']);
        });

        Schema::create('log_perubahan', function (Blueprint $table) {
            $table->id();
            $table->foreignId('id_log')->constrained('log_aktivitas')->cascadeOnDelete();
            $table->string('aksi', 10); // TAMBAH, UBAH, HAPUS
            $table->string('tabel', 60);
            $table->string('modul', 60)->nullable();
            $table->string('id_subjek', 100)->nullable();
            $table->string('label', 255)->nullable(); // nama yang mudah dikenali, mis. nama siswa
            $table->jsonb('data_lama')->nullable();
            $table->jsonb('data_baru')->nullable();

            $table->index(['tabel', 'id_subjek']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('log_perubahan');
        Schema::dropIfExists('log_aktivitas');
    }
};

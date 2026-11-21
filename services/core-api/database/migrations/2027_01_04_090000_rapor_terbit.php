<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Rapor digital terverifikasi: setiap penerbitan rapor resmi satu siswa pada satu semester dicatat beserta kode QR
 * keaslian, cuplikan isi rapor (nilai per mapel seperti tercetak), sidik data sumber (untuk mendeteksi perubahan
 * nilai setelah terbit), tanda tangan elektronik wali kelas & kepala sekolah, dan tanda terima orang tua.
 * Terbit ulang membuat versi baru; versi lama berstatus DIGANTI dan kodenya tetap bisa dicek.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('trans_rapor_terbit', function (Blueprint $table) {
            $table->id();
            $table->string('id_siswa', 50);
            $table->string('id_kelas', 50)->nullable();
            $table->string('id_periode', 50);
            $table->unsignedSmallInteger('versi')->default(1);
            $table->string('kode_verifikasi', 16)->unique();
            $table->string('status', 10)->default('BERLAKU'); // BERLAKU | DIGANTI
            $table->string('mode_kalkulasi', 2);
            $table->json('bobot')->nullable();
            $table->date('tanggal_rapor');
            $table->json('ringkasan');
            $table->string('sidik', 64);
            $table->foreignId('diterbitkan_oleh')->nullable()->constrained('users')->nullOnDelete();
            $table->string('nama_wali')->nullable();
            $table->timestamp('diterbitkan_pada');
            $table->foreignId('disahkan_oleh')->nullable()->constrained('users')->nullOnDelete();
            $table->string('nama_kepsek')->nullable();
            $table->timestamp('disahkan_pada')->nullable();
            $table->foreignId('diterima_oleh')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('diterima_pada')->nullable();
            $table->text('tanggapan_ortu')->nullable();
            $table->timestamps();
            $table->index(['id_kelas', 'id_periode', 'status']);
            $table->index(['id_siswa', 'id_periode', 'status']);
            $table->foreign('id_siswa')->references('id_siswa')->on('students')->cascadeOnDelete();
            $table->foreign('id_periode')->references('id_periode')->on('master_periode')->cascadeOnDelete();
            $table->foreign('id_kelas')->references('id_kelas')->on('classes')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('trans_rapor_terbit');
    }
};

<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * CBT/ANBK Tahap A: sesi ujian (satu paket soal untuk beberapa kelas, waktu & token per sesi, ruang, pengawas),
 * mode ujian (layar penuh, log peristiwa, kunci setelah pelanggaran / perangkat lain), dan izin masuk ulang oleh pengawas.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('ujian_sesi', function (Blueprint $table) {
            $table->string('id_sesi', 50)->primary();
            $table->string('nama', 150);
            $table->string('id_paket', 50);
            $table->jsonb('kelas');                       // [id_kelas, ...]
            $table->timestamp('mulai');
            $table->timestamp('selesai');
            $table->unsignedSmallInteger('durasi_menit')->nullable();
            $table->string('token', 12);
            $table->unsignedSmallInteger('token_ganti_menit')->nullable(); // null = token tetap
            $table->boolean('acak_soal')->default(true);
            $table->boolean('acak_pilihan')->default(true);
            $table->boolean('tampilkan_nilai')->default(false);
            $table->boolean('wajib_layar_penuh')->default(true);
            $table->unsignedSmallInteger('batas_pelanggaran')->nullable(); // kunci setelah N pelanggaran; null = tidak dikunci
            $table->boolean('kunci_perangkat')->default(true);
            $table->string('ruang', 80)->nullable();
            $table->string('id_pengawas', 50)->nullable();
            $table->boolean('aktif')->default(true);
            $table->foreignId('dibuat_oleh')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->foreign('id_paket')->references('id_paket')->on('paket_soal')->cascadeOnDelete();
            $table->foreign('id_pengawas')->references('id_guru')->on('teachers')->nullOnDelete();
            $table->index(['aktif', 'mulai']);
        });

        Schema::table('paket_soal_jawaban', function (Blueprint $table) {
            $table->string('id_sesi', 50)->nullable();
            $table->string('perangkat', 64)->nullable();
            $table->boolean('terkunci')->default(false);
            $table->string('alasan_kunci', 200)->nullable();
            $table->unsignedSmallInteger('tambahan_menit')->default(0);
            $table->jsonb('log')->nullable();
            $table->foreign('id_sesi')->references('id_sesi')->on('ujian_sesi')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('paket_soal_jawaban', function (Blueprint $table) {
            $table->dropForeign(['id_sesi']);
            $table->dropColumn(['id_sesi', 'perangkat', 'terkunci', 'alasan_kunci', 'tambahan_menit', 'log']);
        });
        Schema::dropIfExists('ujian_sesi');
    }
};

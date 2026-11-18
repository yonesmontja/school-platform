<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Fase 26 Tahap B, SPMB: gelombang pendaftaran, pendaftar (formulir daring), dan berkas unggahannya.
 * Pendaftar yang selesai daftar ulang dijadikan siswa + orang tua/wali; id_siswa menautkannya.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('spmb_gelombang', function (Blueprint $t) {
            $t->id();
            $t->string('nama', 100);
            $t->string('tahun_ajaran', 20);
            $t->date('tgl_buka');
            $t->date('tgl_tutup');
            $t->date('tgl_pengumuman')->nullable();
            $t->unsignedInteger('kuota')->nullable();
            $t->jsonb('berkas_wajib')->default('[]');
            $t->text('info')->nullable();
            $t->timestamp('diumumkan_at')->nullable();
            $t->foreignId('dibuat_oleh')->nullable()->constrained('users')->nullOnDelete();
            $t->timestamps();
        });

        Schema::create('spmb_pendaftar', function (Blueprint $t) {
            $t->id();
            $t->foreignId('id_gelombang')->constrained('spmb_gelombang')->restrictOnDelete();
            $t->string('nomor_daftar', 30)->unique();
            $t->string('kode_akses');
            $t->string('nama_siswa');
            $t->string('panggilan', 100)->nullable();
            $t->string('nisn', 20)->nullable();
            $t->char('jenis_kelamin', 1);
            $t->string('tempat_lahir', 100);
            $t->date('tgl_lahir');
            $t->string('id_agama', 50)->nullable();
            $t->string('id_suku', 50)->nullable();
            $t->string('sekolah_asal')->nullable();
            $t->text('alamat');
            $t->string('nama_ayah')->nullable();
            $t->string('id_pekerjaan_ayah', 50)->nullable();
            $t->string('nama_ibu')->nullable();
            $t->string('id_pekerjaan_ibu', 50)->nullable();
            $t->string('nama_wali')->nullable();
            $t->string('id_pekerjaan_wali', 50)->nullable();
            $t->string('no_wa', 20);
            $t->string('status', 20)->default('DIAJUKAN')->index();
            $t->text('catatan_verifikasi')->nullable();
            $t->decimal('skor', 6, 2)->nullable();
            $t->foreignId('diverifikasi_oleh')->nullable()->constrained('users')->nullOnDelete();
            $t->timestamp('diverifikasi_at')->nullable();
            $t->timestamp('daftar_ulang_at')->nullable();
            $t->string('id_siswa', 50)->nullable();
            $t->foreign('id_siswa')->references('id_siswa')->on('students')->nullOnDelete();
            $t->timestamp('selesai_at')->nullable();
            $t->timestamps();
        });

        Schema::create('spmb_berkas', function (Blueprint $t) {
            $t->id();
            $t->foreignId('id_pendaftar')->constrained('spmb_pendaftar')->cascadeOnDelete();
            $t->string('jenis', 20);
            $t->string('path');
            $t->string('nama_asli', 200)->nullable();
            $t->string('mime', 100);
            $t->unsignedInteger('ukuran');
            $t->string('status', 20)->default('MENUNGGU');
            $t->string('catatan', 300)->nullable();
            $t->timestamps();
            $t->unique(['id_pendaftar', 'jenis']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('spmb_berkas');
        Schema::dropIfExists('spmb_pendaftar');
        Schema::dropIfExists('spmb_gelombang');
    }
};

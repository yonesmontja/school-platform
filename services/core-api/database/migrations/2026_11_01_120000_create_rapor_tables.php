<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Presensi harian siswa (halaman input menyusul; rapor sudah membacanya)
        Schema::create('trans_presensi', function (Blueprint $table) {
            $table->string('id_presensi', 50)->primary();
            $table->date('tanggal');
            $table->string('id_siswa', 50);
            $table->string('id_kelas', 50);
            $table->string('id_periode', 50);
            $table->enum('status_kehadiran', ['HADIR', 'SAKIT', 'IZIN', 'ALPA'])->default('HADIR');
            $table->timestamps();

            $table->foreign('id_siswa')->references('id_siswa')->on('students')->cascadeOnDelete();
            $table->foreign('id_kelas')->references('id_kelas')->on('classes')->cascadeOnDelete();
            $table->foreign('id_periode')->references('id_periode')->on('master_periode')->cascadeOnDelete();
            $table->unique(['id_siswa', 'tanggal']);
            $table->index(['id_kelas', 'id_periode']);
        });

        // --- MODUL P5 (Projek Penguatan Profil Pelajar Pancasila) ---
        Schema::create('master_proyek', function (Blueprint $table) {
            $table->string('id_proyek', 50)->primary();
            $table->string('judul_proyek', 255);
            $table->text('deskripsi_proyek')->nullable();
            $table->string('fase', 10)->nullable();
            $table->string('id_kelas', 50);
            $table->string('id_periode', 50);
            $table->timestamps();

            $table->foreign('id_kelas')->references('id_kelas')->on('classes')->cascadeOnDelete();
            $table->foreign('id_periode')->references('id_periode')->on('master_periode')->cascadeOnDelete();
        });

        Schema::create('master_target_p5', function (Blueprint $table) {
            $table->string('id_target', 50)->primary();
            $table->string('id_proyek', 50);
            $table->string('id_kategori', 50)->nullable();
            $table->string('dimensi', 255);
            $table->string('elemen', 255)->nullable();
            $table->string('sub_elemen', 255)->nullable();
            $table->text('capaian_akhir_fase')->nullable();
            // Daftar kolom poin STNKM yang menjadi dasar skor, mis. "poin_K,poin_M"
            $table->string('relasi_stnkm', 100)->nullable();
            $table->timestamps();

            $table->foreign('id_proyek')->references('id_proyek')->on('master_proyek')->cascadeOnDelete();
        });

        Schema::create('trans_nilai_p5', function (Blueprint $table) {
            $table->string('id_nilaip5', 50)->primary();
            $table->string('id_periode', 50);
            $table->string('id_kelas', 50);
            $table->string('id_proyek', 50);
            $table->string('id_siswa', 50);
            $table->string('id_target', 50);
            $table->decimal('skor_rata2', 6, 2)->default(0);
            $table->enum('predikat', ['BB', 'MB', 'BSH', 'SB'])->default('BB');
            $table->timestamps();

            $table->foreign('id_proyek')->references('id_proyek')->on('master_proyek')->cascadeOnDelete();
            $table->foreign('id_target')->references('id_target')->on('master_target_p5')->cascadeOnDelete();
            $table->foreign('id_siswa')->references('id_siswa')->on('students')->cascadeOnDelete();
            $table->unique(['id_proyek', 'id_siswa', 'id_target']);
        });

        Schema::create('trans_catatan_p5', function (Blueprint $table) {
            $table->string('id_catatan_p5', 50)->primary();
            $table->string('id_siswa', 50);
            $table->string('id_proyek', 50);
            $table->text('catatan_proses');
            $table->timestamps();

            $table->foreign('id_siswa')->references('id_siswa')->on('students')->cascadeOnDelete();
            $table->foreign('id_proyek')->references('id_proyek')->on('master_proyek')->cascadeOnDelete();
            $table->unique(['id_siswa', 'id_proyek']);
        });

        // Catatan akhir wali kelas di rapor (satu per siswa per periode)
        Schema::create('trans_catatan_wali', function (Blueprint $table) {
            $table->string('id_catatan_wali', 50)->primary();
            $table->string('id_siswa', 50);
            $table->string('id_periode', 50);
            $table->text('catatan_final');
            $table->timestamps();

            $table->foreign('id_siswa')->references('id_siswa')->on('students')->cascadeOnDelete();
            $table->foreign('id_periode')->references('id_periode')->on('master_periode')->cascadeOnDelete();
            $table->unique(['id_siswa', 'id_periode']);
        });

        // Distribusi rapor via WhatsApp (Fonnte)
        Schema::table('school_settings', function (Blueprint $table) {
            $table->string('no_wa_kepsek', 30)->nullable()->after('nip_kepsek');
            $table->string('id_wa_group_guru', 100)->nullable()->after('no_wa_kepsek');
            $table->boolean('status_wa_api')->default(false)->after('openkey_model_name');
            // text: disimpan terenkripsi (cast 'encrypted')
            $table->text('wa_api_token')->nullable()->after('status_wa_api');
        });
    }

    public function down(): void
    {
        Schema::table('school_settings', function (Blueprint $table) {
            $table->dropColumn(['no_wa_kepsek', 'id_wa_group_guru', 'status_wa_api', 'wa_api_token']);
        });
        Schema::dropIfExists('trans_catatan_wali');
        Schema::dropIfExists('trans_catatan_p5');
        Schema::dropIfExists('trans_nilai_p5');
        Schema::dropIfExists('master_target_p5');
        Schema::dropIfExists('master_proyek');
        Schema::dropIfExists('trans_presensi');
    }
};

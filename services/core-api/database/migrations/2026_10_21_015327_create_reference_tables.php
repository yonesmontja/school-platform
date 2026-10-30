<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // 1. Tabel Teachers (Guru)
        Schema::create('teachers', function (Blueprint $table) {
            $table->string('id_guru', 50)->primary();
            $table->string('nama_guru', 255);
            $table->string('nip_nik', 50)->nullable();
            $table->timestamps();
        });

        // 2. Tabel Classes (Kelas)
        Schema::create('classes', function (Blueprint $table) {
            $table->string('id_kelas', 50)->primary();
            $table->string('nama_kelas', 100);
            // Wali kelas merujuk ke tabel teachers
            $table->string('wali_kelas', 50)->nullable();
            $table->foreign('wali_kelas')->references('id_guru')->on('teachers')->nullOnDelete();
            $table->timestamps();
        });

        // 3. Tabel Master Agama
        Schema::create('master_agama', function (Blueprint $table) {
            $table->string('id_agama', 50)->primary();
            $table->string('nama_agama', 100);
            $table->timestamps();
        });

        // 4. Tabel Master Suku
        Schema::create('master_suku', function (Blueprint $table) {
            $table->string('id_suku', 50)->primary();
            $table->string('nama_suku', 100);
            $table->timestamps();
        });

        // 5. Tabel Master Pekerjaan
        Schema::create('master_pekerjaan', function (Blueprint $table) {
            $table->string('id_pekerjaan', 50)->primary();
            $table->string('nama_pekerjaan', 150);
            $table->timestamps();
        });

        // 6. Tabel Master Wilayah
        Schema::create('master_wilayah', function (Blueprint $table) {
            $table->string('id_wilayah', 50)->primary();
            $table->string('provinsi', 100);
            $table->string('kabupaten_kota', 100);
            $table->string('kecamatan', 100);
            $table->string('kelurahan_desa', 100);
            $table->string('kode_pos', 10)->nullable();
            $table->timestamps();
        });

        // 7. Tabel Master Sekolah Asal
        Schema::create('master_sekolah_asal', function (Blueprint $table) {
            $table->string('id_sekolah_asal', 50)->primary();
            $table->string('npsn_sekolah', 20)->nullable();
            $table->string('nama_sekolah', 255);
            $table->string('jenjang_sekolah', 20)->nullable();
            $table->string('alamat_sekolah', 255)->nullable();
            $table->timestamps();
        });

        // 8. Tabel Master Ortu
        Schema::create('master_ortu', function (Blueprint $table) {
            $table->string('id_ortu', 50)->primary();
            $table->string('nama_ayah', 255)->nullable();
            $table->string('id_pekerjaan_ayah', 50)->nullable();
            $table->string('nama_ibu', 255)->nullable();
            $table->string('id_pekerjaan_ibu', 50)->nullable();
            $table->string('jalan_ortu', 255)->nullable();
            $table->string('id_wilayah_ortu', 50)->nullable();
            $table->string('no_wa', 20)->nullable();
            $table->timestamps();

            // Foreign Keys opsional (jika ingin ketat)
            $table->foreign('id_pekerjaan_ayah')->references('id_pekerjaan')->on('master_pekerjaan')->nullOnDelete();
            $table->foreign('id_pekerjaan_ibu')->references('id_pekerjaan')->on('master_pekerjaan')->nullOnDelete();
            $table->foreign('id_wilayah_ortu')->references('id_wilayah')->on('master_wilayah')->nullOnDelete();
        });

        // 9. Tabel Master Wali
        Schema::create('master_wali', function (Blueprint $table) {
            $table->string('id_wali', 50)->primary();
            $table->string('nama_wali', 255);
            $table->string('id_pekerjaan_wali', 50)->nullable();
            $table->string('jalan_wali', 255)->nullable();
            $table->string('id_wilayah_wali', 50)->nullable();
            $table->string('no_wa', 20)->nullable();
            $table->timestamps();

            $table->foreign('id_pekerjaan_wali')->references('id_pekerjaan')->on('master_pekerjaan')->nullOnDelete();
            $table->foreign('id_wilayah_wali')->references('id_wilayah')->on('master_wilayah')->nullOnDelete();
        });
    }

    public function down(): void
    {
        // Drop dalam urutan terbalik untuk menghindari error Constraint
        Schema::dropIfExists('master_wali');
        Schema::dropIfExists('master_ortu');
        Schema::dropIfExists('master_sekolah_asal');
        Schema::dropIfExists('master_wilayah');
        Schema::dropIfExists('master_pekerjaan');
        Schema::dropIfExists('master_suku');
        Schema::dropIfExists('master_agama');
        Schema::dropIfExists('classes');
        Schema::dropIfExists('teachers');
    }
};
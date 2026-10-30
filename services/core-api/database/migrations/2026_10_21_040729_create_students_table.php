<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('students', function (Blueprint $table) {
            $table->string('id_siswa', 50)->primary();
            $table->string('nisn', 20)->unique()->nullable();
            $table->string('nama_siswa', 255);
            $table->string('panggilan', 100)->nullable();
            
            // Relasi Kelas
            $table->string('id_kelas', 50)->nullable();
            $table->foreign('id_kelas')->references('id_kelas')->on('classes')->nullOnDelete();
            
            $table->char('jenis_kelamin', 1)->default('L');
            $table->string('tempat_lahir', 100)->nullable();
            $table->date('tgl_lahir')->nullable();
            
            // Relasi Suku
            $table->string('id_suku', 50)->nullable();
            $table->foreign('id_suku')->references('id_suku')->on('master_suku')->nullOnDelete();
            
            // Relasi Agama
            $table->string('id_agama', 50)->nullable();
            $table->foreign('id_agama')->references('id_agama')->on('master_agama')->nullOnDelete();
            
            // Relasi Sekolah Asal
            $table->string('id_sekolah_asal', 50)->nullable();
            $table->foreign('id_sekolah_asal')->references('id_sekolah_asal')->on('master_sekolah_asal')->nullOnDelete();
            
            $table->string('status_tempat_tinggal', 50)->default('Bersama Orang Tua');
            $table->text('jalan_siswa')->nullable();
            
            // Relasi Wilayah
            $table->string('id_wilayah_siswa', 50)->nullable();
            $table->foreign('id_wilayah_siswa')->references('id_wilayah')->on('master_wilayah')->nullOnDelete();
            
            // Relasi Ortu & Wali
            $table->string('id_ortu', 50)->nullable();
            $table->foreign('id_ortu')->references('id_ortu')->on('master_ortu')->nullOnDelete();
            
            $table->string('id_wali', 50)->nullable();
            $table->foreign('id_wali')->references('id_wali')->on('master_wali')->nullOnDelete();
            
            $table->string('no_wa', 20)->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('students');
    }
};
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // 1. Tabel Periode Akademik
        Schema::create('master_periode', function (Blueprint $table) {
            $table->string('id_periode', 50)->primary();
            $table->string('tahun_ajaran', 20); // e.g., "2026/2027"
            $table->string('semester', 10);     // e.g., "Ganjil" / "Genap"
            $table->enum('status_aktif', ['AKTIF', 'TUTUP'])->default('TUTUP');
            $table->timestamps();
        });

        // 2. Tabel Kategori Penilaian (Topik STNKM)
        Schema::create('master_kategori_penilaian', function (Blueprint $table) {
            $table->string('id_kategori', 50)->primary();
            $table->string('nama_kategori', 150);
            $table->text('keterangan')->nullable();
            $table->timestamps();
        });

        // 3. Tabel MBK (Jenis Aktivitas Penilaian)
        Schema::create('master_mbk', function (Blueprint $table) {
            $table->string('id_jenis', 50)->primary();
            $table->string('kategori_penilaian', 100); // e.g., "Proses/Harian"
            $table->text('keterangan')->nullable();
            
            // Matriks Bobot STNKM (0.0 - 1.0)
            $table->decimal('mat_S', 5, 2)->default(1.00);
            $table->decimal('mat_T', 5, 2)->default(1.00);
            $table->decimal('mat_N', 5, 2)->default(1.00);
            $table->decimal('mat_K', 5, 2)->default(1.00);
            $table->decimal('mat_M', 5, 2)->default(1.00);
            
            $table->timestamps();
        });

        // 4. Tabel Materi (dengan Matriks STNKM)
        Schema::create('master_materi', function (Blueprint $table) {
            $table->string('id_materi', 50)->primary();
            
            // Relasi
            $table->string('id_mapel', 50)->nullable();
            $table->string('id_kelas', 50)->nullable();
            $table->string('id_periode', 50)->nullable();
            $table->string('id_kategori', 50)->nullable();
            
            $table->string('nama_materi', 255);
            $table->text('deskripsi_kompetensi')->nullable();
            
            // Matriks Bobot STNKM (0.0 - 1.0)
            $table->decimal('mat_S', 5, 2)->default(1.00);
            $table->decimal('mat_T', 5, 2)->default(1.00);
            $table->decimal('mat_N', 5, 2)->default(1.00);
            $table->decimal('mat_K', 5, 2)->default(1.00);
            $table->decimal('mat_M', 5, 2)->default(1.00);
            
            $table->timestamps();

            // Foreign Keys
            $table->foreign('id_mapel')->references('id_mapel')->on('subjects')->nullOnDelete();
            $table->foreign('id_kelas')->references('id_kelas')->on('classes')->nullOnDelete();
            $table->foreign('id_periode')->references('id_periode')->on('master_periode')->nullOnDelete();
            $table->foreign('id_kategori')->references('id_kategori')->on('master_kategori_penilaian')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('master_materi');
        Schema::dropIfExists('master_mbk');
        Schema::dropIfExists('master_kategori_penilaian');
        Schema::dropIfExists('master_periode');
    }
};
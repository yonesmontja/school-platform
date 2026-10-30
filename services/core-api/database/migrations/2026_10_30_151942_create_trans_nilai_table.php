<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('trans_nilai', function (Blueprint $table) {
            $table->string('id_nilai', 50)->primary();
            $table->date('tanggal');
            
            // Relasi
            $table->string('id_siswa', 50);
            $table->string('id_mapel', 50);
            $table->string('id_guru', 50)->nullable();
            $table->string('id_periode', 50);
            $table->string('id_jenis', 50);   // Mengacu ke master_mbk.id_jenis
            $table->string('id_materi', 50);  // Mengacu ke master_materi.id_materi
            $table->string('id_kelas', 50);
            
            // Nilai
            $table->decimal('nilai', 5, 2);
            
            // Hasil Kalkulasi STNKM (Otomatis atau Manual)
            $table->decimal('poin_S', 8, 2)->default(0);
            $table->decimal('poin_T', 8, 2)->default(0);
            $table->decimal('poin_N', 8, 2)->default(0);
            $table->decimal('poin_K', 8, 2)->default(0);
            $table->decimal('poin_M', 8, 2)->default(0);
            
            $table->enum('metode_stnkm', ['OTOMATIS', 'MANUAL'])->default('OTOMATIS');
            
            $table->timestamps();

            // Foreign Keys
            $table->foreign('id_siswa')->references('id_siswa')->on('students')->cascadeOnDelete();
            $table->foreign('id_mapel')->references('id_mapel')->on('subjects')->cascadeOnDelete();
            $table->foreign('id_periode')->references('id_periode')->on('master_periode')->cascadeOnDelete();
            $table->foreign('id_jenis')->references('id_jenis')->on('master_mbk')->cascadeOnDelete();
            $table->foreign('id_materi')->references('id_materi')->on('master_materi')->cascadeOnDelete();
            $table->foreign('id_kelas')->references('id_kelas')->on('classes')->cascadeOnDelete();

            // Index untuk performa query per siswa/periode
            $table->index(['id_siswa', 'id_periode']);
            $table->index(['id_kelas', 'id_periode']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('trans_nilai');
    }
};
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Presensi lanjutan:
 * - keterangan per siswa (mis. "sakit demam") pada presensi harian, tercatat ke jurnal sebagai catatan terpisah;
 * - presensi per mapel oleh guru mapel (rapor tetap memakai presensi harian; guru mapel mengisi harian bila belum ada);
 * - rencana pembinaan bagi siswa yang kehadirannya perlu perhatian, dengan status dan tindak lanjut.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('trans_presensi', function (Blueprint $table) {
            $table->string('keterangan', 300)->nullable()->after('status_kehadiran');
            $table->string('id_jurnal', 50)->nullable()->after('keterangan');
            $table->string('sumber', 10)->default('HARIAN')->after('id_jurnal'); // HARIAN | MAPEL (diisi pertama oleh guru mapel)
            $table->foreignId('dicatat_oleh')->nullable()->after('sumber')->constrained('users')->nullOnDelete();
        });

        Schema::create('trans_presensi_mapel', function (Blueprint $table) {
            $table->string('id_presensi_mapel', 50)->primary();
            $table->date('tanggal');
            $table->string('id_mapel', 50);
            $table->string('id_kelas', 50);
            $table->string('id_periode', 50);
            $table->string('id_siswa', 50);
            $table->string('id_jadwal', 50)->nullable();
            $table->string('status_kehadiran', 10);
            $table->string('keterangan', 300)->nullable();
            $table->string('id_jurnal', 50)->nullable();
            $table->string('id_guru', 50)->nullable();
            $table->foreignId('dicatat_oleh')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->foreign('id_mapel')->references('id_mapel')->on('subjects')->cascadeOnDelete();
            $table->foreign('id_kelas')->references('id_kelas')->on('classes')->cascadeOnDelete();
            $table->foreign('id_periode')->references('id_periode')->on('master_periode')->cascadeOnDelete();
            $table->foreign('id_siswa')->references('id_siswa')->on('students')->cascadeOnDelete();
            $table->unique(['tanggal', 'id_mapel', 'id_siswa']);
            $table->index(['id_kelas', 'tanggal']);
        });

        Schema::create('trans_pembinaan_presensi', function (Blueprint $table) {
            $table->string('id_pembinaan', 50)->primary();
            $table->string('id_siswa', 50);
            $table->string('id_kelas', 50);
            $table->string('id_periode', 50)->nullable();
            $table->jsonb('tindakan');                // opsi tindakan yang dipilih + tindakan khusus tulisan guru
            $table->text('catatan')->nullable();
            $table->date('tanggal_mulai');
            $table->date('tanggal_tindak_lanjut');
            $table->string('status', 15)->default('OTOMATIS'); // OTOMATIS | BERLANGSUNG | SELESAI | BATAL
            $table->text('hasil')->nullable();
            $table->date('tanggal_selesai')->nullable();
            $table->jsonb('jurnal')->nullable();       // id jurnal yang mencatat langkah-langkah pembinaan ini
            $table->jsonb('ringkasan_awal')->nullable(); // kehadiran saat rencana dibuat (persen, alpa, sakit, izin)
            $table->foreignId('dibuat_oleh')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->foreign('id_siswa')->references('id_siswa')->on('students')->cascadeOnDelete();
            $table->foreign('id_kelas')->references('id_kelas')->on('classes')->cascadeOnDelete();
            $table->foreign('id_periode')->references('id_periode')->on('master_periode')->nullOnDelete();
            $table->index(['id_kelas', 'status']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('trans_pembinaan_presensi');
        Schema::dropIfExists('trans_presensi_mapel');
        Schema::table('trans_presensi', function (Blueprint $table) {
            $table->dropConstrainedForeignId('dicatat_oleh');
            $table->dropColumn(['keterangan', 'id_jurnal', 'sumber']);
        });
    }
};

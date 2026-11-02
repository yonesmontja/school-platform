<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Rencana tindak lanjut untuk nilai di bawah KKM. Nilai remedial menautkan diri lewat trans_nilai.id_rencana,
        // dan remedial yang masih belum tuntas bisa memicu rencana baru (rantai id_nilai_asal).
        Schema::create('trans_rencana_remedial', function (Blueprint $table) {
            $table->string('id_rencana', 50)->primary();
            $table->string('id_nilai_asal', 50);
            $table->string('id_siswa', 50);
            $table->string('id_mapel', 50);
            $table->string('opsi_tindakan', 50);
            $table->text('catatan')->nullable();
            $table->date('tanggal_rencana');
            $table->enum('status', ['DIRENCANAKAN', 'SELESAI'])->default('DIRENCANAKAN');
            $table->date('tanggal_selesai')->nullable();
            // Beberapa siswa yang ditangani bersama (kelompok kecil, pengulangan materi) berbagi satu sesi jadwal
            $table->string('id_jadwal', 50)->nullable();
            $table->unsignedBigInteger('dibuat_oleh')->nullable();
            $table->timestamps();

            $table->foreign('id_nilai_asal')->references('id_nilai')->on('trans_nilai')->cascadeOnDelete();
            $table->foreign('id_siswa')->references('id_siswa')->on('students')->cascadeOnDelete();
            $table->foreign('id_mapel')->references('id_mapel')->on('subjects')->cascadeOnDelete();
            $table->foreign('id_jadwal')->references('id_jadwal')->on('trans_jadwal')->nullOnDelete();
            $table->foreign('dibuat_oleh')->references('id')->on('users')->nullOnDelete();
            $table->index(['id_siswa', 'status']);
        });

        Schema::table('trans_nilai', function (Blueprint $table) {
            $table->enum('tipe_nilai', ['NORMAL', 'REMEDIAL'])->default('NORMAL')->after('metode_stnkm');
            $table->string('id_rencana', 50)->nullable()->after('tipe_nilai');
            $table->foreign('id_rencana')->references('id_rencana')->on('trans_rencana_remedial')->nullOnDelete();
            // Satu lembar nilai = kombinasi penilaian + tanggal
            $table->index(['id_kelas', 'id_mapel', 'id_periode', 'id_jenis', 'id_materi', 'tanggal'], 'trans_nilai_lembar_index');
        });
    }

    public function down(): void
    {
        Schema::table('trans_nilai', function (Blueprint $table) {
            $table->dropForeign(['id_rencana']);
            $table->dropIndex('trans_nilai_lembar_index');
            $table->dropColumn(['tipe_nilai', 'id_rencana']);
        });
        Schema::dropIfExists('trans_rencana_remedial');
    }
};

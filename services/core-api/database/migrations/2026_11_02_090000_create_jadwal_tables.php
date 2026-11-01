<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('master_ruangan', function (Blueprint $table) {
            $table->string('id_ruangan', 50)->primary();
            $table->string('nama_ruangan', 150);
            $table->unsignedSmallInteger('kapasitas')->nullable();
            $table->string('keterangan', 255)->nullable();
            $table->timestamps();
        });

        // Satu baris = satu sesi. Jadwal berulang berbagi id_group agar bisa diubah/dihapus berantai.
        Schema::create('trans_jadwal', function (Blueprint $table) {
            $table->string('id_jadwal', 50)->primary();
            $table->string('id_group', 50)->nullable()->index();
            $table->string('id_periode', 50)->nullable();
            $table->string('id_kelas', 50)->nullable();
            $table->string('id_guru', 50)->nullable();
            $table->string('id_mapel', 50)->nullable();
            $table->string('id_materi', 50)->nullable();
            $table->string('id_ruangan', 50)->nullable();
            // Judul bebas untuk agenda non-KBM (rapat, upacara, dll.); KBM memakai mapel/materi
            $table->string('judul', 150)->nullable();
            $table->dateTime('mulai');
            $table->dateTime('selesai');
            $table->string('warna', 9)->default('#3f51b5');
            $table->text('catatan')->nullable(); // persiapan alat, keselamatan, catatan guru
            $table->string('lampiran_url', 500)->nullable();
            $table->string('lampiran_nama', 255)->nullable();
            $table->enum('status_sesi', ['Menunggu', 'Berlangsung', 'Selesai', 'Batal'])->default('Menunggu');
            $table->timestamps();

            $table->foreign('id_periode')->references('id_periode')->on('master_periode')->nullOnDelete();
            $table->foreign('id_kelas')->references('id_kelas')->on('classes')->nullOnDelete();
            $table->foreign('id_guru')->references('id_guru')->on('teachers')->nullOnDelete();
            $table->foreign('id_mapel')->references('id_mapel')->on('subjects')->nullOnDelete();
            $table->foreign('id_materi')->references('id_materi')->on('master_materi')->nullOnDelete();
            $table->foreign('id_ruangan')->references('id_ruangan')->on('master_ruangan')->nullOnDelete();
            $table->index(['mulai', 'selesai']);
        });

        Schema::table('teachers', function (Blueprint $table) {
            $table->string('no_wa', 20)->nullable()->after('nip_nik');
        });
    }

    public function down(): void
    {
        Schema::table('teachers', function (Blueprint $table) {
            $table->dropColumn('no_wa');
        });
        Schema::dropIfExists('trans_jadwal');
        Schema::dropIfExists('master_ruangan');
    }
};

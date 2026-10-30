<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('school_settings', function (Blueprint $table) {
            $table->id();
            $table->string('nama_sekolah');
            $table->text('alamat_sekolah')->nullable();
            $table->string('kota')->nullable();
            $table->string('nama_kepsek')->nullable();
            $table->string('nip_kepsek')->nullable();
            $table->string('npsn')->nullable();
            $table->string('ttd_kepsek_url')->nullable(); // Menyimpan path gambar
            $table->timestamps();
        });

        // Tambahkan kolom ttd ke tabel teachers
        Schema::table('teachers', function (Blueprint $table) {
            $table->string('ttd_guru_url')->nullable()->after('nip_nik');
        });
    }

    public function down(): void
    {
        Schema::table('teachers', function (Blueprint $table) {
            $table->dropColumn('ttd_guru_url');
        });
        Schema::dropIfExists('school_settings');
    }
};
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Fase 16 Tahap C: paket soal dikerjakan online di HP siswa (jadwal, token, acak soal & pilihan,
 * batas waktu dari server, simpan otomatis), dipantau guru. Jawaban online memakai tabel jawaban yang sama
 * dengan koreksi kertas, sehingga koreksi, kirim nilai, dan analisis butir tetap satu alur.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('paket_soal', function (Blueprint $table) {
            $table->boolean('online')->default(false)->after('petunjuk');
            $table->timestamp('online_mulai')->nullable()->after('online');
            $table->timestamp('online_selesai')->nullable()->after('online_mulai');
            $table->boolean('acak_soal')->default(true)->after('online_selesai');
            $table->boolean('acak_pilihan')->default(true)->after('acak_soal');
            $table->string('token', 12)->nullable()->after('acak_pilihan');
            $table->boolean('tampilkan_nilai')->default(false)->after('token');
        });

        Schema::table('paket_soal_jawaban', function (Blueprint $table) {
            $table->string('sumber', 10)->default('KERTAS')->after('id_siswa'); // KERTAS | ONLINE
            $table->timestamp('mulai_pada')->nullable()->after('sumber');
            $table->timestamp('selesai_pada')->nullable()->after('mulai_pada');
            $table->timestamp('terakhir_aktif')->nullable()->after('selesai_pada');
            $table->json('urutan')->nullable()->after('terakhir_aktif'); // urutan butir & pilihan acak per siswa
            $table->unsignedSmallInteger('pelanggaran')->default(0)->after('urutan'); // keluar dari halaman tes
        });
    }

    public function down(): void
    {
        Schema::table('paket_soal_jawaban', fn (Blueprint $table) => $table->dropColumn(['sumber', 'mulai_pada', 'selesai_pada', 'terakhir_aktif', 'urutan', 'pelanggaran']));
        Schema::table('paket_soal', fn (Blueprint $table) => $table->dropColumn(['online', 'online_mulai', 'online_selesai', 'acak_soal', 'acak_pilihan', 'token', 'tampilkan_nilai']));
    }
};

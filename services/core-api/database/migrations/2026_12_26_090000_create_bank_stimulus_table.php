<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * CBT Tahap B: stimulus AKM bersama. Satu bacaan, tabel, atau grafik dipakai beberapa soal sekaligus
 * (bank_soal.id_stimulus). Paket menyalin stimulus bersama butirnya, dan soal satu stimulus tetap berdampingan saat diacak.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('bank_stimulus', function (Blueprint $table) {
            $table->string('id_stimulus', 50)->primary();
            $table->string('id_mapel', 50);
            $table->string('id_kelas', 50)->nullable();
            $table->string('judul', 200);
            $table->string('jenis', 30);   // LITERASI_INFORMASI | LITERASI_FIKSI | NUMERASI
            $table->string('konteks', 30); // PERSONAL | SOSIAL_BUDAYA | SAINTIFIK
            $table->text('konten');        // HTML aman (HtmlAman): paragraf, daftar, tabel
            $table->string('gambar_url', 500)->nullable();
            $table->string('sumber_teks', 300)->nullable(); // rujukan bacaan, mis. "Diadaptasi dari Bobo, 2024"
            $table->foreignId('dibuat_oleh')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->foreign('id_mapel')->references('id_mapel')->on('subjects')->cascadeOnDelete();
            $table->foreign('id_kelas')->references('id_kelas')->on('classes')->nullOnDelete();
            $table->index(['id_mapel', 'jenis']);
        });

        Schema::table('bank_soal', function (Blueprint $table) {
            $table->string('id_stimulus', 50)->nullable()->after('id_video');
            $table->foreign('id_stimulus')->references('id_stimulus')->on('bank_stimulus')->nullOnDelete();
            $table->index('id_stimulus');
        });
    }

    public function down(): void
    {
        Schema::table('bank_soal', function (Blueprint $table) {
            $table->dropForeign(['id_stimulus']);
            $table->dropIndex(['id_stimulus']);
            $table->dropColumn('id_stimulus');
        });
        Schema::dropIfExists('bank_stimulus');
    }
};

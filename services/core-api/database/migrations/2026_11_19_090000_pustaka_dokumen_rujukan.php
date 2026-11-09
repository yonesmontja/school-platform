<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Pustaka dokumen resmi (CP, regulasi, panduan) yang dibaca AI sebagai konteks.
 * Teks dokumen dipotong per bagian dan dicari dengan full-text search PostgreSQL.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('dokumen_rujukan', function (Blueprint $t) {
            $t->string('id_dokumen', 40)->primary();
            $t->string('judul', 200);
            $t->string('jenis', 20)->default('LAINNYA'); // CP, REGULASI, PANDUAN, KURIKULUM, LAINNYA
            $t->string('sumber_tipe', 10); // BERKAS | TAUTAN
            $t->string('file_path')->nullable(); // disk lokal (privat)
            $t->string('nama_berkas')->nullable();
            $t->unsignedInteger('ukuran_kb')->nullable();
            $t->string('url_tautan', 1000)->nullable();
            $t->string('id_mapel')->nullable();
            $t->string('fase', 1)->nullable();
            $t->text('keterangan')->nullable();
            $t->longText('teks')->nullable();
            $t->unsignedInteger('jumlah_karakter')->default(0);
            $t->string('status_teks', 10)->default('KOSONG'); // TERBACA | KOSONG | GAGAL
            $t->text('ringkasan')->nullable(); // analisis AI
            $t->string('status', 12)->default('DIAJUKAN'); // DIAJUKAN | AKTIF | DITOLAK | NONAKTIF
            $t->text('catatan_review')->nullable();
            $t->unsignedInteger('versi')->default(1);
            $t->foreignId('diunggah_oleh')->nullable()->constrained('users')->nullOnDelete();
            $t->foreignId('disetujui_oleh')->nullable()->constrained('users')->nullOnDelete();
            $t->timestamp('disetujui_pada')->nullable();
            $t->timestamps();
            $t->index(['status', 'jenis']);
        });

        Schema::create('dokumen_potongan', function (Blueprint $t) {
            $t->id();
            $t->string('id_dokumen', 40);
            $t->foreign('id_dokumen')->references('id_dokumen')->on('dokumen_rujukan')->cascadeOnDelete();
            $t->unsignedInteger('urutan');
            $t->text('teks');
        });
        DB::statement("ALTER TABLE dokumen_potongan ADD COLUMN cari tsvector GENERATED ALWAYS AS (to_tsvector('simple', teks)) STORED");
        DB::statement('CREATE INDEX dokumen_potongan_cari_idx ON dokumen_potongan USING GIN (cari)');

        Schema::table('school_settings', function (Blueprint $t) {
            $t->boolean('guru_boleh_unggah_dokumen')->default(false);
        });
    }

    public function down(): void
    {
        Schema::table('school_settings', fn(Blueprint $t) => $t->dropColumn('guru_boleh_unggah_dokumen'));
        Schema::dropIfExists('dokumen_potongan');
        Schema::dropIfExists('dokumen_rujukan');
    }
};

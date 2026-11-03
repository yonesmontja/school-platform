<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Penyelarasan referensi penilaian dengan kurikulum nasional:
 * - Indikator Ketercapaian TP (IKTP): banyak indikator per materi, ditambah admin/guru kapan saja.
 * - Nilai per indikator (0-100) per baris trans_nilai; nilai materi = rata-rata indikator yang dinilai.
 * - High Level = Elemen CP, boleh khusus satu mapel (null = semua mapel).
 * - Aktivitas diberi jenis asesmen: diagnostik (tidak masuk rapor), formatif, sumatif.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('master_indikator', function (Blueprint $table) {
            $table->string('id_indikator', 50)->primary();
            $table->string('id_materi', 50);
            $table->text('deskripsi');
            $table->unsignedSmallInteger('urutan')->default(0);
            // Indikator yang sudah dipakai menilai tidak dihapus, cukup dinonaktifkan
            $table->boolean('aktif')->default(true);
            $table->unsignedBigInteger('dibuat_oleh')->nullable();
            $table->timestamps();

            $table->foreign('id_materi')->references('id_materi')->on('master_materi')->cascadeOnDelete();
            $table->foreign('dibuat_oleh')->references('id')->on('users')->nullOnDelete();
            $table->index(['id_materi', 'aktif', 'urutan']);
        });

        Schema::create('trans_nilai_indikator', function (Blueprint $table) {
            $table->id();
            $table->string('id_nilai', 50);
            $table->string('id_indikator', 50);
            $table->decimal('nilai', 5, 2);
            $table->timestamps();

            $table->foreign('id_nilai')->references('id_nilai')->on('trans_nilai')->cascadeOnDelete();
            // restrict: indikator yang punya nilai tidak bisa terhapus diam-diam
            $table->foreign('id_indikator')->references('id_indikator')->on('master_indikator')->restrictOnDelete();
            $table->unique(['id_nilai', 'id_indikator']);
            $table->index('id_indikator');
        });

        Schema::table('master_kategori_penilaian', function (Blueprint $table) {
            $table->string('id_mapel', 50)->nullable()->after('id_kategori');
            $table->foreign('id_mapel')->references('id_mapel')->on('subjects')->nullOnDelete();
        });

        Schema::table('master_mbk', function (Blueprint $table) {
            $table->enum('jenis_asesmen', ['DIAGNOSTIK', 'FORMATIF', 'SUMATIF'])->default('FORMATIF')->after('kategori_penilaian');
        });
        // Aktivitas yang sudah ada: ulangan & ujian tengah/akhir semester tergolong sumatif
        DB::table('master_mbk')
            ->where(fn ($q) => $q->where('kategori_penilaian', 'ilike', '%UTS%')->orWhere('kategori_penilaian', 'ilike', '%PTS%')
                ->orWhere('kategori_penilaian', 'ilike', '%UAS%')->orWhere('kategori_penilaian', 'ilike', '%PAS%')
                ->orWhere('kategori_penilaian', 'ilike', '%Ulangan%'))
            ->update(['jenis_asesmen' => 'SUMATIF']);
    }

    public function down(): void
    {
        Schema::table('master_mbk', fn (Blueprint $table) => $table->dropColumn('jenis_asesmen'));
        Schema::table('master_kategori_penilaian', function (Blueprint $table) {
            $table->dropForeign(['id_mapel']);
            $table->dropColumn('id_mapel');
        });
        Schema::dropIfExists('trans_nilai_indikator');
        Schema::dropIfExists('master_indikator');
    }
};

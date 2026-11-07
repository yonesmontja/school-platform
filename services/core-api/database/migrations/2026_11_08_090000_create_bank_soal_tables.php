<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Fase 16 Tahap A: kisi-kisi dan bank soal. Setiap soal berlabel TP/indikator, bobot dimensi STNKM
 * (0–1, seperti bobot materi), level kognitif, dan bentuk soal; soal dipakai setelah disetujui kepala sekolah.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('kisi_kisi', function (Blueprint $table) {
            $table->string('id_kisi', 50)->primary();
            $table->string('judul', 200);
            $table->string('id_mapel', 50);
            $table->string('id_kelas', 50)->nullable();
            $table->string('id_periode', 50)->nullable();
            $table->text('catatan')->nullable();
            $table->foreignId('dibuat_oleh')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->foreign('id_mapel')->references('id_mapel')->on('subjects')->cascadeOnDelete();
            $table->foreign('id_kelas')->references('id_kelas')->on('classes')->nullOnDelete();
            $table->foreign('id_periode')->references('id_periode')->on('master_periode')->nullOnDelete();
        });

        Schema::create('kisi_kisi_baris', function (Blueprint $table) {
            $table->id();
            $table->string('id_kisi', 50);
            $table->unsignedSmallInteger('urutan')->default(0);
            $table->string('id_materi', 50)->nullable();
            $table->string('id_indikator', 50)->nullable();
            $table->string('bentuk', 20);
            $table->string('level_kognitif', 2);
            $table->string('tingkat_kesulitan', 10)->default('SEDANG');
            $table->char('dimensi', 1)->nullable(); // dimensi STNKM yang paling ditonjolkan
            $table->unsignedSmallInteger('jumlah')->default(1);
            $table->timestamps();

            $table->foreign('id_kisi')->references('id_kisi')->on('kisi_kisi')->cascadeOnDelete();
            $table->foreign('id_materi')->references('id_materi')->on('master_materi')->nullOnDelete();
            $table->foreign('id_indikator')->references('id_indikator')->on('master_indikator')->nullOnDelete();
        });

        Schema::create('bank_soal', function (Blueprint $table) {
            $table->string('id_soal', 50)->primary();
            $table->string('id_mapel', 50);
            $table->string('id_kelas', 50)->nullable();
            $table->string('id_materi', 50)->nullable();
            $table->string('id_indikator', 50)->nullable();
            $table->foreignId('id_kisi_baris')->nullable()->constrained('kisi_kisi_baris')->nullOnDelete();
            $table->string('bentuk', 20);
            $table->string('level_kognitif', 2);
            $table->string('tingkat_kesulitan', 10)->default('SEDANG');
            foreach (['S', 'T', 'N', 'K', 'M'] as $d) $table->decimal("dim_{$d}", 3, 2)->default(0);
            $table->text('pertanyaan');
            $table->text('gambar_svg')->nullable();
            $table->string('gambar_url', 500)->nullable();
            $table->json('isi')->nullable();   // pilihan, pernyataan, pasangan, atau urutan (tergantung bentuk)
            $table->json('kunci')->nullable(); // jawaban benar
            $table->text('rubrik')->nullable();
            $table->text('pembahasan')->nullable();
            $table->unsignedSmallInteger('skor_maks')->default(1);
            $table->string('status', 12)->default('DRAF');
            $table->text('catatan_revisi')->nullable();
            $table->unsignedInteger('versi')->default(1);
            $table->string('sumber', 10)->default('MANUAL');
            $table->string('ai_mode', 20)->nullable();
            $table->foreignId('dibuat_oleh')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('disetujui_oleh')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('disetujui_pada')->nullable();
            $table->timestamps();

            $table->foreign('id_mapel')->references('id_mapel')->on('subjects')->cascadeOnDelete();
            $table->foreign('id_kelas')->references('id_kelas')->on('classes')->nullOnDelete();
            $table->foreign('id_materi')->references('id_materi')->on('master_materi')->nullOnDelete();
            $table->foreign('id_indikator')->references('id_indikator')->on('master_indikator')->nullOnDelete();
            $table->index(['id_mapel', 'status']);
            $table->index('id_indikator');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('bank_soal');
        Schema::dropIfExists('kisi_kisi_baris');
        Schema::dropIfExists('kisi_kisi');
    }
};

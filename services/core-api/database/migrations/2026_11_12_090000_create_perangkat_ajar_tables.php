<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Fase 17 Tahap A: Capaian Pembelajaran (CP) per mapel, fase, dan elemen; Alur Tujuan Pembelajaran (ATP)
 * per mapel, kelas, dan periode, disusun guru (bisa dibantu AI) dan disetujui kepala sekolah.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('capaian_pembelajaran', function (Blueprint $table) {
            $table->string('id_cp', 50)->primary();
            $table->string('id_mapel', 50);
            $table->string('fase', 1); // A: kelas 1–2, B: 3–4, C: 5–6
            $table->string('elemen', 200);
            $table->text('teks');
            $table->unsignedSmallInteger('urutan')->default(0);
            $table->foreignId('dibuat_oleh')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
            $table->foreign('id_mapel')->references('id_mapel')->on('subjects')->cascadeOnDelete();
            $table->unique(['id_mapel', 'fase', 'elemen']);
        });

        Schema::create('atp', function (Blueprint $table) {
            $table->string('id_atp', 50)->primary();
            $table->string('judul', 200);
            $table->string('id_mapel', 50);
            $table->string('id_kelas', 50)->nullable();
            $table->string('id_periode', 50)->nullable();
            $table->string('fase', 1)->nullable();
            $table->unsignedSmallInteger('jp_per_minggu')->nullable();
            $table->unsignedSmallInteger('minggu_efektif')->nullable();
            $table->string('status', 20)->default('DRAF'); // DRAF | DIAJUKAN | DISETUJUI | REVISI
            $table->text('catatan_revisi')->nullable();
            $table->unsignedInteger('versi')->default(1);
            $table->string('sumber', 20)->default('MANUAL'); // MANUAL | AI
            $table->string('ai_mode', 20)->nullable();
            $table->foreignId('dibuat_oleh')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('disetujui_oleh')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('disetujui_pada')->nullable();
            $table->timestamps();
            $table->foreign('id_mapel')->references('id_mapel')->on('subjects')->cascadeOnDelete();
            $table->foreign('id_kelas')->references('id_kelas')->on('classes')->nullOnDelete();
            $table->foreign('id_periode')->references('id_periode')->on('master_periode')->nullOnDelete();
            $table->index(['status', 'id_mapel']);
        });

        Schema::create('atp_baris', function (Blueprint $table) {
            $table->id();
            $table->string('id_atp', 50);
            $table->unsignedSmallInteger('urutan')->default(0);
            $table->string('id_cp', 50)->nullable();
            $table->string('id_materi', 50)->nullable();
            $table->string('id_indikator', 50)->nullable();
            // Usulan baru (dibuat di master materi/TP saat ATP disetujui)
            $table->string('materi_usulan', 255)->nullable();
            $table->text('tp_usulan')->nullable();
            $table->unsignedSmallInteger('alokasi_jp')->nullable();
            $table->string('minggu', 20)->nullable();
            $table->string('dimensi', 1)->nullable(); // dimensi STNKM yang ditonjolkan
            $table->json('profil_lulusan')->nullable();
            $table->text('catatan')->nullable();
            $table->timestamps();
            $table->foreign('id_atp')->references('id_atp')->on('atp')->cascadeOnDelete();
            $table->foreign('id_cp')->references('id_cp')->on('capaian_pembelajaran')->nullOnDelete();
            $table->foreign('id_materi')->references('id_materi')->on('master_materi')->nullOnDelete();
            $table->foreign('id_indikator')->references('id_indikator')->on('master_indikator')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('atp_baris');
        Schema::dropIfExists('atp');
        Schema::dropIfExists('capaian_pembelajaran');
    }
};

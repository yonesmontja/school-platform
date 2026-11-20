<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Tahap C kenaikan kelas:
 * - trans_kenaikan: keputusan akhir tahun per siswa (NAIK / TIDAK_NAIK / LULUS) pada semester Genap,
 *   diisi wali kelas dan disahkan kepala sekolah; diterapkan saat Tutup Semester ke tahun ajaran baru
 * - students.tingkat_tunggu: siswa aktif yang sudah naik ke tingkat ini dan menunggu dipetakan ke rombel
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('trans_kenaikan', function (Blueprint $table) {
            $table->id();
            $table->string('id_siswa', 50);
            $table->string('id_periode', 50);
            $table->string('id_kelas', 50)->nullable();
            $table->string('keputusan', 12); // NAIK | TIDAK_NAIK | LULUS
            $table->unsignedTinyInteger('ke_tingkat')->nullable();
            $table->text('alasan')->nullable();
            $table->foreignId('diisi_oleh')->nullable()->constrained('users')->nullOnDelete();
            $table->boolean('disahkan')->default(false);
            $table->foreignId('disahkan_oleh')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('disahkan_pada')->nullable();
            $table->timestamp('diterapkan_pada')->nullable();
            $table->timestamps();
            $table->unique(['id_siswa', 'id_periode']);
            $table->index(['id_kelas', 'id_periode']);
            $table->foreign('id_siswa')->references('id_siswa')->on('students')->cascadeOnDelete();
            $table->foreign('id_periode')->references('id_periode')->on('master_periode')->cascadeOnDelete();
            $table->foreign('id_kelas')->references('id_kelas')->on('classes')->nullOnDelete();
        });

        Schema::table('students', function (Blueprint $table) {
            $table->unsignedTinyInteger('tingkat_tunggu')->nullable()->after('id_kelas');
        });
    }

    public function down(): void
    {
        Schema::table('students', fn(Blueprint $t) => $t->dropColumn('tingkat_tunggu'));
        Schema::dropIfExists('trans_kenaikan');
    }
};

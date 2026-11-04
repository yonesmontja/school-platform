<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Asesmen diagnostik non-kognitif awal semester (Panduan Pembelajaran & Asesmen Kurikulum Merdeka):
 * gaya belajar, minat, kesejahteraan sosial-emosional, dan dukungan belajar di rumah, satu baris per siswa per semester.
 * Diagnostik kognitif memakai nilai biasa dengan aktivitas berjenis DIAGNOSTIK (tidak masuk rekap).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('trans_diagnostik_nonkognitif', function (Blueprint $table) {
            $table->id();
            $table->string('id_siswa', 50);
            $table->string('id_periode', 50);
            $table->enum('gaya_belajar', ['VISUAL', 'AUDITORI', 'KINESTETIK'])->nullable();
            $table->string('minat', 255)->nullable();
            $table->enum('kesejahteraan', ['BAIK', 'CUKUP', 'PERLU_PERHATIAN'])->nullable();
            $table->enum('dukungan_rumah', ['BAIK', 'CUKUP', 'KURANG'])->nullable();
            $table->text('catatan')->nullable();
            $table->unsignedBigInteger('diisi_oleh')->nullable();
            $table->timestamps();

            $table->unique(['id_siswa', 'id_periode']);
            $table->foreign('id_siswa')->references('id_siswa')->on('students')->cascadeOnDelete();
            $table->foreign('id_periode')->references('id_periode')->on('master_periode')->cascadeOnDelete();
            $table->foreign('diisi_oleh')->references('id')->on('users')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('trans_diagnostik_nonkognitif');
    }
};

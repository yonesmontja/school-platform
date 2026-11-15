<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Status rombongan belajar per semester. Kelas tanpa baris di sini dianggap aktif,
 * jadi data lama tetap berjalan seperti biasa sampai admin menonaktifkan rombel tertentu.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('kelas_periode', function (Blueprint $table) {
            $table->id();
            $table->string('id_kelas');
            $table->string('id_periode');
            $table->boolean('aktif')->default(true);
            $table->foreignId('diubah_oleh')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
            $table->unique(['id_kelas', 'id_periode']);
            $table->foreign('id_kelas')->references('id_kelas')->on('classes')->cascadeOnDelete();
            $table->foreign('id_periode')->references('id_periode')->on('master_periode')->cascadeOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('kelas_periode');
    }
};

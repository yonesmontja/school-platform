<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /** Catatan tindak lanjut peringatan dini siswa (siapa menangani, kapan, untuk kumpulan alasan yang mana). */
    public function up(): void
    {
        Schema::create('trans_peringatan_tindak', function (Blueprint $table) {
            $table->id();
            $table->string('id_siswa', 50)->index();
            $table->foreign('id_siswa')->references('id_siswa')->on('students')->cascadeOnDelete();
            $table->string('id_periode', 50)->nullable()->index();
            $table->string('kunci_alasan', 20);
            $table->json('alasan')->nullable();
            $table->unsignedSmallInteger('skor')->default(0);
            $table->text('catatan');
            $table->foreignId('dibuat_oleh')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('trans_peringatan_tindak');
    }
};

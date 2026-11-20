<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /** Pesan dua arah wali kelas ↔ orang tua/siswa, satu utas per siswa; penanda dibaca per akun. */
    public function up(): void
    {
        Schema::create('pesan_siswa', function (Blueprint $table) {
            $table->id();
            $table->string('id_siswa', 50)->index();
            $table->foreign('id_siswa')->references('id_siswa')->on('students')->cascadeOnDelete();
            $table->foreignId('dari_user')->nullable()->constrained('users')->nullOnDelete();
            $table->string('peran_pengirim', 20);
            $table->text('isi');
            $table->timestamps();
            $table->index(['id_siswa', 'id']);
        });
        Schema::create('pesan_siswa_dibaca', function (Blueprint $table) {
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->string('id_siswa', 50);
            $table->unsignedBigInteger('terakhir_id')->default(0);
            $table->timestamp('dibaca_pada')->nullable();
            $table->primary(['user_id', 'id_siswa']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('pesan_siswa_dibaca');
        Schema::dropIfExists('pesan_siswa');
    }
};

<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Pusat notifikasi: notifikasi dihitung langsung dari data (remedial terlambat, nilai belum ditindaklanjuti,
 * jadwal, presensi, dst.), jadi hanya status "sudah dibaca" per pengguna yang disimpan. Kunci notifikasi
 * memuat ringkasan isinya, sehingga notifikasi yang isinya berubah muncul lagi sebagai belum dibaca.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('notifikasi_dibaca', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->string('kunci', 191);
            $table->timestamp('dibaca_pada')->useCurrent();
            $table->unique(['user_id', 'kunci']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('notifikasi_dibaca');
    }
};

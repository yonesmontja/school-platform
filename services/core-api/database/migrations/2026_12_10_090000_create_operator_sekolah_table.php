<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Fase 26 Tahap A: penunjukan operator administrasi sekolah oleh kepala sekolah.
 * Satu baris per akun; `submodul` = daftar kode submodul yang boleh dibuka (App\Support\Administrasi::SUBMODUL).
 * Mencabut penunjukan = menghapus barisnya (tercatat di Log Aktivitas).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('operator_sekolah', function (Blueprint $table) {
            $table->id();
            $table->foreignId('id_user')->unique()->constrained('users')->cascadeOnDelete();
            $table->jsonb('submodul');
            $table->text('catatan')->nullable();
            $table->foreignId('ditunjuk_oleh')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('operator_sekolah');
    }
};

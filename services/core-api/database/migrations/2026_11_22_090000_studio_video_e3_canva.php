<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Studio Rakit Video E3: impor desain dari Canva lewat Canva Connect API. Admin mengisi Client ID & Client Secret
 * integrasi Canva milik sekolah (secret terenkripsi); tiap pengguna menyambungkan akun Canva-nya sendiri (OAuth),
 * tokennya disimpan terenkripsi per pengguna.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('school_settings', function (Blueprint $t) {
            $t->string('canva_client_id', 100)->nullable();
            $t->text('canva_client_secret')->nullable();
        });

        Schema::create('canva_token', function (Blueprint $t) {
            $t->id();
            $t->foreignId('id_user')->unique()->constrained('users')->cascadeOnDelete();
            $t->text('access_token');
            $t->text('refresh_token')->nullable();
            $t->timestamp('kedaluwarsa')->nullable();
            $t->string('nama_canva', 150)->nullable();
            $t->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('canva_token');
        Schema::table('school_settings', function (Blueprint $t) {
            $t->dropColumn(['canva_client_id', 'canva_client_secret']);
        });
    }
};

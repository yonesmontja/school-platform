<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** Akun yang membuat sesi jadwal (bisa berbeda dari guru yang mengajar, mis. admin menyusun jadwal guru). */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('trans_jadwal', function (Blueprint $table) {
            $table->foreignId('dibuat_oleh')->nullable()->after('id_guru')->constrained('users')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('trans_jadwal', function (Blueprint $table) {
            $table->dropConstrainedForeignId('dibuat_oleh');
        });
    }
};

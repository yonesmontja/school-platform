<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Ikon aplikasi (favicon, PWA, apple-touch) bisa memakai logo sekolah. Ikon bawaan tetap menjadi cadangan:
 * bila sakelar mati atau logo dihapus, /api/ikon-aplikasi/* kembali ke /icons/* bawaan.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('school_settings', function (Blueprint $table) {
            $table->boolean('ikon_dari_logo')->default(false)->after('logo_sekolah_url');
        });
    }

    public function down(): void
    {
        Schema::table('school_settings', function (Blueprint $table) {
            $table->dropColumn('ikon_dari_logo');
        });
    }
};

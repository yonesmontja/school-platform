<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// Logo resmi sekolah: dipakai di kop semua dokumen cetak/PDF/Word (modul ajar, ATP, Promes, rapor, dll.)
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('school_settings', function (Blueprint $table) {
            $table->string('logo_sekolah_url')->nullable()->after('ttd_kepsek_url');
        });
    }

    public function down(): void
    {
        Schema::table('school_settings', function (Blueprint $table) {
            $table->dropColumn('logo_sekolah_url');
        });
    }
};

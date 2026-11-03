<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Kebijakan sekolah untuk nilai remedial pada rapor, laporan, dan dasbor:
 * KKM = dibatasi setinggi KKM mapel, ASLI = dipakai apa adanya.
 * Nilai remedial tetap tersimpan utuh; batas hanya diterapkan saat direkap.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('school_settings', function (Blueprint $table) {
            $table->enum('batas_nilai_remedial', ['KKM', 'ASLI'])->default('KKM');
        });
    }

    public function down(): void
    {
        Schema::table('school_settings', function (Blueprint $table) {
            $table->dropColumn('batas_nilai_remedial');
        });
    }
};

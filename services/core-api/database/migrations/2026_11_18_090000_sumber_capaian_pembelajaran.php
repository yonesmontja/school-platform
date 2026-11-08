<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** Asal CP: RESMI (dokumen pemerintah) atau SEKOLAH (draf disusun sekolah/AI karena belum ada CP nasional, mis. mulok). */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('capaian_pembelajaran', function (Blueprint $t) {
            $t->string('sumber', 10)->default('RESMI');
        });
    }

    public function down(): void
    {
        Schema::table('capaian_pembelajaran', function (Blueprint $t) {
            $t->dropColumn('sumber');
        });
    }
};

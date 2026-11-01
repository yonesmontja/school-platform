<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('subjects', function (Blueprint $table) {
            // Kriteria Ketuntasan Minimal per mapel, dipakai di halaman input nilai
            $table->unsignedTinyInteger('kkm')->default(75)->after('kelompok');
        });
    }

    public function down(): void
    {
        Schema::table('subjects', function (Blueprint $table) {
            $table->dropColumn('kkm');
        });
    }
};

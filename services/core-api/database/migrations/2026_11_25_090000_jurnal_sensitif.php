<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// Jurnal sensitif: narasinya hanya terbaca admin, kepala sekolah, guru penulis, dan wali kelas siswa
return new class extends Migration {
    public function up(): void
    {
        Schema::table('trans_jurnal', function (Blueprint $table) {
            $table->boolean('sensitif')->default(false)->after('mode_dampak');
        });
    }

    public function down(): void
    {
        Schema::table('trans_jurnal', function (Blueprint $table) {
            $table->dropColumn('sensitif');
        });
    }
};

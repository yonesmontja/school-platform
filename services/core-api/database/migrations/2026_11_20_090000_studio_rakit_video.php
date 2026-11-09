<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Studio Rakit Video (D1): mesin render per video (naskah JSON tidak terikat Remotion; worker Revideo bisa mengambil
 * antreannya sendiri), satu pengguna pembuat video motion graphic, dan merek sekolah untuk video.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('video_belajar', function (Blueprint $t) {
            $t->string('mesin', 10)->default('REMOTION');
        });
        Schema::table('school_settings', function (Blueprint $t) {
            $t->foreignId('id_pembuat_video')->nullable()->constrained('users')->nullOnDelete();
            $t->string('mesin_video', 10)->default('REMOTION');
            $t->json('merek_video')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('school_settings', function (Blueprint $t) {
            $t->dropConstrainedForeignId('id_pembuat_video');
            $t->dropColumn(['mesin_video', 'merek_video']);
        });
        Schema::table('video_belajar', fn(Blueprint $t) => $t->dropColumn('mesin'));
    }
};

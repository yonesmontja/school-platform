<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** Rasio aspek video belajar: 16:9 (proyektor/YouTube), 9:16 (Reels/TikTok/Status WA), 1:1 (feed), 4:3. */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('video_belajar', function (Blueprint $table) {
            $table->string('rasio', 5)->nullable()->default('16:9');
        });
    }

    public function down(): void
    {
        Schema::table('video_belajar', function (Blueprint $table) {
            $table->dropColumn('rasio');
        });
    }
};

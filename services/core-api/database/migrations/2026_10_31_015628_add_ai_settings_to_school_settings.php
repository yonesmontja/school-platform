<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('school_settings', function (Blueprint $table) {
            // text: nilai disimpan terenkripsi (cast 'encrypted'), panjangnya melebihi 255
            $table->text('api_key_gemini')->nullable()->after('npsn');
            $table->string('ai_model_name', 100)->default('gemini-2.5-flash')->after('api_key_gemini');
        });
    }

    public function down(): void
    {
        Schema::table('school_settings', function (Blueprint $table) {
            $table->dropColumn(['api_key_gemini', 'ai_model_name']);
        });
    }
};

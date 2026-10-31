<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('school_settings', function (Blueprint $table) {
            // text: nilai disimpan terenkripsi (cast 'encrypted'), panjangnya melebihi 255
            $table->text('api_key_qwen')->nullable()->after('ai_model_name');
            $table->text('api_key_claude')->nullable()->after('api_key_qwen');
            $table->text('api_key_deepseek')->nullable()->after('api_key_claude');
            $table->text('api_key_openkey')->nullable()->after('api_key_deepseek');
            $table->string('openkey_base_url', 255)->nullable()->after('api_key_openkey');
            $table->string('openkey_model_name', 100)->nullable()->after('openkey_base_url');
        });

        // Perluas pilihan ai_mode di jurnal agar bisa menyimpan provider baru
        DB::statement('ALTER TABLE trans_jurnal DROP CONSTRAINT IF EXISTS trans_jurnal_ai_mode_check');
        DB::statement("ALTER TABLE trans_jurnal ADD CONSTRAINT trans_jurnal_ai_mode_check CHECK (ai_mode IN ('GEMINI', 'QWEN', 'CLAUDE', 'DEEPSEEK', 'OPENKEY', 'HEURISTIK'))");
    }

    public function down(): void
    {
        DB::statement('ALTER TABLE trans_jurnal DROP CONSTRAINT IF EXISTS trans_jurnal_ai_mode_check');
        DB::statement("UPDATE trans_jurnal SET ai_mode = 'HEURISTIK' WHERE ai_mode NOT IN ('GEMINI', 'HEURISTIK')");
        DB::statement("ALTER TABLE trans_jurnal ADD CONSTRAINT trans_jurnal_ai_mode_check CHECK (ai_mode IN ('GEMINI', 'HEURISTIK'))");

        Schema::table('school_settings', function (Blueprint $table) {
            $table->dropColumn(['api_key_qwen', 'api_key_claude', 'api_key_deepseek', 'api_key_openkey', 'openkey_base_url', 'openkey_model_name']);
        });
    }
};

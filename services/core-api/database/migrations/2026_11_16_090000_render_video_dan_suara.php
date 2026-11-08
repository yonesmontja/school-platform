<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Fase 19 Tahap B & C: video dari templat dirender di server (layanan video-render) dengan narasi suara.
 * Penyedia suara: LOKAL (Piper, gratis tanpa key), ElevenLabs (suara netral & klon), Gemini.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('video_belajar', function (Blueprint $table) {
            $table->string('templat', 50)->nullable();
            $table->string('suara', 30)->nullable(); // LOKAL | ELEVENLABS_NETRAL | ELEVENLABS_KLON | GEMINI | TANPA
            $table->string('render_status', 20)->nullable(); // ANTRE | PROSES | SELESAI | GAGAL
            $table->text('render_pesan')->nullable();
            $table->timestamp('render_mulai')->nullable();
            $table->index('render_status');
        });
        Schema::table('school_settings', function (Blueprint $table) {
            $table->text('api_key_elevenlabs')->nullable();
            $table->string('elevenlabs_voice_netral', 100)->nullable();
            $table->string('elevenlabs_voice_klon', 100)->nullable();
            $table->string('gemini_tts_voice', 50)->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('video_belajar', function (Blueprint $table) {
            $table->dropIndex(['render_status']);
            $table->dropColumn(['templat', 'suara', 'render_status', 'render_pesan', 'render_mulai']);
        });
        Schema::table('school_settings', function (Blueprint $table) {
            $table->dropColumn(['api_key_elevenlabs', 'elevenlabs_voice_netral', 'elevenlabs_voice_klon', 'gemini_tts_voice']);
        });
    }
};

<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Notebook AI Pustaka Dokumen (Fase 23 Tahap A): hasil riset per dokumen (ringkasan, poin, istilah, ekstrak data, FAQ)
 * dan riwayat tanya-jawab beserta bagian dokumen yang dirujuk.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('dokumen_riset', function (Blueprint $t) {
            $t->id();
            $t->string('id_dokumen', 40);
            $t->foreign('id_dokumen')->references('id_dokumen')->on('dokumen_rujukan')->cascadeOnDelete();
            $t->string('jenis', 20); // RINGKAS | RINCI | POIN | ISTILAH | EKSTRAK | FAQ | TANYA
            $t->text('pertanyaan')->nullable();
            $t->json('hasil');
            $t->json('rujukan')->nullable(); // bagian dokumen yang dikutip (tanya-jawab)
            $t->unsignedInteger('karakter_dibaca')->default(0);
            $t->unsignedInteger('versi_dokumen')->default(1);
            $t->string('ai_mode', 20)->nullable();
            $t->foreignId('dibuat_oleh')->nullable()->constrained('users')->nullOnDelete();
            $t->timestamps();
            $t->index(['id_dokumen', 'jenis']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('dokumen_riset');
    }
};

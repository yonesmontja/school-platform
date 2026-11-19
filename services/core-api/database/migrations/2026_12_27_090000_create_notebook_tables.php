<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Notebook AI Pustaka Dokumen (Fase 23 Tahap B): notebook riset berisi beberapa dokumen sekaligus,
 * tanya-jawab lintas dokumen, dan catatan riset tersimpan yang bisa dijadikan soal, ATP, modul ajar, atau peta tema.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('notebook', function (Blueprint $t) {
            $t->id('id_notebook');
            $t->string('judul', 200);
            $t->foreignId('dibuat_oleh')->constrained('users')->cascadeOnDelete();
            $t->timestamps();
        });
        Schema::create('notebook_dokumen', function (Blueprint $t) {
            $t->foreignId('id_notebook')->constrained('notebook', 'id_notebook')->cascadeOnDelete();
            $t->string('id_dokumen', 40);
            $t->foreign('id_dokumen')->references('id_dokumen')->on('dokumen_rujukan')->cascadeOnDelete();
            $t->primary(['id_notebook', 'id_dokumen']);
        });
        Schema::create('notebook_catatan', function (Blueprint $t) {
            $t->id();
            $t->foreignId('id_notebook')->constrained('notebook', 'id_notebook')->cascadeOnDelete();
            $t->string('jenis', 20); // TANYA (jawaban AI lintas dokumen) | MANUAL (ditulis guru)
            $t->string('judul', 300);
            $t->text('isi');
            $t->json('rujukan')->nullable(); // [{no, id_dokumen, judul, bagian, teks}]
            $t->string('ai_mode', 20)->nullable();
            $t->foreignId('dibuat_oleh')->nullable()->constrained('users')->nullOnDelete();
            $t->timestamps();
            $t->index('id_notebook');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('notebook_catatan');
        Schema::dropIfExists('notebook_dokumen');
        Schema::dropIfExists('notebook');
    }
};

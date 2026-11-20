<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Tahap B pergantian semester:
 * - master_periode.terkunci: semester yang sudah ditutup hanya bisa dibaca (perbaikan oleh admin, tercatat di log)
 * - pengampu_mapel: pembagian mengajar per semester (rombel × mapel → guru). Bila semester belum punya
 *   pembagian untuk suatu mapel, guru pengampu bawaan di Mata Pelajaran (subjects.id_guru) yang berlaku.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('master_periode', function (Blueprint $table) {
            $table->boolean('terkunci')->default(false)->after('status_aktif');
            $table->timestamp('dikunci_pada')->nullable()->after('terkunci');
        });

        Schema::create('pengampu_mapel', function (Blueprint $table) {
            $table->id();
            $table->string('id_periode', 50);
            $table->string('id_kelas', 50);
            $table->string('id_mapel', 50);
            $table->string('id_guru', 50);
            $table->timestamps();
            $table->unique(['id_periode', 'id_kelas', 'id_mapel']);
            $table->index(['id_periode', 'id_guru']);
            $table->foreign('id_periode')->references('id_periode')->on('master_periode')->cascadeOnDelete();
            $table->foreign('id_kelas')->references('id_kelas')->on('classes')->cascadeOnDelete();
            $table->foreign('id_mapel')->references('id_mapel')->on('subjects')->cascadeOnDelete();
            $table->foreign('id_guru')->references('id_guru')->on('teachers')->cascadeOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('pengampu_mapel');
        Schema::table('master_periode', fn(Blueprint $t) => $t->dropColumn(['terkunci', 'dikunci_pada']));
    }
};

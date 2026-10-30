<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('subjects', function (Blueprint $table) {
            $table->string('id_mapel', 50)->primary();
            $table->string('nama_mapel', 255);
            $table->string('kelompok', 100)->nullable();

            // Relasi ke tabel teachers (guru pengampu)
            $table->string('id_guru', 50)->nullable();
            $table->foreign('id_guru')->references('id_guru')->on('teachers')->nullOnDelete();

            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('subjects');
    }
};

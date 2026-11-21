<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Tindak lanjut pantauan kenaikan kelas sepanjang tahun ajaran (catatan, remedial, pembinaan, panggil/kabari orang tua).
 * Jenis KABARI_ORTU membuat ringkasan pantauan tampil di portal orang tua beserta pesan wali kelas.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('trans_kenaikan_pantau', function (Blueprint $table) {
            $table->id();
            $table->string('id_siswa', 50)->index();
            $table->foreign('id_siswa')->references('id_siswa')->on('students')->cascadeOnDelete();
            $table->string('tahun_ajaran', 20)->index();
            $table->string('id_periode', 50)->nullable();
            $table->string('jenis', 20);
            $table->text('catatan');
            $table->string('tingkat', 10)->nullable();
            $table->foreignId('dibuat_oleh')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('trans_kenaikan_pantau');
    }
};

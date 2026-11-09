<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Studio Rakit Video D2: tujuan video (pembelajaran / promosi / pengumuman / acara), daftar aset Studio dengan
 * penanda foto siswa & izin orang tua, dan templat naskah sekolah.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('video_belajar', function (Blueprint $t) {
            $t->string('tujuan', 12)->default('PEMBELAJARAN');
        });

        Schema::create('video_aset', function (Blueprint $t) {
            $t->id();
            $t->string('path')->unique(); // /storage/video-aset/…
            $t->string('jenis', 6); // GAMBAR | AUDIO
            $t->string('nama_asli')->nullable();
            $t->boolean('foto_siswa')->default(false);
            $t->boolean('izin_ortu')->default(false);
            $t->foreignId('diunggah_oleh')->nullable()->constrained('users')->nullOnDelete();
            $t->timestamps();
        });

        Schema::create('templat_video', function (Blueprint $t) {
            $t->string('id_templat', 40)->primary();
            $t->string('judul', 120);
            $t->string('kategori', 20);
            $t->text('deskripsi')->nullable();
            $t->string('rasio', 5)->default('16:9');
            $t->json('naskah');
            $t->foreignId('dibuat_oleh')->nullable()->constrained('users')->nullOnDelete();
            $t->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('templat_video');
        Schema::dropIfExists('video_aset');
        Schema::table('video_belajar', fn(Blueprint $t) => $t->dropColumn('tujuan'));
    }
};

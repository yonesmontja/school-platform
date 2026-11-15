<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Catatan kaya & riwayat versi (dipakai pertama kali oleh pembinaan kehadiran, dirancang untuk menu lain):
 * - trans_jurnal.dicatat_oleh: akun yang menulis jurnal (bisa berbeda dari guru yang tercatat, mis. admin mengisi untuk guru)
 * - trans_lampiran: foto/video/berkas yang disisipkan di editor catatan
 * - trans_versi: riwayat versi (seperti commit git) per objek: isi lengkap tiap versi, keterangan perubahan, penulis, waktu
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('trans_jurnal', function (Blueprint $table) {
            $table->foreignId('dicatat_oleh')->nullable()->after('id_guru')->constrained('users')->nullOnDelete();
        });

        Schema::create('trans_lampiran', function (Blueprint $table) {
            $table->string('id_lampiran', 60)->primary();
            $table->string('entitas', 40);                 // mis. pembinaan, jurnal
            $table->string('id_entitas', 60)->nullable();  // diisi saat catatan yang memakainya disimpan
            $table->string('jenis', 10);                   // FOTO | VIDEO
            $table->string('path', 300);
            $table->string('nama_asli', 200)->nullable();
            $table->string('mime', 80);
            $table->unsignedBigInteger('ukuran');
            $table->foreignId('dibuat_oleh')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
            $table->index(['entitas', 'id_entitas']);
        });

        Schema::create('trans_versi', function (Blueprint $table) {
            $table->id();
            $table->string('entitas', 40);
            $table->string('id_entitas', 60);
            $table->unsignedInteger('versi');
            $table->jsonb('isi');
            $table->string('keterangan', 300)->nullable();
            $table->foreignId('dibuat_oleh')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('created_at')->useCurrent();
            $table->unique(['entitas', 'id_entitas', 'versi']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('trans_versi');
        Schema::dropIfExists('trans_lampiran');
        Schema::table('trans_jurnal', function (Blueprint $table) {
            $table->dropConstrainedForeignId('dicatat_oleh');
        });
    }
};

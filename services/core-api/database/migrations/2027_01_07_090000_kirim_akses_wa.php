<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Riwayat pesan akses aplikasi lewat WhatsApp yang disiapkan Admin (salam, username, kata sandi, alamat aplikasi).
 * Kata sandi dan isi pesan TIDAK disimpan; yang dicatat hanya penerima, nomor, cara kata sandi (dicocokkan / ditetapkan baru),
 * tindakan terakhir (disiapkan / disalin / dibuka di WhatsApp), dan admin pengirimnya.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('trans_kirim_akses', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('nama_penerima', 255);
            $table->string('role', 20);
            $table->string('login', 255);
            $table->string('no_wa', 30);
            $table->string('sandi', 12); // COCOK = sandi lama dicocokkan, BARU = ditetapkan sebagai sandi baru
            $table->string('tindakan', 12)->default('DISIAPKAN'); // DISIAPKAN, DISALIN, WHATSAPP
            $table->foreignId('dikirim_oleh')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
            $table->index('created_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('trans_kirim_akses');
    }
};

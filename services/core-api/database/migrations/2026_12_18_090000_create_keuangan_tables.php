<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Administrasi Sekolah Tahap C: Keuangan & Pembayaran.
 * Nominal disimpan dalam rupiah bulat (bigInteger). Pembayaran daring (payment gateway) belum termasuk.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('keu_jenis_biaya', function (Blueprint $t) {
            $t->id();
            $t->string('nama', 100);
            $t->string('periode', 10)->default('BULANAN'); // BULANAN | SEKALI
            $t->bigInteger('nominal')->default(0);
            $t->text('keterangan')->nullable();
            $t->boolean('aktif')->default(true);
            $t->timestamps();
        });

        // Beasiswa / potongan tetap per siswa, diterapkan otomatis saat tagihan dibuat
        Schema::create('keu_beasiswa', function (Blueprint $t) {
            $t->id();
            $t->string('id_siswa', 50);
            $t->foreign('id_siswa')->references('id_siswa')->on('students')->cascadeOnDelete();
            $t->foreignId('id_jenis_biaya')->nullable()->constrained('keu_jenis_biaya')->cascadeOnDelete(); // null = semua jenis biaya
            $t->string('nama', 100);
            $t->string('bentuk', 10)->default('PERSEN'); // PERSEN | NOMINAL
            $t->bigInteger('nilai');
            $t->boolean('aktif')->default(true);
            $t->timestamps();
        });

        Schema::create('keu_tagihan', function (Blueprint $t) {
            $t->id();
            $t->string('id_siswa', 50);
            $t->foreign('id_siswa')->references('id_siswa')->on('students')->restrictOnDelete();
            $t->foreignId('id_jenis_biaya')->constrained('keu_jenis_biaya')->restrictOnDelete();
            $t->string('periode_kode', 20); // "2027-07" untuk bulanan, tahun ajaran / label bebas untuk sekali bayar
            $t->string('judul', 150);
            $t->bigInteger('nominal');
            $t->bigInteger('potongan')->default(0);
            $t->string('keterangan_potongan', 255)->nullable();
            $t->bigInteger('terbayar')->default(0);
            $t->date('jatuh_tempo');
            $t->string('status', 10)->default('BELUM')->index(); // BELUM | SEBAGIAN | LUNAS | BATAL
            $t->string('alasan_batal', 255)->nullable();
            $t->foreignId('dibuat_oleh')->nullable()->constrained('users')->nullOnDelete();
            $t->timestamps();
            $t->index(['id_siswa', 'status']);
        });
        // Satu tagihan aktif per siswa × jenis biaya × periode; tagihan yang dibatalkan boleh dibuat ulang
        DB::statement("CREATE UNIQUE INDEX keu_tagihan_unik ON keu_tagihan (id_siswa, id_jenis_biaya, periode_kode) WHERE status <> 'BATAL'");

        Schema::create('keu_pembayaran', function (Blueprint $t) {
            $t->id();
            $t->string('nomor_kuitansi', 30)->unique();
            $t->string('id_siswa', 50);
            $t->foreign('id_siswa')->references('id_siswa')->on('students')->restrictOnDelete();
            $t->date('tanggal');
            $t->string('metode', 10)->default('TUNAI'); // TUNAI | TRANSFER | LAINNYA
            $t->bigInteger('jumlah');
            $t->string('penyetor', 100)->nullable();
            $t->text('keterangan')->nullable();
            $t->foreignId('dicatat_oleh')->nullable()->constrained('users')->nullOnDelete();
            $t->timestamp('dibatalkan_at')->nullable();
            $t->foreignId('dibatalkan_oleh')->nullable()->constrained('users')->nullOnDelete();
            $t->string('alasan_batal', 255)->nullable();
            $t->timestamps();
            $t->index('tanggal');
        });

        Schema::create('keu_pembayaran_rincian', function (Blueprint $t) {
            $t->id();
            $t->foreignId('id_pembayaran')->constrained('keu_pembayaran')->cascadeOnDelete();
            $t->foreignId('id_tagihan')->constrained('keu_tagihan')->restrictOnDelete();
            $t->bigInteger('jumlah');
        });

        // Kas di luar pembayaran siswa: pemasukan lain dan pengeluaran
        Schema::create('keu_kas', function (Blueprint $t) {
            $t->id();
            $t->date('tanggal');
            $t->string('arah', 6); // MASUK | KELUAR
            $t->string('kategori', 60);
            $t->bigInteger('jumlah');
            $t->text('keterangan')->nullable();
            $t->foreignId('dicatat_oleh')->nullable()->constrained('users')->nullOnDelete();
            $t->timestamps();
            $t->index('tanggal');
        });

        // Riwayat pengingat tunggakan ke orang tua
        Schema::create('keu_pengingat', function (Blueprint $t) {
            $t->id();
            $t->string('id_siswa', 50);
            $t->foreign('id_siswa')->references('id_siswa')->on('students')->cascadeOnDelete();
            $t->bigInteger('total_tunggakan');
            $t->string('cara', 10); // OTOMATIS (Fonnte) | MANUAL (chat WA)
            $t->foreignId('dikirim_oleh')->nullable()->constrained('users')->nullOnDelete();
            $t->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('keu_pengingat');
        Schema::dropIfExists('keu_kas');
        Schema::dropIfExists('keu_pembayaran_rincian');
        Schema::dropIfExists('keu_pembayaran');
        Schema::dropIfExists('keu_tagihan');
        Schema::dropIfExists('keu_beasiswa');
        Schema::dropIfExists('keu_jenis_biaya');
    }
};

<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Administrasi Sekolah:
 * - Keuangan: tujuan pembayaran (rekening bank / e-wallet) yang ditampilkan ke orang tua.
 * - Tahap D: surat keluar (templat, nomor otomatis, tanda tangan, kode verifikasi), surat masuk + disposisi,
 *   arsip digital & dokumen legal dengan masa berlaku.
 * - Tahap E: inventaris aset per ruang, pemeriksaan kondisi, peminjaman, stok habis pakai, pengadaan.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('keu_tujuan_bayar', function (Blueprint $t) {
            $t->id();
            $t->string('jenis', 10); // BANK | EWALLET
            $t->string('penyedia', 50); // BRI, BCA, GoPay, DANA, …
            $t->string('nomor', 50);
            $t->string('atas_nama', 100)->nullable();
            $t->string('catatan', 255)->nullable();
            $t->boolean('aktif')->default(true);
            $t->unsignedSmallInteger('urutan')->default(0);
            $t->timestamps();
        });

        // Pengaturan kecil administrasi (format nomor surat, singkatan sekolah, …)
        Schema::create('adm_pengaturan', function (Blueprint $t) {
            $t->string('kunci', 60)->primary();
            $t->jsonb('nilai')->nullable();
            $t->timestamps();
        });

        Schema::create('surat_templat', function (Blueprint $t) {
            $t->id();
            $t->string('nama', 100);
            $t->string('kode_klasifikasi', 20)->nullable();
            $t->string('perihal', 200)->nullable();
            $t->text('isi');
            $t->boolean('aktif')->default(true);
            $t->timestamps();
        });

        Schema::create('surat_keluar', function (Blueprint $t) {
            $t->id();
            $t->foreignId('id_templat')->nullable()->constrained('surat_templat')->nullOnDelete();
            $t->string('nomor', 100)->nullable()->unique();
            $t->unsignedInteger('urut')->nullable();
            $t->unsignedSmallInteger('tahun')->nullable();
            $t->date('tanggal');
            $t->string('kode_klasifikasi', 20)->nullable();
            $t->string('perihal', 200);
            $t->text('tujuan');
            $t->string('sifat', 20)->default('Biasa');
            $t->string('lampiran', 100)->nullable();
            $t->text('isi');
            $t->string('status', 10)->default('DRAF')->index(); // DRAF | TERBIT | BATAL
            $t->string('kode_verifikasi', 16)->nullable()->unique();
            $t->foreignId('dibuat_oleh')->nullable()->constrained('users')->nullOnDelete();
            $t->foreignId('diterbitkan_oleh')->nullable()->constrained('users')->nullOnDelete();
            $t->timestamp('diterbitkan_at')->nullable();
            $t->foreignId('ditandatangani_oleh')->nullable()->constrained('users')->nullOnDelete();
            $t->timestamp('ditandatangani_at')->nullable();
            $t->string('alasan_batal', 255)->nullable();
            $t->timestamps();
            $t->unique(['tahun', 'urut']);
        });

        Schema::create('surat_masuk', function (Blueprint $t) {
            $t->id();
            $t->unsignedSmallInteger('tahun');
            $t->unsignedInteger('nomor_agenda');
            $t->string('nomor_surat', 100)->nullable();
            $t->date('tanggal_surat')->nullable();
            $t->date('tanggal_terima');
            $t->string('pengirim', 150);
            $t->string('perihal', 200);
            $t->text('ringkasan')->nullable();
            $t->string('sifat', 20)->default('Biasa');
            $t->string('berkas_path')->nullable();
            $t->string('berkas_nama')->nullable();
            $t->string('berkas_mime', 100)->nullable();
            $t->string('status', 12)->default('BARU')->index(); // BARU | DIDISPOSISI | SELESAI
            $t->foreignId('dicatat_oleh')->nullable()->constrained('users')->nullOnDelete();
            $t->timestamps();
            $t->unique(['tahun', 'nomor_agenda']);
        });

        Schema::create('surat_disposisi', function (Blueprint $t) {
            $t->id();
            $t->foreignId('id_surat_masuk')->constrained('surat_masuk')->cascadeOnDelete();
            $t->foreignId('dari_user')->nullable()->constrained('users')->nullOnDelete();
            $t->foreignId('kepada_user')->constrained('users')->cascadeOnDelete();
            $t->text('instruksi');
            $t->date('batas_waktu')->nullable();
            $t->string('status', 10)->default('BARU')->index(); // BARU | DIBACA | SELESAI
            $t->timestamp('dibaca_at')->nullable();
            $t->timestamp('selesai_at')->nullable();
            $t->text('tindak_lanjut')->nullable();
            $t->timestamps();
        });

        Schema::create('arsip_dokumen', function (Blueprint $t) {
            $t->id();
            $t->string('jenis', 10)->default('ARSIP')->index(); // ARSIP | LEGAL
            $t->string('judul', 200);
            $t->string('kategori', 60);
            $t->jsonb('label')->default('[]');
            $t->string('nomor_dokumen', 100)->nullable();
            $t->date('tanggal_dokumen')->nullable();
            $t->date('berlaku_sampai')->nullable()->index();
            $t->text('keterangan')->nullable();
            $t->string('berkas_path')->nullable();
            $t->string('berkas_nama')->nullable();
            $t->string('berkas_mime', 100)->nullable();
            $t->unsignedInteger('berkas_ukuran')->nullable();
            $t->foreignId('dicatat_oleh')->nullable()->constrained('users')->nullOnDelete();
            $t->timestamps();
        });

        // ===== Tahap E: inventaris =====
        Schema::create('inv_barang', function (Blueprint $t) {
            $t->id();
            $t->string('kode', 30)->unique();
            $t->string('nama', 150);
            $t->string('kategori', 60);
            $t->string('id_ruangan', 50)->nullable();
            $t->foreign('id_ruangan')->references('id_ruangan')->on('master_ruangan')->nullOnDelete();
            $t->string('merek', 100)->nullable();
            $t->unsignedInteger('jumlah')->default(1);
            $t->string('satuan', 20)->default('unit');
            $t->string('kondisi', 15)->default('BAIK'); // BAIK | RUSAK_RINGAN | RUSAK_BERAT | HILANG
            $t->date('tanggal_perolehan')->nullable();
            $t->bigInteger('harga_perolehan')->default(0); // per satuan
            $t->unsignedSmallInteger('umur_ekonomis')->nullable(); // tahun, untuk penyusutan garis lurus
            $t->string('sumber_dana', 60)->nullable();
            $t->text('keterangan')->nullable();
            $t->timestamp('dihapus_at')->nullable(); // penghapusan aset dari buku inventaris
            $t->string('alasan_hapus', 255)->nullable();
            $t->timestamps();
        });

        Schema::create('inv_pemeriksaan', function (Blueprint $t) {
            $t->id();
            $t->foreignId('id_barang')->constrained('inv_barang')->cascadeOnDelete();
            $t->date('tanggal');
            $t->string('kondisi', 15);
            $t->text('catatan')->nullable();
            $t->foreignId('oleh')->nullable()->constrained('users')->nullOnDelete();
            $t->timestamps();
        });

        Schema::create('inv_peminjaman', function (Blueprint $t) {
            $t->id();
            $t->foreignId('id_barang')->constrained('inv_barang')->restrictOnDelete();
            $t->unsignedInteger('jumlah')->default(1);
            $t->string('peminjam', 100);
            $t->string('keperluan', 255)->nullable();
            $t->date('tgl_pinjam');
            $t->date('rencana_kembali')->nullable();
            $t->date('tgl_kembali')->nullable();
            $t->string('kondisi_kembali', 15)->nullable();
            $t->text('catatan_kembali')->nullable();
            $t->string('status', 10)->default('DIPINJAM')->index(); // DIPINJAM | KEMBALI
            $t->foreignId('dicatat_oleh')->nullable()->constrained('users')->nullOnDelete();
            $t->timestamps();
        });

        Schema::create('inv_stok', function (Blueprint $t) {
            $t->id();
            $t->string('nama', 150);
            $t->string('kategori', 60)->nullable();
            $t->string('satuan', 20)->default('pcs');
            $t->integer('stok')->default(0);
            $t->unsignedInteger('stok_minimum')->default(0);
            $t->text('keterangan')->nullable();
            $t->boolean('aktif')->default(true);
            $t->timestamps();
        });

        Schema::create('inv_stok_mutasi', function (Blueprint $t) {
            $t->id();
            $t->foreignId('id_stok')->constrained('inv_stok')->cascadeOnDelete();
            $t->date('tanggal');
            $t->string('arah', 6); // MASUK | KELUAR
            $t->unsignedInteger('jumlah');
            $t->string('keterangan', 255)->nullable();
            $t->foreignId('dicatat_oleh')->nullable()->constrained('users')->nullOnDelete();
            $t->timestamps();
        });

        Schema::create('inv_pengadaan', function (Blueprint $t) {
            $t->id();
            $t->string('judul', 200);
            $t->date('tanggal');
            $t->jsonb('rincian'); // [{nama, jumlah, satuan, harga}]
            $t->bigInteger('total')->default(0);
            $t->text('alasan')->nullable();
            $t->string('status', 10)->default('DIAJUKAN')->index(); // DIAJUKAN | DISETUJUI | DITOLAK | SELESAI
            $t->text('catatan_keputusan')->nullable();
            $t->foreignId('diajukan_oleh')->nullable()->constrained('users')->nullOnDelete();
            $t->foreignId('diputuskan_oleh')->nullable()->constrained('users')->nullOnDelete();
            $t->timestamp('diputuskan_at')->nullable();
            $t->timestamp('selesai_at')->nullable();
            $t->foreignId('id_kas')->nullable()->constrained('keu_kas')->nullOnDelete();
            $t->timestamps();
        });
    }

    public function down(): void
    {
        foreach (['inv_pengadaan', 'inv_stok_mutasi', 'inv_stok', 'inv_peminjaman', 'inv_pemeriksaan', 'inv_barang',
            'arsip_dokumen', 'surat_disposisi', 'surat_masuk', 'surat_keluar', 'surat_templat', 'adm_pengaturan', 'keu_tujuan_bayar'] as $tabel) {
            Schema::dropIfExists($tabel);
        }
    }
};

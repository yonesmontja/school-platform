<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Proyek P5 → kegiatan kokurikuler (Permendikdasmen 13/2025):
 * - bentuk kegiatan: proyek lintas mapel, 7 Kebiasaan Anak Indonesia Hebat, atau penguatan intrakurikuler;
 * - dimensi target dipetakan dari 6 dimensi Profil Pelajar Pancasila ke 8 Dimensi Profil Lulusan;
 * - skala predikat sekolah: 4 tingkat (BB/MB/BSH/SB) atau 3 tingkat e-Rapor (Berkembang/Cakap/Mahir).
 *   Predikat tetap disimpan 4 tingkat; skala 3 hanya mengelompokkan saat ditampilkan.
 */
return new class extends Migration
{
    private const PEMETAAN = [
        'Beriman, Bertakwa kepada Tuhan YME, dan Berakhlak Mulia' => 'Keimanan dan Ketakwaan',
        'Berkebinekaan Global' => 'Kewargaan',
        'Bergotong Royong' => 'Kolaborasi',
        'Mandiri' => 'Kemandirian',
        'Bernalar Kritis' => 'Penalaran Kritis',
        'Kreatif' => 'Kreativitas',
    ];

    public function up(): void
    {
        Schema::table('master_proyek', function (Blueprint $table) {
            $table->enum('bentuk', ['PROYEK', 'KEBIASAAN', 'INTRAKURIKULER'])->default('PROYEK')->after('judul_proyek');
        });
        Schema::table('school_settings', function (Blueprint $table) {
            $table->enum('skala_kokurikuler', ['3', '4'])->default('4');
        });
        foreach (self::PEMETAAN as $lama => $baru) {
            DB::table('master_target_p5')->where('dimensi', $lama)->update(['dimensi' => $baru]);
        }
    }

    public function down(): void
    {
        foreach (self::PEMETAAN as $lama => $baru) {
            DB::table('master_target_p5')->where('dimensi', $baru)->update(['dimensi' => $lama]);
        }
        Schema::table('school_settings', fn (Blueprint $table) => $table->dropColumn('skala_kokurikuler'));
        Schema::table('master_proyek', fn (Blueprint $table) => $table->dropColumn('bentuk'));
    }
};

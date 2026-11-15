<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Berapa kali ATP / modul ajar disunting guru setelah disetujui kepala sekolah (versi 1–3).
 * Setelah 3 kali dan disetujui lagi, guru tidak dapat menyuntingnya lagi.
 */
return new class extends Migration
{
    public function up(): void
    {
        foreach (['atp', 'modul_ajar'] as $tabel) {
            Schema::table($tabel, fn(Blueprint $t) => $t->unsignedTinyInteger('suntingan_setuju')->default(0)->after('versi'));
        }
    }

    public function down(): void
    {
        foreach (['atp', 'modul_ajar'] as $tabel) {
            Schema::table($tabel, fn(Blueprint $t) => $t->dropColumn('suntingan_setuju'));
        }
    }
};

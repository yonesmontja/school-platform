<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** Minggu tidak efektif per semester (MPLS, asesmen sumatif, class meeting, pembagian rapor) untuk hitungan Promes. */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('master_periode', function (Blueprint $table) {
            $table->jsonb('minggu_tidak_efektif')->nullable(); // [{mulai: "Y-m-d" (Senin), keterangan}]
        });
    }

    public function down(): void
    {
        Schema::table('master_periode', fn(Blueprint $table) => $table->dropColumn('minggu_tidak_efektif'));
    }
};

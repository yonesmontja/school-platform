<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Bukti pelaksanaan tindak lanjut untuk rencana yang tidak masuk Jadwal. Rencana yang punya sesi
 * Jadwal menyimpan buktinya sebagai lampiran sesi itu, sehingga berkasnya tidak ganda.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('trans_rencana_remedial', function (Blueprint $table) {
            $table->string('bukti_url', 500)->nullable()->after('id_jadwal');
            $table->string('bukti_nama', 255)->nullable()->after('bukti_url');
        });
    }

    public function down(): void
    {
        Schema::table('trans_rencana_remedial', function (Blueprint $table) {
            $table->dropColumn(['bukti_url', 'bukti_nama']);
        });
    }
};

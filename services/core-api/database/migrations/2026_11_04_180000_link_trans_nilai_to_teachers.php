<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * trans_nilai.id_guru sebelumnya berisi NAMA akun pengisi. Sekarang:
 * - id_guru  = guru penilai (teachers.id_guru): guru pemilik akun, atau guru pengampu mapel bila diisi admin/kepsek;
 * - diisi_oleh = akun yang menginput (users.id), agar jejak admin yang mengisi untuk guru tetap ada.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('trans_nilai', function (Blueprint $table) {
            $table->unsignedBigInteger('diisi_oleh')->nullable()->after('id_guru');
        });

        // Akun pengisi dari nama (hanya bila namanya unik di users)
        DB::statement(<<<'SQL'
            UPDATE trans_nilai n SET diisi_oleh = u.id
            FROM users u
            WHERE u.name = n.id_guru
              AND (SELECT COUNT(*) FROM users x WHERE x.name = n.id_guru) = 1
        SQL);

        // Guru penilai: guru pemilik akun, selain itu guru pengampu mapel
        DB::statement(<<<'SQL'
            UPDATE trans_nilai n SET id_guru = COALESCE(
                (SELECT u.id_guru FROM users u JOIN teachers t ON t.id_guru = u.id_guru WHERE u.id = n.diisi_oleh),
                (SELECT s.id_guru FROM subjects s JOIN teachers t ON t.id_guru = s.id_guru WHERE s.id_mapel = n.id_mapel)
            )
        SQL);

        Schema::table('trans_nilai', function (Blueprint $table) {
            $table->foreign('id_guru')->references('id_guru')->on('teachers')->nullOnDelete();
            $table->foreign('diisi_oleh')->references('id')->on('users')->nullOnDelete();
            $table->index('id_guru');
        });
    }

    public function down(): void
    {
        Schema::table('trans_nilai', function (Blueprint $table) {
            $table->dropForeign(['id_guru']);
            $table->dropForeign(['diisi_oleh']);
            $table->dropIndex(['id_guru']);
        });
        // Kembali ke format lama: nama akun pengisi (yang tidak diketahui menjadi null)
        DB::statement('UPDATE trans_nilai n SET id_guru = (SELECT LEFT(u.name, 50) FROM users u WHERE u.id = n.diisi_oleh)');
        Schema::table('trans_nilai', fn (Blueprint $table) => $table->dropColumn('diisi_oleh'));
    }
};

<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            // Peran akun: admin, kepsek, guru (staf) serta siswa & ortu (portal baca)
            $table->string('role', 10)->default('guru')->after('name');
            // Login alternatif selain email (mis. NISN untuk siswa)
            $table->string('username', 50)->nullable()->unique()->after('email');
            $table->string('id_guru', 50)->nullable()->after('role');
            $table->string('id_siswa', 50)->nullable()->after('id_guru');
            $table->string('id_ortu', 50)->nullable()->after('id_siswa');
            $table->string('id_wali', 50)->nullable()->after('id_ortu');
            $table->boolean('aktif')->default(true)->after('password');
            $table->boolean('wajib_ganti_password')->default(false)->after('aktif');
            $table->timestamp('login_terakhir')->nullable()->after('wajib_ganti_password');

            $table->foreign('id_guru')->references('id_guru')->on('teachers')->nullOnDelete();
            $table->foreign('id_siswa')->references('id_siswa')->on('students')->nullOnDelete();
            $table->foreign('id_ortu')->references('id_ortu')->on('master_ortu')->nullOnDelete();
            $table->foreign('id_wali')->references('id_wali')->on('master_wali')->nullOnDelete();
        });

        // Akun siswa/ortu boleh tanpa email (login memakai username)
        DB::statement('ALTER TABLE users ALTER COLUMN email DROP NOT NULL');
        DB::statement("ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('admin', 'kepsek', 'guru', 'siswa', 'ortu'))");

        // Akun yang sudah ada sebelum sistem peran adalah pengelola sekolah
        DB::table('users')->update(['role' => 'admin']);
    }

    public function down(): void
    {
        DB::statement('ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check');
        DB::table('users')->whereNull('email')->delete();
        DB::statement('ALTER TABLE users ALTER COLUMN email SET NOT NULL');
        Schema::table('users', function (Blueprint $table) {
            $table->dropForeign(['id_guru']);
            $table->dropForeign(['id_siswa']);
            $table->dropForeign(['id_ortu']);
            $table->dropForeign(['id_wali']);
            $table->dropColumn(['role', 'username', 'id_guru', 'id_siswa', 'id_ortu', 'id_wali', 'aktif', 'wajib_ganti_password', 'login_terakhir']);
        });
    }
};

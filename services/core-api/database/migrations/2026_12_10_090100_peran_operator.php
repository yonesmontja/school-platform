<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

// Fase 26 Tahap A: peran Operator Sekolah (staf TU bukan guru), hanya membuka submodul Administrasi yang diberikan kepsek
return new class extends Migration
{
    public function up(): void
    {
        DB::statement('ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check');
        DB::statement("ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('admin', 'kepsek', 'guru', 'siswa', 'ortu', 'wakakur', 'wakasis', 'yayasan', 'operator'))");
    }

    public function down(): void
    {
        DB::table('users')->where('role', 'operator')->update(['role' => 'guru', 'aktif' => false]);
        DB::statement('ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check');
        DB::statement("ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('admin', 'kepsek', 'guru', 'siswa', 'ortu', 'wakakur', 'wakasis', 'yayasan'))");
    }
};

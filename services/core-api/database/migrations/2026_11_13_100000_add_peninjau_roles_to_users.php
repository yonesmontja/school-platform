<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

// Peran peninjau (hanya melihat): wakakur, wakasis, yayasan
return new class extends Migration
{
    public function up(): void
    {
        DB::statement('ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check');
        DB::statement("ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('admin', 'kepsek', 'guru', 'siswa', 'ortu', 'wakakur', 'wakasis', 'yayasan'))");
    }

    public function down(): void
    {
        DB::statement('ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check');
        DB::statement("ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('admin', 'kepsek', 'guru', 'siswa', 'ortu'))");
    }
};

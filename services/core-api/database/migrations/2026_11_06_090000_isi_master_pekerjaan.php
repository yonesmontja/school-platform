<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

// Daftar pekerjaan orang tua/wali mengikuti pilihan Dapodik; hanya diisi bila tabel masih kosong
return new class extends Migration
{
    private const DAFTAR = [
        'Tidak bekerja', 'Nelayan', 'Petani', 'Peternak', 'PNS/TNI/Polri', 'Karyawan Swasta',
        'Pedagang Kecil', 'Pedagang Besar', 'Wiraswasta', 'Wirausaha', 'Buruh', 'Pensiunan',
        'Tenaga Kerja Indonesia', 'Sudah Meninggal', 'Lainnya',
    ];

    public function up(): void
    {
        if (DB::table('master_pekerjaan')->exists()) return;
        $now = now();
        DB::table('master_pekerjaan')->insert(collect(self::DAFTAR)->values()->map(fn($nama, $i) => [
            'id_pekerjaan' => sprintf('PKJ-%02d', $i + 1), 'nama_pekerjaan' => $nama, 'created_at' => $now, 'updated_at' => $now,
        ])->all());
    }

    public function down(): void
    {
        DB::table('master_pekerjaan')->where('id_pekerjaan', 'like', 'PKJ-%')->delete();
    }
};

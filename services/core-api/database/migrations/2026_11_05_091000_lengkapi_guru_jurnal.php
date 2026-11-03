<?php

use App\Models\Classes;
use App\Models\MasterMateri;
use App\Models\Subject;
use App\Models\TransJurnal;
use App\Services\AuditTrail;
use Illuminate\Database\Migrations\Migration;

/**
 * Jurnal lama tanpa guru dilengkapi dengan aturan yang sama seperti jurnal baru: pembuatnya tidak tercatat
 * (diisi admin/kepsek), jadi tercatat guru pengampu mapel materinya, atau wali kelas bila tanpa materi.
 * Nilai aslinya (guru kosong) tersimpan di Log Aktivitas sebagai satu tindakan sistem.
 */
return new class extends Migration
{
    public function up(): void
    {
        $jurnal = TransJurnal::whereNull('id_guru')->get();
        if ($jurnal->isEmpty()) return;

        AuditTrail::mulaiPermintaan();
        foreach ($jurnal as $j) {
            $idMapel = $j->id_materi ? MasterMateri::whereKey($j->id_materi)->value('id_mapel') : null;
            $guru = ($idMapel ? Subject::whereKey($idMapel)->value('id_guru') : null)
                ?? Classes::whereKey($j->id_kelas)->value('wali_kelas');
            if ($guru) $j->update(['id_guru' => $guru]);
        }
        $perubahan = AuditTrail::selesaiPermintaan();

        if ($perubahan) {
            AuditTrail::catat([
                'kategori' => 'SISTEM', 'aksi' => 'UBAH', 'modul' => 'Jurnal', 'metode' => 'MIGRASI',
                'deskripsi' => 'Melengkapi guru pada ' . count($perubahan) . ' jurnal lama yang belum punya guru (guru pengampu mapel / wali kelas)',
            ], $perubahan);
        }
    }

    public function down(): void
    {
        // Nilai asli tersimpan di Log Aktivitas; tidak dikembalikan otomatis
    }
};

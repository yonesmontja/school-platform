<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Hari libur selain Minggu: libur nasional, cuti bersama, dan libur sekolah. Tanggal di tabel ini ditolak untuk
 * jadwal, presensi, nilai, jurnal, dan rencana tindak lanjut (aturan BukanHariMinggu), dan dilewati saat membuat
 * jadwal berulang.
 *
 * Data awal: 2026 dari SKB 3 Menteri No. 1497/2/5 Tahun 2025 (dikutip setneg.go.id). 2027 dari SKB 3 Menteri
 * 15 September 2026, disalin dari ringkasan tidak resmi karena halaman resmi tidak terbaca; ditandai perlu_cek
 * agar admin mencocokkannya dengan dokumen SKB.
 */
return new class extends Migration
{
    private const DATA = [
        2026 => [
            ['2026-01-01', 'Tahun Baru 2026 Masehi', 'NASIONAL'],
            ['2026-01-16', 'Isra Mikraj Nabi Muhammad SAW', 'NASIONAL'],
            ['2026-02-16', 'Cuti bersama Tahun Baru Imlek', 'CUTI_BERSAMA'],
            ['2026-02-17', 'Tahun Baru Imlek 2577 Kongzili', 'NASIONAL'],
            ['2026-03-18', 'Cuti bersama Hari Suci Nyepi', 'CUTI_BERSAMA'],
            ['2026-03-19', 'Hari Suci Nyepi Tahun Baru Saka 1948', 'NASIONAL'],
            ['2026-03-20', 'Cuti bersama Idulfitri', 'CUTI_BERSAMA'],
            ['2026-03-21', 'Idulfitri 1447 H', 'NASIONAL'],
            ['2026-03-22', 'Idulfitri 1447 H', 'NASIONAL'],
            ['2026-03-23', 'Cuti bersama Idulfitri', 'CUTI_BERSAMA'],
            ['2026-03-24', 'Cuti bersama Idulfitri', 'CUTI_BERSAMA'],
            ['2026-04-03', 'Wafat Yesus Kristus', 'NASIONAL'],
            ['2026-04-05', 'Kebangkitan Yesus Kristus (Paskah)', 'NASIONAL'],
            ['2026-05-01', 'Hari Buruh Internasional', 'NASIONAL'],
            ['2026-05-14', 'Kenaikan Yesus Kristus', 'NASIONAL'],
            ['2026-05-15', 'Cuti bersama Kenaikan Yesus Kristus', 'CUTI_BERSAMA'],
            ['2026-05-27', 'Iduladha 1447 H', 'NASIONAL'],
            ['2026-05-28', 'Cuti bersama Iduladha', 'CUTI_BERSAMA'],
            ['2026-05-31', 'Hari Raya Waisak 2570 BE', 'NASIONAL'],
            ['2026-06-01', 'Hari Lahir Pancasila', 'NASIONAL'],
            ['2026-06-16', 'Tahun Baru Islam 1448 H', 'NASIONAL'],
            ['2026-08-17', 'Proklamasi Kemerdekaan', 'NASIONAL'],
            ['2026-08-25', 'Maulid Nabi Muhammad SAW', 'NASIONAL'],
            ['2026-12-24', 'Cuti bersama Natal', 'CUTI_BERSAMA'],
            ['2026-12-25', 'Kelahiran Yesus Kristus', 'NASIONAL'],
        ],
        2027 => [
            ['2027-01-01', 'Tahun Baru 2027 Masehi', 'NASIONAL'],
            ['2027-01-05', 'Isra Mikraj Nabi Muhammad SAW', 'NASIONAL'],
            ['2027-02-05', 'Cuti bersama Tahun Baru Imlek', 'CUTI_BERSAMA'],
            ['2027-02-06', 'Tahun Baru Imlek 2578 Kongzili', 'NASIONAL'],
            ['2027-03-08', 'Hari Suci Nyepi Tahun Baru Saka 1949', 'NASIONAL'],
            ['2027-03-09', 'Cuti bersama Idulfitri', 'CUTI_BERSAMA'],
            ['2027-03-10', 'Idulfitri 1448 H', 'NASIONAL'],
            ['2027-03-11', 'Idulfitri 1448 H', 'NASIONAL'],
            ['2027-03-12', 'Cuti bersama Idulfitri', 'CUTI_BERSAMA'],
            ['2027-03-15', 'Cuti bersama Idulfitri', 'CUTI_BERSAMA'],
            ['2027-03-25', 'Cuti bersama Wafat Yesus Kristus', 'CUTI_BERSAMA'],
            ['2027-03-26', 'Wafat Yesus Kristus', 'NASIONAL'],
            ['2027-03-28', 'Kebangkitan Yesus Kristus (Paskah)', 'NASIONAL'],
            ['2027-05-01', 'Hari Buruh Internasional', 'NASIONAL'],
            ['2027-05-06', 'Kenaikan Yesus Kristus', 'NASIONAL'],
            ['2027-05-17', 'Iduladha 1448 H', 'NASIONAL'],
            ['2027-05-18', 'Cuti bersama Iduladha', 'CUTI_BERSAMA'],
            ['2027-05-19', 'Cuti bersama Waisak', 'CUTI_BERSAMA'],
            ['2027-05-20', 'Hari Raya Waisak 2571 BE', 'NASIONAL'],
            ['2027-06-01', 'Hari Lahir Pancasila', 'NASIONAL'],
            ['2027-06-06', 'Tahun Baru Islam 1449 H', 'NASIONAL'],
            ['2027-08-15', 'Maulid Nabi Muhammad SAW', 'NASIONAL'],
            ['2027-08-17', 'Proklamasi Kemerdekaan', 'NASIONAL'],
            ['2027-12-24', 'Cuti bersama Natal', 'CUTI_BERSAMA'],
            ['2027-12-25', 'Kelahiran Yesus Kristus', 'NASIONAL'],
            ['2027-12-26', 'Isra Mikraj Nabi Muhammad SAW', 'NASIONAL'],
        ],
    ];

    public function up(): void
    {
        Schema::create('hari_libur', function (Blueprint $t) {
            $t->id();
            $t->date('tanggal')->unique();
            $t->string('nama', 120);
            $t->string('jenis', 20); // NASIONAL | CUTI_BERSAMA | SEKOLAH
            $t->boolean('perlu_cek')->default(false); // data awal yang belum dicocokkan dengan dokumen resmi
            $t->timestamps();
        });

        $now = now();
        $baris = [];
        foreach (self::DATA as $tahun => $daftar) {
            foreach ($daftar as [$tgl, $nama, $jenis]) {
                $baris[] = ['tanggal' => $tgl, 'nama' => $nama, 'jenis' => $jenis, 'perlu_cek' => $tahun === 2027, 'created_at' => $now, 'updated_at' => $now];
            }
        }
        DB::table('hari_libur')->insert($baris);
    }

    public function down(): void
    {
        Schema::dropIfExists('hari_libur');
    }
};

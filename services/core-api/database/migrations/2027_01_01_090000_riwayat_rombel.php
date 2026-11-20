<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Tahap A pergantian semester & kenaikan kelas:
 * - siswa_rombel: rombel tiap siswa per semester (riwayat; kelas sekarang tetap di students.id_kelas)
 * - wali_kelas_periode: wali kelas tiap rombel per semester, agar rapor lama tetap memuat wali saat itu
 * - classes.tingkat: tingkat kelas (1–12) untuk kenaikan kelas
 * - students.status_siswa: aktif / lulus / mutasi / keluar
 * Riwayat diisi dari data yang sudah ada (nilai, presensi, catatan wali) ditambah kelas sekarang untuk semester aktif.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('siswa_rombel', function (Blueprint $table) {
            $table->id();
            $table->string('id_siswa', 50);
            $table->string('id_periode', 50);
            $table->string('id_kelas', 50);
            $table->timestamps();
            $table->unique(['id_siswa', 'id_periode']);
            $table->index(['id_kelas', 'id_periode']);
            $table->foreign('id_siswa')->references('id_siswa')->on('students')->cascadeOnDelete();
            $table->foreign('id_periode')->references('id_periode')->on('master_periode')->cascadeOnDelete();
            $table->foreign('id_kelas')->references('id_kelas')->on('classes')->cascadeOnDelete();
        });

        Schema::create('wali_kelas_periode', function (Blueprint $table) {
            $table->id();
            $table->string('id_kelas', 50);
            $table->string('id_periode', 50);
            $table->string('id_guru', 50)->nullable();
            $table->timestamps();
            $table->unique(['id_kelas', 'id_periode']);
            $table->foreign('id_kelas')->references('id_kelas')->on('classes')->cascadeOnDelete();
            $table->foreign('id_periode')->references('id_periode')->on('master_periode')->cascadeOnDelete();
            $table->foreign('id_guru')->references('id_guru')->on('teachers')->nullOnDelete();
        });

        Schema::table('classes', function (Blueprint $table) {
            $table->unsignedTinyInteger('tingkat')->nullable()->after('nama_kelas');
        });

        Schema::table('students', function (Blueprint $table) {
            $table->string('status_siswa', 10)->default('aktif')->after('id_kelas');
            $table->date('tanggal_status')->nullable()->after('status_siswa');
            $table->string('keterangan_status', 255)->nullable()->after('tanggal_status');
        });

        // Tingkat dari nama kelas ("Kelas 2A" → 2, "Kelas IV B" → 4)
        foreach (DB::table('classes')->get(['id_kelas', 'nama_kelas']) as $k) {
            $t = self::tingkatDariNama((string) $k->nama_kelas);
            if ($t) DB::table('classes')->where('id_kelas', $k->id_kelas)->update(['tingkat' => $t]);
        }

        // Riwayat rombel dari transaksi yang sudah menyimpan kelas + semester
        $now = now();
        $pasangan = collect();
        foreach (['trans_nilai', 'trans_presensi'] as $tabel) {
            if (!Schema::hasTable($tabel)) continue;
            DB::table($tabel)->select('id_siswa', 'id_periode', 'id_kelas', DB::raw('max(tanggal) as terakhir'))
                ->whereNotNull('id_kelas')->whereNotNull('id_periode')
                ->groupBy('id_siswa', 'id_periode', 'id_kelas')->get()
                ->each(function ($r) use ($pasangan) {
                    $kunci = "{$r->id_siswa}|{$r->id_periode}";
                    // Bila siswa pindah rombel di tengah semester, rombel dengan catatan terakhir yang dipakai
                    if (!$pasangan->has($kunci) || $pasangan[$kunci]->terakhir < $r->terakhir) $pasangan[$kunci] = $r;
                });
        }
        // Semester aktif: kelas sekarang yang berlaku
        $aktif = DB::table('master_periode')->where('status_aktif', 'AKTIF')->value('id_periode');
        if ($aktif) {
            DB::table('students')->whereNotNull('id_kelas')->get(['id_siswa', 'id_kelas'])
                ->each(fn($s) => $pasangan["{$s->id_siswa}|{$aktif}"] = (object) ['id_siswa' => $s->id_siswa, 'id_periode' => $aktif, 'id_kelas' => $s->id_kelas]);
        }
        $adaSiswa = DB::table('students')->pluck('id_siswa')->flip();
        $adaKelas = DB::table('classes')->pluck('id_kelas')->flip();
        $baris = $pasangan->values()
            ->filter(fn($r) => $adaSiswa->has($r->id_siswa) && $adaKelas->has($r->id_kelas))
            ->map(fn($r) => ['id_siswa' => $r->id_siswa, 'id_periode' => $r->id_periode, 'id_kelas' => $r->id_kelas, 'created_at' => $now, 'updated_at' => $now]);
        foreach ($baris->chunk(500) as $c) DB::table('siswa_rombel')->insert($c->all());

        // Wali kelas: wali sekarang dicatat untuk setiap semester yang punya riwayat rombel kelas itu
        $wali = DB::table('classes')->pluck('wali_kelas', 'id_kelas');
        $baris = DB::table('siswa_rombel')->select('id_kelas', 'id_periode')->distinct()->get()
            ->map(fn($r) => ['id_kelas' => $r->id_kelas, 'id_periode' => $r->id_periode, 'id_guru' => $wali[$r->id_kelas] ?? null, 'created_at' => $now, 'updated_at' => $now]);
        if ($aktif) {
            $ada = $baris->pluck('id_kelas')->flip();
            foreach ($wali as $idKelas => $idGuru) {
                if (!$ada->has($idKelas)) $baris->push(['id_kelas' => $idKelas, 'id_periode' => $aktif, 'id_guru' => $idGuru, 'created_at' => $now, 'updated_at' => $now]);
            }
        }
        foreach ($baris->chunk(500) as $c) DB::table('wali_kelas_periode')->insert($c->values()->all());
    }

    public function down(): void
    {
        Schema::table('students', fn(Blueprint $t) => $t->dropColumn(['status_siswa', 'tanggal_status', 'keterangan_status']));
        Schema::table('classes', fn(Blueprint $t) => $t->dropColumn('tingkat'));
        Schema::dropIfExists('wali_kelas_periode');
        Schema::dropIfExists('siswa_rombel');
    }

    private static function tingkatDariNama(string $nama): ?int
    {
        if (preg_match('/\b(1[0-2]|[1-9])(?!\d)/', $nama, $m)) return (int) $m[1];
        $romawi = ['XII' => 12, 'XI' => 11, 'X' => 10, 'IX' => 9, 'VIII' => 8, 'VII' => 7, 'VI' => 6, 'V' => 5, 'IV' => 4, 'III' => 3, 'II' => 2, 'I' => 1];
        foreach ($romawi as $r => $n) {
            if (preg_match('/\b' . $r . '(?=[A-Z]?\b)/', $nama)) return $n;
        }
        return null;
    }
};

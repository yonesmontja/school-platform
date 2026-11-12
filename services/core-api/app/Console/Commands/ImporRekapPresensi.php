<?php

namespace App\Console\Commands;

use App\Http\Controllers\Api\PresensiController;
use App\Models\Classes;
use App\Models\MasterPeriode;
use App\Models\Student;
use App\Models\TransPresensi;
use App\Rules\BukanHariMinggu;
use Carbon\Carbon;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Impor sekali jalan presensi dari laporan aplikasi lama (teks hasil `pdftotext -raw`).
 * Baris yang dibaca: "YYYY-MM-DD <Nama Siswa> <Kelas> <Hadir|Sakit|Izin|Alpa>". Tanpa --simpan hanya laporan uji.
 *
 *   docker exec -i school_core_api php artisan presensi:impor-rekap --kelas=KLS-01 --periode=PER-1 < presensi.txt
 */
class ImporRekapPresensi extends Command
{
    protected $signature = 'presensi:impor-rekap {--kelas=} {--periode=}
        {--alias=* : Pemetaan nama siswa lama=nama di aplikasi}
        {--geser-libur : Pindahkan tanggal Minggu/hari libur ke hari sekolah berikutnya}
        {--hapus-lama : Hapus semua presensi kelas ini sebelum impor (data uji)}
        {--simpan : Tulis ke database; tanpa ini hanya laporan uji}';

    protected $description = 'Impor presensi dari laporan aplikasi lama (uji dulu, simpan dengan --simpan)';

    public function handle(): int
    {
        $kelas = Classes::findOrFail($this->option('kelas'));
        $periode = MasterPeriode::findOrFail($this->option('periode'));
        $norm = fn($s) => Str::of($s)->lower()->squish()->toString();
        $alias = collect($this->option('alias'))->mapWithKeys(fn($a) => [$norm(Str::before($a, '=')) => $norm(Str::after($a, '='))]);
        $siswa = Student::where('id_kelas', $kelas->id_kelas)->get()->keyBy(fn($s) => $norm($s->nama_siswa));

        $data = []; $masalah = []; $geser = []; $baris = 0;
        foreach (preg_split('/\R/u', stream_get_contents(STDIN)) as $l) {
            if (!preg_match('/^(\d{4}-\d{2}-\d{2})\s+(.+?)\s+\S+\s+(Hadir|Sakit|Izin|Alpa)\s*$/iu', trim($l), $m)) continue;
            $baris++;
            [$tgl, $nama, $status] = [$m[1], $m[2], strtoupper($m[3])];
            if ($this->option('geser-libur') && BukanHariMinggu::alasan(Carbon::parse($tgl))) {
                $baru = Carbon::parse($tgl);
                do { $baru->addDay(); } while (BukanHariMinggu::alasan($baru));
                $geser[$tgl] = $baru->toDateString();
                $tgl = $baru->toDateString();
            }
            $s = $siswa[$alias[$norm($nama)] ?? $norm($nama)] ?? null;
            if (!$s) { $masalah["Siswa tidak ditemukan: $nama"][] = $tgl; continue; }
            if (isset($data["$tgl|{$s->id_siswa}"]) && $data["$tgl|{$s->id_siswa}"]['status'] !== $status) $masalah["Status ganda $tgl {$s->nama_siswa}"][] = $status;
            $data["$tgl|{$s->id_siswa}"] = ['tanggal' => $tgl, 'id_siswa' => $s->id_siswa, 'status' => $status];
        }
        if (!$baris) { $this->error('Tidak ada baris presensi yang terbaca.'); return 1; }

        $rekap = collect($data)->countBy('status');
        $this->info("Kelas {$kelas->nama_kelas}, periode {$periode->id_periode}");
        $this->line("Baris laporan: $baris → presensi siap simpan: " . count($data) . ' pada ' . collect($data)->pluck('tanggal')->unique()->count() . ' hari');
        $this->line('Status: ' . $rekap->map(fn($n, $s) => "$s $n")->implode(', '));
        foreach ($geser as $dari => $ke) $this->warn("Tanggal libur $dari dipindah ke $ke");
        foreach (collect($data)->pluck('tanggal')->unique() as $t) if ($a = BukanHariMinggu::alasan(Carbon::parse($t))) $this->warn("$t: $a");
        foreach ($masalah as $m => $x) $this->warn($m . ' (' . count($x) . ')');
        $lama = TransPresensi::where('id_kelas', $kelas->id_kelas)->count();
        $this->line("Presensi lama di kelas ini: {$lama}" . ($this->option('hapus-lama') ? ' → akan DIHAPUS' : ' (yang tanggalnya sama akan diperbarui)'));

        if (!$this->option('simpan')) { $this->comment('Uji saja, tidak ada yang disimpan. Tambahkan --simpan untuk menulis.'); return 0; }
        if (collect($masalah)->keys()->contains(fn($m) => str_starts_with($m, 'Siswa tidak ditemukan'))) { $this->error('Masih ada siswa yang tidak terpetakan.'); return 1; }

        DB::transaction(function () use ($data, $kelas, $periode) {
            if ($this->option('hapus-lama')) TransPresensi::where('id_kelas', $kelas->id_kelas)->delete();
            foreach ($data as $r) {
                $row = TransPresensi::firstOrNew(['tanggal' => $r['tanggal'], 'id_siswa' => $r['id_siswa']]);
                $row->id_presensi ??= 'PRS-' . Str::uuid();
                $row->fill(['id_kelas' => $kelas->id_kelas, 'id_periode' => $periode->id_periode, 'status_kehadiran' => $r['status']])->save();
            }
        });
        $this->info('Selesai disimpan.');
        return 0;
    }
}

<?php

namespace App\Console\Commands;

use App\Models\Classes;
use App\Models\Student;
use App\Models\TransJurnal;
use App\Rules\BukanHariMinggu;
use App\Services\JurnalAIService;
use Carbon\Carbon;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Impor sekali jalan jurnal anekdotal dari laporan aplikasi lama.
 * Masukan: JSON (stdin) berisi baris {tanggal, nama, narasi, S, T, N, K, M}. Tanpa --simpan hanya laporan uji.
 * Skor STNKM diambil apa adanya (seperti impor Excel jurnal); baris tanpa skor dinilai heuristik lokal.
 * Guru = wali kelas bila tidak diberikan.
 *
 *   docker exec -i school_core_api php artisan jurnal:impor-rekap --kelas=KLS-01 < jurnal.json
 */
class ImporRekapJurnal extends Command
{
    protected $signature = 'jurnal:impor-rekap {--kelas=} {--guru= : ID guru penulis; bawaan wali kelas}
        {--mode=PISAH : PISAH (catatan kualitatif) atau BONUS (intervensi nilai)}
        {--alias=* : Pemetaan nama siswa lama=nama di aplikasi}
        {--geser-libur : Pindahkan tanggal Minggu/hari libur ke hari sekolah berikutnya}
        {--hapus-lama : Hapus semua jurnal kelas ini sebelum impor (data uji)}
        {--simpan : Tulis ke database; tanpa ini hanya laporan uji}';

    protected $description = 'Impor jurnal anekdotal dari laporan aplikasi lama (uji dulu, simpan dengan --simpan)';

    public function handle(): int
    {
        $rows = json_decode(stream_get_contents(STDIN), true);
        if (!is_array($rows) || !$rows) { $this->error('Masukan JSON kosong/tidak valid.'); return 1; }
        if (!in_array($this->option('mode'), ['PISAH', 'BONUS'], true)) { $this->error('--mode harus PISAH atau BONUS.'); return 1; }

        $kelas = Classes::findOrFail($this->option('kelas'));
        $guru = $this->option('guru') ?: $kelas->wali_kelas;
        $norm = fn($s) => Str::of($s)->lower()->squish()->toString();
        $alias = collect($this->option('alias'))->mapWithKeys(fn($a) => [$norm(Str::before($a, '=')) => $norm(Str::after($a, '='))]);
        $siswa = Student::where('id_kelas', $kelas->id_kelas)->get()->keyBy(fn($s) => $norm($s->nama_siswa));

        $data = []; $masalah = []; $geser = [];
        foreach ($rows as $r) {
            $tgl = $r['tanggal'];
            if ($this->option('geser-libur') && BukanHariMinggu::alasan(Carbon::parse($tgl))) {
                $baru = Carbon::parse($tgl);
                do { $baru->addDay(); } while (BukanHariMinggu::alasan($baru));
                $geser[$tgl] = $baru->toDateString();
                $tgl = $baru->toDateString();
            }
            $s = $siswa[$alias[$norm($r['nama'])] ?? $norm($r['nama'])] ?? null;
            if (!$s) { $masalah['Siswa tidak ditemukan: ' . $r['nama']][] = $tgl; continue; }
            // Catatan tanpa skor (mis. jurnal kejadian tulisan tangan): skor dihitung penilai heuristik lokal
            if (!isset($r['S'])) $r += array_intersect_key(app(JurnalAIService::class)->analyze($r['narasi'], 'HEURISTIK'), array_flip(['S', 'T', 'N', 'K', 'M']));
            foreach (['S', 'T', 'N', 'K', 'M'] as $d) {
                if (abs((float) $r[$d]) > 5) $masalah["Skor $d di luar -5..5: {$s->nama_siswa} $tgl"][] = $r[$d];
            }
            $kunci = $tgl . '|' . $s->id_siswa . '|' . $norm($r['narasi']);
            if (isset($data[$kunci])) { $masalah["Catatan persis sama dilewati: {$s->nama_siswa} $tgl"][] = 1; continue; }
            $data[$kunci] = ['tanggal' => $tgl, 'id_siswa' => $s->id_siswa, 'nama' => $s->nama_siswa, 'narasi' => trim($r['narasi'])] + array_intersect_key($r, array_flip(['S', 'T', 'N', 'K', 'M']));
        }

        $this->info("Kelas {$kelas->nama_kelas}, guru {$guru}, mode {$this->option('mode')}");
        $this->line('Baris laporan: ' . count($rows) . ' → jurnal siap simpan: ' . count($data) . ' untuk ' . collect($data)->pluck('id_siswa')->unique()->count() . ' siswa');
        foreach (collect($data)->groupBy(fn($x) => $x['tanggal'] . '|' . $x['id_siswa'])->filter(fn($g) => $g->count() > 1) as $g) {
            $this->warn("Lebih dari satu catatan: {$g[0]['nama']} {$g[0]['tanggal']} ({$g->count()})");
        }
        foreach ($geser as $dari => $ke) $this->warn("Tanggal libur $dari dipindah ke $ke");
        foreach (collect($data)->pluck('tanggal')->unique() as $t) if ($a = BukanHariMinggu::alasan(Carbon::parse($t))) $this->warn("$t: $a");
        foreach ($masalah as $m => $x) $this->warn($m);
        $lama = TransJurnal::where('id_kelas', $kelas->id_kelas)->count();
        $this->line("Jurnal lama di kelas ini: {$lama}" . ($this->option('hapus-lama') ? ' → akan DIHAPUS' : ' (dibiarkan)'));

        if (!$this->option('simpan')) { $this->comment('Uji saja, tidak ada yang disimpan. Tambahkan --simpan untuk menulis.'); return 0; }
        if (collect($masalah)->keys()->contains(fn($m) => !str_starts_with($m, 'Catatan persis sama'))) { $this->error('Masih ada baris bermasalah; perbaiki dulu.'); return 1; }

        DB::transaction(function () use ($data, $kelas, $guru) {
            if ($this->option('hapus-lama')) TransJurnal::where('id_kelas', $kelas->id_kelas)->delete();
            foreach ($data as $r) {
                TransJurnal::create([
                    'id_jurnal' => 'JRN-' . Str::uuid(), 'tanggal' => $r['tanggal'], 'id_siswa' => $r['id_siswa'],
                    'id_kelas' => $kelas->id_kelas, 'id_guru' => $guru, 'narasi_kejadian' => $r['narasi'],
                    'mode_dampak' => $this->option('mode'), 'ai_mode' => 'HEURISTIK',
                    'val_S' => $r['S'], 'val_T' => $r['T'], 'val_N' => $r['N'], 'val_K' => $r['K'], 'val_M' => $r['M'],
                ]);
            }
        });
        $this->info('Selesai disimpan.');
        return 0;
    }
}

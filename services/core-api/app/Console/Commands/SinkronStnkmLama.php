<?php

namespace App\Console\Commands;

use App\Models\MasterMateri;
use App\Models\Student;
use App\Models\Subject;
use App\Models\TransNilai;
use App\Rules\BukanHariMinggu;
use Carbon\Carbon;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Sekali jalan: ganti poin STNKM nilai hasil impor rekap dengan poin S, T, N, K, M asli dari database aplikasi lama
 * (TransNilai prototipe, metode MANUAL). Nilai mentah tidak diubah kecuali berbeda (dilaporkan).
 * Masukan JSON (stdin): baris {tanggal, nama, mapel, materi, nilai, S, T, N, K, M}.
 * Tanpa --simpan hanya laporan uji.
 *
 *   docker exec -i school_core_api php artisan nilai:sinkron-stnkm --kelas=KLS-01 --periode=PER-1 --geser-libur < rows.json
 */
class SinkronStnkmLama extends Command
{
    protected $signature = 'nilai:sinkron-stnkm {--kelas=} {--periode=}
        {--mapel=* : Pemetaan nama mapel lama=ID mapel}
        {--alias=* : Pemetaan nama siswa lama=nama di aplikasi}
        {--geser-libur : Tanggal Minggu/hari libur digeser ke hari sekolah berikutnya (sama seperti saat impor)}
        {--simpan : Tulis ke database}';

    protected $description = 'Ganti poin STNKM nilai impor dengan poin S/T/N/K/M asli aplikasi lama (uji dulu, simpan dengan --simpan)';

    public function handle(): int
    {
        $rows = json_decode(stream_get_contents(STDIN), true);
        if (!is_array($rows) || !$rows) { $this->error('Masukan JSON kosong/tidak valid.'); return 1; }
        $kelas = $this->option('kelas');
        $periode = $this->option('periode');
        $norm = fn($s) => Str::of((string) $s)->lower()->squish()->toString();
        $alias = collect($this->option('alias'))->mapWithKeys(fn($a) => [$norm(Str::before($a, '=')) => $norm(Str::after($a, '='))]);
        $siswa = Student::where('id_kelas', $kelas)->get()->keyBy(fn($s) => $norm($s->nama_siswa));
        $mapelOpsi = collect($this->option('mapel'))->mapWithKeys(fn($a) => [$norm(Str::before($a, '=')) => Str::after($a, '=')]);
        $subjects = Subject::all();
        $cariMapel = fn(string $nama) => ($id = $mapelOpsi[$norm($nama)] ?? null) ? $subjects->firstWhere('id_mapel', $id)
            : ($subjects->first(fn($s) => $norm($s->nama_mapel) === $norm($nama))
                ?? $subjects->first(fn($s) => str_starts_with($norm($nama), $norm($s->nama_mapel))));
        $tanpaKategori = fn(string $m) => preg_match('/^(.*\S)\s*\(([^()]+)\)$/u', trim($m), $x) && !preg_match('/\d/', $x[2]) ? trim($x[1]) : trim($m);
        $materiKelas = MasterMateri::where('id_kelas', $kelas)->get(['id_materi', 'id_mapel', 'nama_materi']);
        $cariMateri = function (string $idMapel, string $nama) use ($materiKelas, $norm, $tanpaKategori) {
            $kandidat = $materiKelas->where('id_mapel', $idMapel);
            $n = $norm($tanpaKategori($nama));
            return $kandidat->first(fn($m) => $norm($m->nama_materi) === $n)
                ?? $kandidat->first(fn($m) => $norm($m->nama_materi) === $norm($nama))
                ?? $kandidat->first(fn($m) => str_starts_with($n, $norm($m->nama_materi)) || str_starts_with($norm($m->nama_materi), $n));
        };

        $grup = []; $masalah = [];
        foreach ($rows as $r) {
            if ((float) $r['nilai'] <= 0) continue; // nilai 0 dulu juga diabaikan saat impor
            $tgl = Carbon::parse($r['tanggal']);
            if ($this->option('geser-libur')) while (BukanHariMinggu::alasan($tgl)) $tgl->addDay();
            $mapel = $cariMapel($r['mapel']);
            $s = $siswa[$alias[$norm($r['nama'])] ?? $norm($r['nama'])] ?? null;
            if (!$mapel) { $masalah['Mapel tidak ada: ' . $r['mapel']][] = 1; continue; }
            if (!$s) { $masalah['Siswa tidak ditemukan: ' . $r['nama']][] = 1; continue; }
            $materi = $cariMateri($mapel->id_mapel, $r['materi']);
            if (!$materi) { $masalah["Materi tidak ditemukan ({$mapel->nama_mapel}): " . Str::limit($r['materi'], 60)][] = 1; continue; }
            $k = implode('|', [$tgl->toDateString(), $s->id_siswa, $mapel->id_mapel, $materi->id_materi]);
            $grup[$k][] = $r;
        }

        $nilaiDb = TransNilai::where('id_kelas', $kelas)->where('id_periode', $periode)->where('tipe_nilai', 'NORMAL')->get()
            ->keyBy(fn($n) => implode('|', [substr($n->tanggal, 0, 10), $n->id_siswa, $n->id_mapel, $n->id_materi]));

        $ubah = []; $tanpaPasangan = []; $nilaiBeda = [];
        foreach ($grup as $k => $g) {
            $row = $nilaiDb[$k] ?? null;
            if (!$row) { $tanpaPasangan[] = $k; continue; }
            $avg = fn($d) => round(collect($g)->avg(fn($x) => (float) $x[$d]), 2);
            $baru = ['nilai' => $avg('nilai'), 'poin_S' => $avg('S'), 'poin_T' => $avg('T'), 'poin_N' => $avg('N'), 'poin_K' => $avg('K'), 'poin_M' => $avg('M')];
            if (abs($baru['nilai'] - (float) $row->nilai) > 0.01) $nilaiBeda[] = "$k: {$row->nilai} → {$baru['nilai']}";
            $ubah[] = [$row, $baru];
        }
        $tersentuh = collect($ubah)->map(fn($x) => $x[0]->id_nilai)->flip();
        $sisaDb = $nilaiDb->reject(fn($n) => isset($tersentuh[$n->id_nilai]));

        $this->line('Baris aplikasi lama: ' . count($rows) . ' → kelompok nilai: ' . count($grup));
        $this->line('Nilai di aplikasi yang diperbarui poin STNKM-nya: ' . count($ubah));
        $this->line('Nilai mentah ikut berubah (beda dengan data lama): ' . count($nilaiBeda));
        foreach (array_slice($nilaiBeda, 0, 10) as $b) $this->warn('  ' . $b);
        $this->line('Kelompok data lama tanpa pasangan di aplikasi: ' . count($tanpaPasangan));
        foreach (array_slice($tanpaPasangan, 0, 10) as $b) $this->warn('  ' . $b);
        $this->line('Nilai di aplikasi tanpa data lama (dibiarkan): ' . $sisaDb->count());
        foreach ($sisaDb->groupBy('id_mapel') as $m => $g) $this->line("  $m: " . $g->count());
        foreach ($masalah as $m => $n) $this->warn($m . ' (' . count($n) . ' baris)');
        $contoh = $ubah[0] ?? null;
        if ($contoh) $this->line('Contoh: ' . json_encode([$contoh[0]->only(['nilai', 'poin_S', 'poin_T', 'poin_N', 'poin_K', 'poin_M']), $contoh[1]]));

        if (!$this->option('simpan')) { $this->comment('Uji saja. Tambahkan --simpan untuk menulis.'); return 0; }
        DB::transaction(function () use ($ubah) {
            foreach ($ubah as [$row, $baru]) $row->fill($baru + ['metode_stnkm' => 'MANUAL'])->save();
        });
        $this->info('Selesai: ' . count($ubah) . ' nilai diperbarui.');
        return 0;
    }
}

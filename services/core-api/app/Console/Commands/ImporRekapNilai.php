<?php

namespace App\Console\Commands;

use App\Models\Classes;
use App\Models\MasterKategoriPenilaian;
use App\Models\MasterMateri;
use App\Models\MasterMBK;
use App\Models\MasterPeriode;
use App\Models\Student;
use App\Models\Subject;
use App\Models\TransNilai;
use App\Models\User;
use App\Rules\BukanHariMinggu;
use Carbon\Carbon;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Impor sekali jalan nilai harian dari rekap aplikasi lama (prototipe).
 * Masukan: JSON (stdin) berisi baris {tanggal, nama, mapel, materi, dimensi, nilai, pengisi}.
 * Tanpa --simpan hanya laporan uji; tidak ada yang ditulis.
 *
 *   docker exec -i school_core_api php artisan nilai:impor-rekap --kelas=KLS-01 < rows.json
 */
class ImporRekapNilai extends Command
{
    protected $signature = 'nilai:impor-rekap {--kelas=} {--periode=} {--jenis=MBK-1}
        {--mapel=* : Pemetaan nama mapel lama=ID mapel, mis. "Komsos=MPL-xxx"}
        {--alias=* : Pemetaan nama siswa lama=nama di aplikasi}
        {--geser-libur : Pindahkan tanggal Minggu/hari libur ke hari sekolah berikutnya}
        {--hapus-lama : Hapus semua nilai kelas ini sebelum impor (data uji)}
        {--simpan : Tulis ke database; tanpa ini hanya laporan uji}';

    protected $description = 'Impor nilai harian dari rekap aplikasi lama (uji dulu, simpan dengan --simpan)';

    public function handle(): int
    {
        $rows = json_decode(stream_get_contents(STDIN), true);
        if (!is_array($rows) || !$rows) { $this->error('Masukan JSON kosong/tidak valid.'); return 1; }

        $kelas = Classes::findOrFail($this->option('kelas'));
        $periode = $this->option('periode') ? MasterPeriode::findOrFail($this->option('periode')) : MasterPeriode::where('status', 'AKTIF')->firstOrFail();
        $mbk = MasterMBK::findOrFail($this->option('jenis'));
        $admin = User::where('role', 'admin')->orderBy('id')->firstOrFail();

        $norm = fn($s) => Str::of($s)->lower()->squish()->toString();
        $alias = collect($this->option('alias'))->mapWithKeys(fn($a) => [$norm(Str::before($a, '=')) => $norm(Str::after($a, '='))]);
        $siswa = Student::where('id_kelas', $kelas->id_kelas)->get()->keyBy(fn($s) => $norm($s->nama_siswa));

        $mapelOpsi = collect($this->option('mapel'))->mapWithKeys(fn($a) => [$norm(Str::before($a, '=')) => Str::after($a, '=')]);
        $subjects = Subject::all();
        $cariMapel = function (string $nama) use ($norm, $mapelOpsi, $subjects) {
            if ($id = $mapelOpsi[$norm($nama)] ?? null) return $subjects->firstWhere('id_mapel', $id);
            return $subjects->first(fn($s) => $norm($s->nama_mapel) === $norm($nama))
                ?? $subjects->first(fn($s) => str_starts_with($norm($nama), $norm($s->nama_mapel)));
        };

        // Kategori = isi kurung terakhir di materi, mis. "Ball, Goal (Hobi-main bola)"
        $pisah = function (string $materi): array {
            if (preg_match('/^(.*\S)\s*\(([^()]+)\)$/u', trim($materi), $m) && !preg_match('/\d/', $m[2])) return [trim($m[1]), trim($m[2])];
            return [trim($materi), null];
        };

        // Materi agama Kristen kadang terpotong/tanpa kategori di rekap; pakai teks lengkap dari sesi agama lain di tanggal sama
        $agama = collect($rows)->filter(fn($r) => str_contains($norm($r['mapel']), 'agama'))->groupBy('tanggal');

        $masalah = []; $sesi = []; $geser = [];
        foreach ($rows as $r) {
            // Tanggal Minggu/hari libur dipindah ke hari sekolah berikutnya
            if ($this->option('geser-libur') && BukanHariMinggu::alasan(Carbon::parse($r['tanggal']))) {
                $baru = Carbon::parse($r['tanggal']);
                do { $baru->addDay(); } while (BukanHariMinggu::alasan($baru));
                $geser[$r['tanggal']] = $baru->toDateString();
                $r['tanggal'] = $baru->toDateString();
            }
            $mapel = $cariMapel($r['mapel']);
            $namaSiswa = $alias[$norm($r['nama'])] ?? $norm($r['nama']);
            $s = $siswa[$namaSiswa] ?? null;
            if (!$mapel) { $masalah['Mapel belum ada: ' . $r['mapel']][] = $r['no']; continue; }
            if (!$s) { $masalah['Siswa tidak ditemukan: ' . $r['nama']][] = $r['no']; continue; }

            $teks = $r['materi'];
            if (str_contains($norm($r['mapel']), 'agama')) {
                $dasar = $pisah($teks)[0];
                $lengkap = $agama[$r['tanggal']]->pluck('materi')
                    ->filter(fn($t) => str_starts_with($norm($t), $norm(rtrim($dasar, ' (:'))))
                    ->sortByDesc(fn($t) => mb_strlen($t))->first();
                if ($lengkap && $pisah($lengkap)[1]) $teks = $lengkap;
            }
            [$namaMateri, $kategori] = $pisah($teks);
            $k = $mapel->id_mapel . '|' . $r['tanggal'] . '|' . $norm($namaMateri);
            $sesi[$k] ??= ['mapel' => $mapel, 'tanggal' => $r['tanggal'], 'materi' => $namaMateri, 'kategori' => $kategori, 'dimensi' => $r['dimensi'], 'nilai' => []];
            $sesi[$k]['nilai'][$s->id_siswa][] = (float) $r['nilai'];
            if ($namaSiswa !== $norm($r['nama'])) $masalah["Nama disesuaikan: {$r['nama']} → {$s->nama_siswa}"] = ['…'];
        }

        // Rata-rata per siswa per sesi; nilai 0 diabaikan (dikosongkan)
        $catatan = ['nilai_ganda' => 0, 'nilai_nol' => 0, 'kosong' => 0];
        $siap = 0;
        foreach ($sesi as &$x) {
            foreach ($x['nilai'] as $id => $vals) {
                if (count($vals) > 1) $catatan['nilai_ganda']++;
                $isi = array_values(array_filter($vals, fn($v) => $v > 0));
                $catatan['nilai_nol'] += count($vals) - count($isi);
                if (!$isi) { unset($x['nilai'][$id]); $catatan['kosong']++; continue; }
                $x['nilai'][$id] = round(array_sum($isi) / count($isi), 2);
                $siap++;
            }
        }
        unset($x);

        $tglLibur = collect($sesi)->pluck('tanggal')->unique()->mapWithKeys(fn($t) => [$t => BukanHariMinggu::alasan(Carbon::parse($t))])->filter();
        $kategoriBaru = collect($sesi)->pluck('kategori')->filter()->unique()->reject(fn($k) => MasterKategoriPenilaian::whereRaw('lower(nama_kategori)=?', [$norm($k)])->exists());
        $materiBaru = collect($sesi)->unique(fn($x) => $x['mapel']->id_mapel . '|' . $norm($x['materi']))
            ->reject(fn($x) => $this->materiAda($x, $kelas, $periode));

        $this->info("Kelas {$kelas->nama_kelas}, periode {$periode->id_periode}, jenis {$mbk->kategori_penilaian}");
        $this->line('Baris rekap: ' . count($rows) . " → nilai siap simpan: {$siap} dalam " . count($sesi) . ' sesi');
        $this->line("Nilai ganda dirata-rata: {$catatan['nilai_ganda']} · nilai 0 diabaikan: {$catatan['nilai_nol']} · siswa tanpa nilai di sesi (semua 0): {$catatan['kosong']}");
        $this->line('Kategori baru: ' . ($kategoriBaru->implode(', ') ?: '-'));
        $this->line('Materi baru: ' . $materiBaru->count());
        foreach (collect($sesi)->groupBy(fn($x) => $x['mapel']->nama_mapel) as $m => $g) {
            $this->line(sprintf('  %-28s %3d sesi, %4d nilai, guru: %s', $m, $g->count(), $g->sum(fn($x) => count($x['nilai'])), $g->first()['mapel']->guru?->nama_guru ?? '-'));
        }
        foreach ($geser as $dari => $ke) $this->warn("Tanggal libur $dari dipindah ke $ke");
        foreach ($tglLibur as $t => $alasan) $this->warn("Tanggal $t: $alasan (" . collect($sesi)->where('tanggal', $t)->sum(fn($x) => count($x['nilai'])) . ' nilai)');
        foreach ($masalah as $m => $no) $this->warn($m . (is_array($no) && $no !== ['…'] ? ' (' . count($no) . ' baris)' : ''));
        $lama = TransNilai::where('id_kelas', $kelas->id_kelas)->count();
        $this->line("Nilai lama di kelas ini: {$lama}" . ($this->option('hapus-lama') ? ' → akan DIHAPUS' : ' (dibiarkan)'));

        if (!$this->option('simpan')) { $this->comment('Uji saja, tidak ada yang disimpan. Tambahkan --simpan untuk menulis.'); return 0; }
        if (collect($masalah)->keys()->contains(fn($m) => !str_starts_with($m, 'Nama disesuaikan'))) {
            $this->error('Masih ada baris yang tidak bisa dipetakan; perbaiki dulu.'); return 1;
        }

        DB::transaction(function () use ($sesi, $kelas, $periode, $mbk, $admin, $norm) {
            if ($this->option('hapus-lama')) TransNilai::where('id_kelas', $kelas->id_kelas)->delete();
            foreach ($sesi as $x) {
                $idKat = null;
                if ($x['kategori']) {
                    $idKat = MasterKategoriPenilaian::whereRaw('lower(nama_kategori)=?', [$norm($x['kategori'])])->value('id_kategori')
                        ?? MasterKategoriPenilaian::create(['id_kategori' => 'KAT-' . Str::random(8), 'nama_kategori' => $x['kategori'], 'keterangan' => 'Impor aplikasi lama'])->id_kategori;
                }
                $materi = $this->materiAda($x, $kelas, $periode) ?? MasterMateri::create([
                    'id_materi' => 'MAT-' . Str::random(8), 'id_mapel' => $x['mapel']->id_mapel, 'id_kelas' => $kelas->id_kelas,
                    'id_periode' => $periode->id_periode, 'id_kategori' => $idKat, 'nama_materi' => $x['materi'],
                    'deskripsi_kompetensi' => $x['dimensi'],
                ])->refresh();
                foreach ($x['nilai'] as $idSiswa => $nilai) {
                    $poin = [];
                    foreach (['S', 'T', 'N', 'K', 'M'] as $d) $poin["poin_$d"] = round($nilai * $mbk->{"mat_$d"} * $materi->{"mat_$d"}, 2);
                    $row = TransNilai::firstOrNew(
                        ['tanggal' => $x['tanggal'], 'id_siswa' => $idSiswa, 'id_mapel' => $x['mapel']->id_mapel, 'id_periode' => $periode->id_periode,
                         'id_jenis' => $mbk->id_jenis, 'id_materi' => $materi->id_materi, 'id_kelas' => $kelas->id_kelas, 'tipe_nilai' => 'NORMAL'],
                    );
                    $row->id_nilai ??= 'NIL-' . Str::uuid();
                    $row->fill(['nilai' => $nilai, 'id_guru' => $x['mapel']->id_guru, 'diisi_oleh' => $admin->id, 'metode_stnkm' => 'OTOMATIS', ...$poin])->save();
                }
            }
        });
        $this->info('Selesai disimpan.');
        return 0;
    }

    private function materiAda(array $x, Classes $kelas, MasterPeriode $periode): ?MasterMateri
    {
        return MasterMateri::where('id_mapel', $x['mapel']->id_mapel)->where('id_kelas', $kelas->id_kelas)
            ->where(fn($q) => $q->where('id_periode', $periode->id_periode)->orWhereNull('id_periode'))
            ->whereRaw('lower(nama_materi)=?', [Str::of($x['materi'])->lower()->squish()->toString()])->first();
    }
}

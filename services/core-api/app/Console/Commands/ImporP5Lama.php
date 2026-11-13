<?php

namespace App\Console\Commands;

use App\Models\MasterKategoriPenilaian;
use App\Models\MasterProyek;
use App\Models\MasterTargetP5;
use App\Models\Student;
use App\Models\TransCatatanP5;
use App\Models\TransCatatanWali;
use App\Models\TransNilaiP5;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Sekali jalan: impor projek P5 (projek, target, nilai, catatan proses) dan catatan wali kelas dari database aplikasi lama.
 * Masukan JSON (stdin): {proyek, target, nilai, catatan_p5, catatan_wali} dengan kolom aplikasi lama ditambah "nama" siswa.
 * Baris siswa yang tidak dikenal dilewati; skor P5 0 (belum dinilai) diabaikan. Tanpa --simpan hanya laporan uji.
 */
class ImporP5Lama extends Command
{
    protected $signature = 'p5:impor-lama {--kelas=} {--periode=} {--alias=*} {--simpan}';
    protected $description = 'Impor projek P5 dan catatan wali dari aplikasi lama (uji dulu, simpan dengan --simpan)';

    public function handle(): int
    {
        $d = json_decode(stream_get_contents(STDIN), true);
        if (!is_array($d)) { $this->error('JSON tidak valid.'); return 1; }
        $kelas = $this->option('kelas'); $periode = $this->option('periode');
        $norm = fn($s) => Str::of((string) $s)->lower()->squish()->toString();
        $alias = collect($this->option('alias'))->mapWithKeys(fn($a) => [$norm(Str::before($a, '=')) => $norm(Str::after($a, '='))]);
        $siswa = Student::where('id_kelas', $kelas)->get()->keyBy(fn($s) => $norm($s->nama_siswa));
        $cariSiswa = fn($nama) => $nama ? ($siswa[$alias[$norm($nama)] ?? $norm($nama)] ?? null) : null;
        $lewat = [];

        $katBaru = collect($d['target'])->pluck('kategori')->filter()->unique()
            ->reject(fn($k) => MasterKategoriPenilaian::whereRaw('lower(nama_kategori)=?', [$norm($k)])->exists())->values();
        $proyekAda = MasterProyek::where('id_kelas', $kelas)->where('id_periode', $periode)->pluck('judul_proyek')->map($norm);

        $nilai = collect($d['nilai'])->filter(function ($r) use ($cariSiswa, &$lewat) {
            if (!$cariSiswa($r['nama'])) { $lewat['nilai: siswa tak dikenal'] = ($lewat['nilai: siswa tak dikenal'] ?? 0) + 1; return false; }
            if ((float) $r['skor_rata2'] <= 0) { $lewat['nilai: skor 0 (belum dinilai)'] = ($lewat['nilai: skor 0 (belum dinilai)'] ?? 0) + 1; return false; }
            return true;
        });
        $catP5 = collect($d['catatan_p5'])->filter(fn($r) => $cariSiswa($r['nama']));
        $catWali = collect($d['catatan_wali'])->filter(fn($r) => $cariSiswa($r['nama']));
        $waliTimpa = $catWali->filter(fn($r) => TransCatatanWali::where('id_siswa', $cariSiswa($r['nama'])->id_siswa)->where('id_periode', $periode)->exists())->count();

        $this->line('Projek: ' . collect($d['proyek'])->pluck('judul_proyek')->implode(', ') . ' (sudah ada: ' . collect($d['proyek'])->filter(fn($p) => $proyekAda->contains($norm($p['judul_proyek'])))->count() . ')');
        $this->line('Target: ' . count($d['target']) . ' · kategori baru: ' . ($katBaru->implode(', ') ?: '-'));
        $this->line('Nilai P5 diimpor: ' . $nilai->count() . ' dari ' . count($d['nilai']));
        $this->line('Catatan proses P5: ' . $catP5->count() . ' dari ' . count($d['catatan_p5']));
        $this->line('Catatan wali: ' . $catWali->count() . ' dari ' . count($d['catatan_wali']) . " (menimpa yang ada: $waliTimpa)");
        foreach ($lewat as $k => $n) $this->warn("Dilewati $k: $n");
        $this->warn('Dilewati siswa tak dikenal (catatan): ' . (count($d['catatan_p5']) - $catP5->count() + count($d['catatan_wali']) - $catWali->count()));
        if (!$this->option('simpan')) { $this->comment('Uji saja. Tambahkan --simpan untuk menulis.'); return 0; }

        DB::transaction(function () use ($d, $kelas, $periode, $norm, $cariSiswa, $nilai, $catP5, $catWali) {
            $idProyek = []; $idTarget = [];
            foreach ($d['proyek'] as $p) {
                $proyek = MasterProyek::where('id_kelas', $kelas)->where('id_periode', $periode)->whereRaw('lower(judul_proyek)=?', [$norm($p['judul_proyek'])])->first()
                    ?? MasterProyek::create(['id_proyek' => 'PRY-' . Str::uuid(), 'judul_proyek' => $p['judul_proyek'], 'bentuk' => 'PROYEK',
                        'deskripsi_proyek' => $p['deskripsi_proyek'], 'fase' => $p['fase'], 'id_kelas' => $kelas, 'id_periode' => $periode]);
                $idProyek[$p['id_proyek']] = $proyek->id_proyek;
            }
            foreach ($d['target'] as $t) {
                $idKat = $t['kategori'] ? (MasterKategoriPenilaian::whereRaw('lower(nama_kategori)=?', [$norm($t['kategori'])])->value('id_kategori')
                    ?? MasterKategoriPenilaian::create(['id_kategori' => 'KAT-' . Str::random(8), 'nama_kategori' => $t['kategori'], 'keterangan' => 'Impor aplikasi lama'])->id_kategori) : null;
                $proyek = $idProyek[$t['id_proyek']];
                $target = MasterTargetP5::where('id_proyek', $proyek)->where('id_kategori', $idKat)->where('capaian_akhir_fase', $t['capaian_akhir_fase'])->first()
                    ?? MasterTargetP5::create(['id_target' => 'TP5-' . Str::uuid(), 'id_proyek' => $proyek, 'id_kategori' => $idKat,
                        'dimensi' => $t['dimensi'], 'elemen' => $t['elemen'], 'sub_elemen' => $t['sub_elemen'],
                        'capaian_akhir_fase' => $t['capaian_akhir_fase'], 'relasi_stnkm' => $t['relasi_stnkm']]);
                $idTarget[$t['id_target']] = $target->id_target;
            }
            foreach ($nilai as $n) {
                $s = $cariSiswa($n['nama']);
                $row = TransNilaiP5::firstOrNew(['id_proyek' => $idProyek[$n['id_proyek']], 'id_siswa' => $s->id_siswa, 'id_target' => $idTarget[$n['id_target']]]);
                $row->id_nilaip5 ??= 'P5-' . Str::uuid();
                $row->fill(['id_periode' => $periode, 'id_kelas' => $kelas, 'skor_rata2' => round((float) $n['skor_rata2'], 2), 'predikat' => $n['predikat']])->save();
            }
            foreach ($catP5 as $c) {
                $s = $cariSiswa($c['nama']);
                $row = TransCatatanP5::firstOrNew(['id_proyek' => $idProyek[$c['id_proyek']], 'id_siswa' => $s->id_siswa]);
                $row->id_catatan_p5 ??= 'CP5-' . Str::uuid();
                $row->fill(['catatan_proses' => $c['catatan_proses']])->save();
            }
            foreach ($catWali as $c) {
                $s = $cariSiswa($c['nama']);
                $row = TransCatatanWali::firstOrNew(['id_siswa' => $s->id_siswa, 'id_periode' => $periode]);
                $row->id_catatan_wali ??= 'CWL-' . Str::uuid();
                $row->fill(['catatan_final' => $c['catatan_final']])->save();
            }
        });
        $this->info('Selesai disimpan.');
        return 0;
    }
}

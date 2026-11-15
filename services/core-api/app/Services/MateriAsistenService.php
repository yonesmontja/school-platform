<?php

namespace App\Services;

use App\Models\Atp;
use App\Models\CapaianPembelajaran;
use App\Models\Classes;
use App\Models\MasterIndikator;
use App\Models\MasterKategoriPenilaian;
use App\Models\MasterMateri;
use App\Models\MasterPeriode;
use App\Models\ModulAjar;
use App\Models\PetaTema;
use App\Models\Subject;
use App\Models\User;
use Illuminate\Support\Collection;
use Illuminate\Support\Str;

/**
 * Bahan bantuan pengisian form Materi (TP, IKTP, bobot STNKM) dari perangkat ajar yang sudah ada:
 * alur ATP, Peta Tema (spider web), modul ajar, CP, dan TP materi lain. Dipakai untuk daftar centang TP
 * (tanpa AI) dan sebagai konteks AI.
 */
class MateriAsistenService
{
    public const BOBOT = ['S', 'T', 'N', 'K', 'M'];

    private ?Subject $mapel;
    private ?Classes $kelas;
    private ?MasterPeriode $periode;
    private ?MasterKategoriPenilaian $kategori;
    private ?string $fase;

    public function __construct(private User $user, private array $isi)
    {
        $this->mapel = Subject::find($isi['id_mapel'] ?? null);
        $this->kelas = Classes::find($isi['id_kelas'] ?? null);
        $this->periode = MasterPeriode::find($isi['id_periode'] ?? null) ?? MasterPeriode::where('status_aktif', 'AKTIF')->first();
        $this->kategori = MasterKategoriPenilaian::find($isi['id_kategori'] ?? null);
        $this->fase = CapaianPembelajaran::faseKelas($this->kelas?->nama_kelas);
    }

    /** Daftar TP rujukan, urut dari yang paling dekat dengan alur kerja guru (ATP → Peta Tema → modul → materi lain → CP). */
    public function rujukanTp(): array
    {
        if (!$this->mapel) return [];
        $daftar = collect()
            ->merge($this->dariAtp())
            ->merge($this->dariPetaTema())
            ->merge($this->dariModul())
            ->merge($this->dariMateriLain())
            ->merge($this->dariCp());
        $sekarang = self::kunci($this->isi['deskripsi_kompetensi'] ?? '');
        return $daftar->filter(fn($r) => trim($r['teks']) !== '')
            ->unique(fn($r) => self::kunci($r['teks']))
            ->map(fn($r) => $r + ['dipakai' => $sekarang !== '' && str_contains($sekarang, self::kunci($r['teks']))])
            ->take(30)->values()->all();
    }

    /** Konteks lengkap untuk AI (data dari pengguna hanyalah bahan). */
    public function konteks(): array
    {
        $idMateri = $this->isi['id_materi'] ?? null;
        $lain = MasterMateri::with(['indikator' => fn($q) => $q->where('aktif', true)])
            ->where('id_mapel', $this->mapel?->id_mapel)->where('id_kelas', $this->kelas?->id_kelas)
            ->when($idMateri, fn($q) => $q->where('id_materi', '!=', $idMateri))
            ->orderBy('nama_materi')->limit(25)->get()
            ->map(fn($m) => array_filter([
                'nama' => $m->nama_materi,
                'tp' => Str::limit((string) $m->deskripsi_kompetensi, 300),
                'iktp' => $m->indikator->pluck('deskripsi')->take(6)->all(),
                'bobot' => collect(self::BOBOT)->mapWithKeys(fn($b) => [$b => round((float) $m->{"mat_$b"}, 2)])->all(),
            ]))->values()->all();

        return array_filter([
            'mapel' => $this->mapel?->nama_mapel,
            'kelas' => $this->kelas?->nama_kelas,
            'fase' => $this->fase,
            'semester' => $this->periode ? "{$this->periode->tahun_ajaran} ({$this->periode->semester})" : null,
            'high_level' => $this->kategori ? array_filter(['nama' => $this->kategori->nama_kategori, 'keterangan' => $this->kategori->keterangan]) : null,
            'isian_guru' => array_filter([
                'nama_materi' => trim((string) ($this->isi['nama_materi'] ?? '')),
                'tp' => trim((string) ($this->isi['deskripsi_kompetensi'] ?? '')),
                'iktp_sudah_ada' => collect($this->isi['indikator'] ?? [])->pluck('deskripsi')->filter()->map(fn($d) => trim((string) $d))->values()->all(),
            ]),
            'cp' => $this->cp()->map(fn($c) => ['elemen' => $c->elemen, 'teks' => Str::limit($c->teks, 900)])->values()->all(),
            'alur_atp' => $this->dariAtp()->map(fn($r) => ['urutan' => $r['urutan'], 'tp' => $r['teks'], 'materi' => $r['materi'], 'minggu' => $r['minggu']])->values()->all(),
            'peta_tema' => $this->petaTema()->map(fn($p) => array_filter([
                'tema' => $p->judul,
                'kategori' => $p->jaring['kategori'] ?? null,
                'kalibrasi_mapel_ini' => collect($p->jaring['mapel'] ?? [])->firstWhere('id_mapel', $this->mapel?->id_mapel)['kalibrasi'] ?? null,
                'konsep' => collect($p->jaring['konsep'] ?? [])->map(fn($k) => trim(($k['label'] ?? '') . (($k['detail'] ?? '') ? ': ' . $k['detail'] : '')))->filter()->take(9)->values()->all(),
            ]))->values()->all(),
            'materi_lain_mapel_kelas_ini' => $lain,
        ], fn($v) => $v !== null && $v !== '' && $v !== []);
    }

    public function adaMapel(): bool { return (bool) $this->mapel; }

    private function cp(): Collection
    {
        if (!$this->mapel) return collect();
        $cp = CapaianPembelajaran::where('id_mapel', $this->mapel->id_mapel)->when($this->fase, fn($q) => $q->where('fase', $this->fase))
            ->orderBy('urutan')->get();
        // High Level = elemen CP: dahulukan elemen yang namanya sama
        $nama = Str::lower((string) $this->kategori?->nama_kategori);
        return $nama ? $cp->sortByDesc(fn($c) => Str::contains(Str::lower($c->elemen), $nama) || Str::contains($nama, Str::lower($c->elemen)))->values() : $cp;
    }

    private function dariAtp(): Collection
    {
        if (!$this->mapel || !$this->kelas) return collect();
        $atp = Atp::with(['baris.indikator', 'baris.materi'])
            ->where('id_mapel', $this->mapel->id_mapel)->where('id_kelas', $this->kelas->id_kelas)
            ->when($this->periode, fn($q) => $q->where('id_periode', $this->periode->id_periode))
            ->orderByRaw("CASE status WHEN 'DISETUJUI' THEN 0 WHEN 'DIAJUKAN' THEN 1 ELSE 2 END")->orderByDesc('updated_at')
            ->first();
        if (!$atp) return collect();
        return $atp->baris->map(fn($b) => [
            'teks' => trim((string) ($b->indikator?->deskripsi ?: $b->tp_usulan)),
            'sumber' => 'ATP',
            'label' => "ATP langkah {$b->urutan}" . ($b->minggu ? " · minggu {$b->minggu}" : '') . ($atp->status !== 'DISETUJUI' ? ' · ' . Str::lower($atp->status) : ''),
            'urutan' => $b->urutan,
            'materi' => $b->materi?->nama_materi ?: $b->materi_usulan,
            'minggu' => $b->minggu,
            'cocok' => $this->cocokMateri($b->id_materi, $b->materi?->nama_materi ?: $b->materi_usulan),
        ])->sortByDesc('cocok')->values();
    }

    /** Peta tema kelas ini yang boleh dilihat pengguna (disetujui, atau buatannya sendiri) dan memuat cabang mapel ini. */
    private function petaTema(): Collection
    {
        if (!$this->mapel || !$this->kelas) return collect();
        return PetaTema::where('id_kelas', $this->kelas->id_kelas)
            ->when($this->periode, fn($q) => $q->where(fn($w) => $w->where('id_periode', $this->periode->id_periode)->orWhereNull('id_periode')))
            ->where(fn($q) => $q->where('status', 'DISETUJUI')->orWhere('dibuat_oleh', $this->user->id))
            ->orderByDesc('updated_at')->limit(6)->get()
            ->filter(fn($p) => collect($p->jaring['mapel'] ?? [])->contains('id_mapel', $this->mapel->id_mapel))->values();
    }

    private function dariPetaTema(): Collection
    {
        $hasil = collect();
        foreach ($this->petaTema() as $p) {
            $cabang = collect($p->jaring['mapel'] ?? [])->firstWhere('id_mapel', $this->mapel->id_mapel);
            $label = "Peta Tema “{$p->judul}”";
            foreach (MasterIndikator::whereIn('id_indikator', $cabang['tp'] ?? [])->pluck('deskripsi') as $d) {
                $hasil->push(['teks' => $d, 'sumber' => 'PETA_TEMA', 'label' => "$label · TP terkait", 'cocok' => 1]);
            }
            if (trim((string) ($cabang['kalibrasi'] ?? '')) !== '') {
                $hasil->push(['teks' => trim($cabang['kalibrasi']), 'sumber' => 'PETA_TEMA', 'label' => "$label · kalibrasi {$this->mapel->nama_mapel}", 'cocok' => 1]);
            }
        }
        return $hasil;
    }

    private function dariModul(): Collection
    {
        if (!$this->mapel || !$this->kelas) return collect();
        $modul = ModulAjar::where('id_mapel', $this->mapel->id_mapel)->where('id_kelas', $this->kelas->id_kelas)
            ->when($this->periode, fn($q) => $q->where('id_periode', $this->periode->id_periode))
            ->where(fn($q) => $q->where('status', 'DISETUJUI')->orWhere('dibuat_oleh', $this->user->id))
            ->orderByDesc('updated_at')->limit(8)->get(['judul', 'tp', 'id_materi']);
        $teks = MasterIndikator::whereIn('id_indikator', $modul->pluck('tp')->flatten()->filter()->unique())->pluck('deskripsi', 'id_indikator');
        return $modul->flatMap(fn($m) => collect($m->tp ?? [])->map(fn($id) => [
            'teks' => (string) ($teks[$id] ?? ''), 'sumber' => 'MODUL', 'label' => "Modul ajar “{$m->judul}”",
            'cocok' => $this->cocokMateri($m->id_materi, $m->judul),
        ]))->sortByDesc('cocok')->values();
    }

    private function dariMateriLain(): Collection
    {
        if (!$this->mapel) return collect();
        $idMateri = $this->isi['id_materi'] ?? null;
        return MasterMateri::with('kelas:id_kelas,nama_kelas')->where('id_mapel', $this->mapel->id_mapel)
            ->whereNotNull('deskripsi_kompetensi')->where('deskripsi_kompetensi', '!=', '')
            ->when($idMateri, fn($q) => $q->where('id_materi', '!=', $idMateri))
            ->orderByRaw('CASE WHEN id_kelas = ? THEN 0 ELSE 1 END', [$this->kelas?->id_kelas ?? ''])
            ->orderByDesc('updated_at')->limit(12)->get()
            ->map(fn($m) => [
                'teks' => trim($m->deskripsi_kompetensi), 'sumber' => 'MATERI',
                'label' => "Materi “{$m->nama_materi}”" . ($m->kelas ? " · {$m->kelas->nama_kelas}" : ''),
                'cocok' => $this->cocokMateri($m->id_materi, $m->nama_materi),
            ])->sortByDesc('cocok')->values();
    }

    private function dariCp(): Collection
    {
        return $this->cp()->take(4)->map(fn($c) => [
            'teks' => Str::limit(trim($c->teks), 500), 'sumber' => 'CP', 'label' => "CP fase {$c->fase} · elemen {$c->elemen}", 'cocok' => 0,
        ]);
    }

    /** 1 bila rujukan menyangkut materi yang sedang diisi (id sama atau nama mirip). */
    private function cocokMateri(?string $id, ?string $nama): int
    {
        if ($id && $id === ($this->isi['id_materi'] ?? null)) return 2;
        $a = self::kunci($this->isi['nama_materi'] ?? '');
        $b = self::kunci((string) $nama);
        return $a !== '' && $b !== '' && (str_contains($a, $b) || str_contains($b, $a)) ? 1 : 0;
    }

    private static function kunci(string $t): string
    {
        return trim(preg_replace('/[^a-z0-9]+/', ' ', Str::lower($t)));
    }

    /** Bobot STNKM dari AI → 0..1 kelipatan 0,05; aspek yang tidak disebut tidak diubah (null). */
    public static function normalBobot($bobot): array
    {
        $hasil = [];
        foreach (self::BOBOT as $b) {
            $v = is_array($bobot) ? ($bobot[$b] ?? $bobot[strtolower($b)] ?? null) : null;
            if (!is_numeric($v)) { $hasil[$b] = null; continue; }
            $v = (float) $v;
            if ($v > 1) $v /= 100; // AI kadang menjawab dalam persen
            $hasil[$b] = round(max(0, min(1, $v)) * 20) / 20;
        }
        return $hasil;
    }

    /** IKTP dari AI: teks bersih, unik, tidak mengulang IKTP yang sudah ada. */
    public static function normalIktp($daftar, array $sudahAda): array
    {
        $ada = collect($sudahAda)->map(fn($d) => self::kunci((string) $d))->filter()->all();
        return collect(is_array($daftar) ? $daftar : [])
            ->map(fn($x) => is_array($x) ? $x : ['deskripsi' => $x])
            ->map(fn($x) => [
                'deskripsi' => Str::limit(trim(preg_replace('/\s+/', ' ', (string) ($x['deskripsi'] ?? ''))), 300, ''),
                'dimensi' => in_array(strtoupper((string) ($x['dimensi'] ?? '')), self::BOBOT, true) ? strtoupper($x['dimensi']) : null,
            ])
            ->filter(fn($x) => mb_strlen($x['deskripsi']) >= 8 && !in_array(self::kunci($x['deskripsi']), $ada, true))
            ->unique(fn($x) => self::kunci($x['deskripsi']))
            ->take(8)->values()->all();
    }
}

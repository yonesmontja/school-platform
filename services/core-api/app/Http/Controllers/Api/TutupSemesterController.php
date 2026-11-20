<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Classes;
use App\Models\HariLibur;
use App\Models\MasterPeriode;
use App\Models\PengampuMapel;
use App\Models\Subject;
use App\Models\TransCatatanWali;
use App\Models\TransJadwal;
use App\Models\TransNilai;
use App\Models\TransRencanaRemedial;
use App\Services\Pengampu;
use App\Services\RiwayatRombel;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Wizard Tutup Semester: periksa kelengkapan semester aktif, lalu pindah ke semester berikutnya dengan
 * memotret rombel & wali, menyalin rombel aktif, pembagian mengajar, dan pola jadwal mingguan (Ganjil → Genap),
 * serta mengunci semester lama agar hanya bisa dibaca.
 */
class TutupSemesterController extends Controller
{
    /** Maksimal sesi jadwal yang dibuat sekali salin, agar permintaan tidak terlalu berat. */
    private const MAKS_SESI = 5000;

    public function periksa()
    {
        $aktif = MasterPeriode::where('status_aktif', 'AKTIF')->first();
        if (!$aktif) return response()->json(['aktif' => null, 'message' => 'Belum ada semester aktif.']);

        [$ta, $sem] = self::berikutnya($aktif);
        $tujuan = MasterPeriode::where('tahun_ajaran', $ta)->where('semester', $sem)->first();
        $naikTahun = $aktif->semester === 'Genap';
        $kelas = Classes::aktifSemester($aktif->id_periode)->orderBy('nama_kelas')->get(['id_kelas', 'nama_kelas', 'tingkat']);

        return response()->json([
            'aktif' => $aktif,
            'usulan' => ['tahun_ajaran' => $ta, 'semester' => $sem, 'id_periode' => $tujuan?->id_periode,
                'tanggal_mulai' => $tujuan?->tanggal_mulai?->toDateString(), 'tanggal_selesai' => $tujuan?->tanggal_selesai?->toDateString()],
            'naik_tahun' => $naikTahun,
            'pilihan_tujuan' => MasterPeriode::where('id_periode', '!=', $aktif->id_periode)->where('status_aktif', '!=', 'AKTIF')
                ->orderBy('tahun_ajaran')->orderBy('semester')->get(['id_periode', 'tahun_ajaran', 'semester', 'tanggal_mulai', 'tanggal_selesai', 'terkunci']),
            'periksa' => $this->daftarPeriksa($aktif, $kelas),
            'salin' => [
                'rombel' => $kelas->count(),
                'pengampu' => PengampuMapel::where('id_periode', $aktif->id_periode)->count(),
                'jadwal_seri' => $this->seriJadwal($aktif->id_periode)->count(),
            ],
        ]);
    }

    public function jalankan(Request $request)
    {
        $data = $request->validate([
            'id_periode_tujuan' => 'nullable|exists:master_periode,id_periode',
            'tahun_ajaran' => 'required_without:id_periode_tujuan|nullable|string|max:20',
            'semester' => 'required_without:id_periode_tujuan|nullable|in:Ganjil,Genap',
            'tanggal_mulai' => 'nullable|date_format:Y-m-d',
            'tanggal_selesai' => 'nullable|date_format:Y-m-d|after:tanggal_mulai',
            'salin_rombel' => 'boolean',
            'salin_pengampu' => 'boolean',
            'salin_jadwal' => 'boolean',
            'kunci_lama' => 'boolean',
        ]);
        $aktif = MasterPeriode::where('status_aktif', 'AKTIF')->first();
        abort_unless($aktif, 422, 'Belum ada semester aktif untuk ditutup.');
        abort_if(($data['id_periode_tujuan'] ?? null) === $aktif->id_periode, 422, 'Semester tujuan harus berbeda dari semester aktif.');
        $naikTahun = $aktif->semester === 'Genap';

        $hasil = DB::transaction(function () use ($data, $aktif, $naikTahun, $request) {
            // 1. Rombel & wali semester lama dipotret ke riwayat
            $siswa = RiwayatRombel::potret($aktif->id_periode);

            // 2. Semester tujuan: yang sudah ada atau dibuat baru
            $tujuan = !empty($data['id_periode_tujuan'])
                ? MasterPeriode::findOrFail($data['id_periode_tujuan'])
                : MasterPeriode::firstOrCreate(
                    ['tahun_ajaran' => $data['tahun_ajaran'], 'semester' => $data['semester']],
                    ['id_periode' => 'PER-' . Str::random(8), 'status_aktif' => 'TUTUP'],
                );
            $tujuan->fill(array_filter([
                'tanggal_mulai' => $data['tanggal_mulai'] ?? null,
                'tanggal_selesai' => $data['tanggal_selesai'] ?? null,
            ]));

            // 3. Rombel aktif & pembagian mengajar (pembagian hanya dalam tahun ajaran yang sama: siswa & rombelnya sama)
            $rombel = $request->boolean('salin_rombel', true) ? $this->salinRombel($aktif->id_periode, $tujuan->id_periode, $request->user()?->id) : 0;
            $pengampu = !$naikTahun && $request->boolean('salin_pengampu', true) ? Pengampu::salin($aktif->id_periode, $tujuan->id_periode) : 0;

            // 4. Pindah semester aktif
            MasterPeriode::where('status_aktif', 'AKTIF')->update(['status_aktif' => 'TUTUP']);
            $tujuan->status_aktif = 'AKTIF';
            $tujuan->terkunci = false;
            $tujuan->dikunci_pada = null;
            $tujuan->save();

            // 5. Pola jadwal mingguan (hanya Ganjil → Genap)
            $jadwal = !$naikTahun && $request->boolean('salin_jadwal') ? $this->salinJadwal($aktif->id_periode, $tujuan, $request->user()?->id) : ['sesi' => 0, 'seri' => 0];

            // 6. Kunci semester lama
            if ($request->boolean('kunci_lama', true)) {
                $aktif->forceFill(['terkunci' => true, 'dikunci_pada' => now()])->save();
            }

            return compact('tujuan', 'siswa', 'rombel', 'pengampu', 'jadwal');
        });

        $t = $hasil['tujuan'];
        return response()->json([
            'message' => "Semester {$aktif->tahun_ajaran} {$aktif->semester} ditutup. Semester aktif sekarang {$t->tahun_ajaran} {$t->semester}.",
            'periode' => $t->fresh(),
            'ringkasan' => [
                'siswa_dicatat' => $hasil['siswa'],
                'rombel_disalin' => $hasil['rombel'],
                'pengampu_disalin' => $hasil['pengampu'],
                'jadwal_seri' => $hasil['jadwal']['seri'],
                'jadwal_sesi' => $hasil['jadwal']['sesi'],
                'dikunci' => $request->boolean('kunci_lama', true),
                'naik_tahun' => $naikTahun,
            ],
        ]);
    }

    /** Admin membuka atau mengunci kembali sebuah semester. Semester aktif tidak bisa dikunci. */
    public function kunci(Request $request, string $id)
    {
        $request->validate(['terkunci' => 'required|boolean']);
        $p = MasterPeriode::findOrFail($id);
        abort_if($request->boolean('terkunci') && $p->status_aktif === 'AKTIF', 422, 'Semester aktif tidak bisa dikunci. Tutup semester dulu.');
        $p->forceFill(['terkunci' => $request->boolean('terkunci'), 'dikunci_pada' => $request->boolean('terkunci') ? now() : null])->save();
        return response()->json([
            'message' => $p->terkunci ? "Semester {$p->tahun_ajaran} {$p->semester} dikunci." : "Semester {$p->tahun_ajaran} {$p->semester} dibuka untuk perbaikan.",
            'data' => $p,
        ]);
    }

    /** Ganjil → Genap tahun ajaran yang sama; Genap → Ganjil tahun ajaran berikutnya. */
    public static function berikutnya(MasterPeriode $p): array
    {
        if ($p->semester === 'Ganjil') return [$p->tahun_ajaran, 'Genap'];
        if (preg_match('/^(\d{4})(\D+)(\d{4})$/', trim($p->tahun_ajaran), $m)) return [((int) $m[1] + 1) . $m[2] . ((int) $m[3] + 1), 'Ganjil'];
        return [$p->tahun_ajaran, 'Ganjil'];
    }

    private function daftarPeriksa(MasterPeriode $p, Collection $kelas): array
    {
        $item = [];
        $idKelas = $kelas->pluck('id_kelas');

        // Catatan wali yang belum ditulis, per rombel
        $sudah = TransCatatanWali::where('id_periode', $p->id_periode)->whereRaw("coalesce(trim(catatan_final), '') <> ''")->pluck('id_siswa')->flip();
        foreach ($kelas as $k) {
            $belum = RiwayatRombel::anggota($k->id_kelas, $p->id_periode)->pluck('id_siswa')->reject(fn($s) => $sudah->has($s))->count();
            if ($belum) $item[] = ['jenis' => 'catatan_wali', 'tingkat' => 'peringatan', 'judul' => "{$k->nama_kelas}: {$belum} siswa belum punya catatan wali",
                'href' => '/dashboard/rapor'];
        }

        // Mapel yang belum punya nilai sama sekali di rombel tertentu
        $adaNilai = TransNilai::where('id_periode', $p->id_periode)->whereIn('id_kelas', $idKelas)
            ->select('id_kelas', 'id_mapel')->distinct()->get()->map(fn($r) => "{$r->id_kelas}|{$r->id_mapel}")->flip();
        $mapel = Subject::orderBy('nama_mapel')->get(['id_mapel', 'nama_mapel']);
        foreach ($kelas as $k) {
            $kosong = $mapel->reject(fn($m) => $adaNilai->has("{$k->id_kelas}|{$m->id_mapel}"))->pluck('nama_mapel');
            if ($kosong->isNotEmpty()) $item[] = ['jenis' => 'nilai_kosong', 'tingkat' => 'info',
                'judul' => "{$k->nama_kelas}: {$kosong->count()} mapel belum punya nilai", 'rincian' => $kosong->take(12)->implode(', ') . ($kosong->count() > 12 ? ', …' : ''),
                'href' => '/dashboard/nilai'];
        }

        // Remedial yang masih direncanakan
        $remedial = TransRencanaRemedial::where('status', 'DIRENCANAKAN')
            ->whereHas('nilaiAsal', fn($q) => $q->where('id_periode', $p->id_periode))->count();
        if ($remedial) $item[] = ['jenis' => 'remedial', 'tingkat' => 'peringatan', 'judul' => "{$remedial} rencana remedial belum selesai", 'href' => '/dashboard/notifikasi'];

        // Sesi jadwal yang sudah lewat tapi belum ditandai
        $sesi = TransJadwal::where('id_periode', $p->id_periode)->where('status_sesi', 'Menunggu')->where('selesai', '<', now())->count();
        if ($sesi) $item[] = ['jenis' => 'jadwal', 'tingkat' => 'info', 'judul' => "{$sesi} sesi jadwal yang sudah lewat belum ditandai Selesai/Batal", 'href' => '/dashboard/jadwal'];

        return $item;
    }

    private function salinRombel(string $dari, string $ke, ?int $oleh): int
    {
        $nonaktif = Classes::idNonaktif($dari);
        $now = now();
        $n = 0;
        foreach (Classes::pluck('id_kelas') as $k) {
            $ada = DB::table('kelas_periode')->where(['id_kelas' => $k, 'id_periode' => $ke])->exists();
            if ($ada) continue;
            DB::table('kelas_periode')->insert(['id_kelas' => $k, 'id_periode' => $ke, 'aktif' => !in_array($k, $nonaktif, true),
                'diubah_oleh' => $oleh, 'created_at' => $now, 'updated_at' => $now]);
            $n++;
        }
        return $n;
    }

    /**
     * Seri jadwal berulang semester itu (bukan dari Peta Tema; jadwal tema dibuat ulang lewat Peta Tema → Buat Jadwal).
     * @return Collection<string, Collection<int, TransJadwal>>
     */
    private function seriJadwal(string $idPeriode): Collection
    {
        return TransJadwal::where('id_periode', $idPeriode)->whereNotNull('id_group')->whereNull('id_peta')
            ->where('status_sesi', '!=', 'Batal')->orderBy('mulai')->get()->groupBy('id_group');
    }

    /** Ulangi pola mingguan tiap seri (hari & jam) di rentang semester tujuan, melewati hari libur. Materi & perangkat tidak ikut. */
    private function salinJadwal(string $dari, MasterPeriode $tujuan, ?int $oleh): array
    {
        [$mulai, $selesai] = $tujuan->rentang();
        $mulai = $mulai->copy()->max(now()->startOfDay());
        $sesi = 0;
        $seri = 0;
        foreach ($this->seriJadwal($dari) as $daftar) {
            $contoh = $daftar->last();
            // Pola: hari dalam pekan → jam mulai & selesai (sesi terakhir per hari yang dipakai)
            $pola = $daftar->keyBy(fn($j) => $j->mulai->dayOfWeek)->map(fn($j) => [$j->mulai->format('H:i:s'), $j->selesai->format('H:i:s')]);
            $idGroup = 'GRP-' . Str::uuid();
            $baris = [];
            for ($d = $mulai->copy()->startOfDay(); $d->lte($selesai); $d->addDay()) {
                if (!isset($pola[$d->dayOfWeek]) || HariLibur::namaPada($d)) continue;
                [$jm, $js] = $pola[$d->dayOfWeek];
                $baris[] = [
                    'id_jadwal' => 'JDW-' . Str::uuid(), 'id_group' => $idGroup, 'id_periode' => $tujuan->id_periode,
                    'id_kelas' => $contoh->id_kelas, 'id_guru' => $contoh->id_guru, 'id_mapel' => $contoh->id_mapel, 'id_ruangan' => $contoh->id_ruangan,
                    'judul' => $contoh->judul, 'warna' => $contoh->warna, 'catatan' => $contoh->catatan,
                    'mulai' => Carbon::parse($d->toDateString() . ' ' . $jm), 'selesai' => Carbon::parse($d->toDateString() . ' ' . $js),
                    'status_sesi' => 'Menunggu', 'dibuat_oleh' => $oleh, 'created_at' => now(), 'updated_at' => now(),
                ];
            }
            if (!$baris) continue;
            if ($sesi + count($baris) > self::MAKS_SESI) abort(422, 'Pola jadwal terlalu banyak untuk disalin sekaligus (maks. ' . self::MAKS_SESI . ' sesi). Salin tanpa jadwal, lalu buat jadwal di menu Jadwal.');
            // Sisip langsung (satu catatan log untuk seluruh salinan lewat log permintaan, bukan ribuan log per sesi)
            foreach (array_chunk($baris, 500) as $c) TransJadwal::insert($c);
            $sesi += count($baris);
            $seri++;
        }
        return ['sesi' => $sesi, 'seri' => $seri];
    }
}

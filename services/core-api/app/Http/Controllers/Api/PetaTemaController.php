<?php

namespace App\Http\Controllers\Api;

use App\Models\NotebookCatatan;
use App\Http\Controllers\Controller;
use App\Models\CapaianPembelajaran;
use App\Models\Classes;
use App\Models\MasterIndikator;
use App\Models\MasterKategoriPenilaian;
use App\Models\MasterPeriode;
use App\Models\PetaTema;
use App\Models\Subject;
use App\Models\TransJadwal;
use App\Services\PerangkatAjarAIService;
use App\Services\PetaTemaJadwalService;
use App\Services\SoalAIService;
use Carbon\Carbon;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

/**
 * Peta Tema / spider web kurikulum PBPM (Perangkat Ajar). Tema lintas mapel yang menggerakkan Jadwal kelas.
 * Kepala sekolah menyusun & menetapkan (admin boleh mengisi, tetap atas nama kepala sekolah); guru/wali kelas melihat
 * peta yang sudah ditetapkan. Pola mingguan terstruktur dijadikan sesi Jadwal lewat PetaTemaJadwalService.
 */
class PetaTemaController extends Controller
{
    private const RELASI = ['kelas:id_kelas,nama_kelas', 'periode:id_periode,tahun_ajaran,semester', 'pembuat:id,name,id_guru,role', 'penyetuju:id,name', 'penginput:id,name,role', 'kategori:id_kategori,nama_kategori'];

    public function __construct(private PetaTemaJadwalService $jadwal) {}

    /** Mapel (semua) beserta TP aktif per mapel untuk kelas itu, untuk memilih cabang & TP. */
    public function referensi(Request $request)
    {
        $request->validate(['id_kelas' => 'nullable|exists:classes,id_kelas']);
        $tp = MasterIndikator::query()->where('aktif', true)
            ->join('master_materi as m', 'm.id_materi', '=', 'master_indikator.id_materi')
            ->when($request->id_kelas, fn($q) => $q->where(fn($w) => $w->where('m.id_kelas', $request->id_kelas)->orWhereNull('m.id_kelas')))
            ->orderBy('m.nama_materi')->orderBy('master_indikator.urutan')
            ->get(['master_indikator.id_indikator', 'master_indikator.deskripsi', 'm.id_mapel', 'm.nama_materi'])
            ->groupBy('id_mapel');
        return response()->json([
            'mapel' => Subject::orderBy('nama_mapel')->get(['id_mapel', 'nama_mapel'])
                ->map(fn($s) => $s->toArray() + ['tp' => ($tp[$s->id_mapel] ?? collect())->map(fn($t) => $t->only(['id_indikator', 'deskripsi', 'nama_materi']))->values()]),
            'pendekatan_bawaan' => PetaTema::PENDEKATAN_BAWAAN,
            // High Level yang berlaku untuk semua mapel (tema lintas mapel)
            'high_level' => MasterKategoriPenilaian::whereNull('id_mapel')->orderBy('nama_kategori')->get(['id_kategori', 'nama_kategori']),
        ]);
    }

    /** Tambah High Level (semua mapel) dari Peta Tema: kepala sekolah/admin; nama yang sudah ada dipakai ulang. */
    public function tambahHighLevel(Request $request)
    {
        abort_unless($this->bolehMenyusun($request), 403, 'High Level baru ditambahkan kepala sekolah atau admin.');
        $nama = trim((string) $request->validate(['nama_kategori' => 'required|string|max:150'])['nama_kategori']);
        $ada = MasterKategoriPenilaian::whereNull('id_mapel')->get(['id_kategori', 'nama_kategori'])->first(fn($k) => mb_strtolower(trim($k->nama_kategori)) === mb_strtolower($nama));
        $k = $ada ?? MasterKategoriPenilaian::create(['id_kategori' => 'KAT-' . Str::random(8), 'id_mapel' => null, 'nama_kategori' => $nama, 'keterangan' => 'Dibuat dari Peta Tema']);
        return response()->json(['success' => true, 'data' => $k->only(['id_kategori', 'nama_kategori']),
            'message' => $ada ? "High Level \"{$k->nama_kategori}\" sudah ada; dipakai." : "High Level \"{$k->nama_kategori}\" ditambahkan."], $ada ? 200 : 201);
    }

    /**
     * High Level dari peta tema kelas ini untuk formulir Materi: peta tema ditentukan lebih dulu, lalu materi mapel–kelas itu
     * otomatis memakai High Level-nya. Peta yang memuat mapel itu sebagai cabang didahulukan; yang sedang/akan berjalan lebih dulu.
     */
    public function highLevel(Request $request)
    {
        $request->validate(['id_kelas' => 'required|exists:classes,id_kelas', 'id_mapel' => 'nullable|exists:subjects,id_mapel', 'id_periode' => 'nullable|string']);
        $kini = Carbon::now(config('app.zona_sekolah'))->startOfDay();
        $peta = PetaTema::with('kategori:id_kategori,nama_kategori')->where('id_kelas', $request->id_kelas)->whereNotNull('id_kategori')
            ->when($request->id_periode, fn($q) => $q->where(fn($w) => $w->where('id_periode', $request->id_periode)->orWhereNull('id_periode')))
            ->get(['id_peta', 'judul', 'status', 'id_kategori', 'tanggal_mulai', 'jumlah_minggu', 'jaring'])
            ->map(function ($p) use ($request, $kini) {
                $akhir = $p->tanggal_mulai ? Carbon::parse($p->tanggal_mulai->format('Y-m-d'))->addWeeks($p->jumlah_minggu) : null;
                return [
                    'id_peta' => $p->id_peta, 'judul' => $p->judul, 'status' => $p->status, 'id_kategori' => $p->id_kategori,
                    'nama_kategori' => $p->kategori?->nama_kategori, 'tanggal_mulai' => $p->tanggal_mulai?->format('Y-m-d'),
                    'memuat_mapel' => $request->id_mapel ? collect($p->jaring['mapel'] ?? [])->contains('id_mapel', $request->id_mapel) : false,
                    'berjalan' => !$akhir || $akhir->gte($kini),
                ];
            })
            ->sortBy(fn($p) => [!$p['memuat_mapel'], !$p['berjalan'], $p['status'] !== 'DISETUJUI', $p['tanggal_mulai'] ?? '9999'])->values();
        return response()->json(['data' => $peta]);
    }

    public function index(Request $request)
    {
        $request->validate(['status' => ['nullable', Rule::in(\App\Models\Atp::STATUS)], 'id_kelas' => 'nullable|string']);
        $data = $this->terjangkau($request)->with(self::RELASI)
            ->when($request->status, fn($q) => $q->where('status', $request->status))
            ->when($request->id_kelas, fn($q) => $q->where('id_kelas', $request->id_kelas))
            ->orderByRaw("CASE status WHEN 'DIAJUKAN' THEN 0 WHEN 'REVISI' THEN 1 WHEN 'DRAF' THEN 2 ELSE 3 END")
            ->orderByDesc('updated_at')->get()
            ->map(fn($p) => collect($p->toArray())->except(['minggu', 'pola', 'pendekatan', 'konteks_lokal'])->all() + [
                'jumlah_mapel' => count($p->jaring['mapel'] ?? []), 'jumlah_konsep' => count($p->jaring['konsep'] ?? []),
            ]);
        return response()->json(['data' => $data]);
    }

    public function show(Request $request, string $id)
    {
        return response()->json(['data' => $this->muat($this->terjangkau($request)->with(self::RELASI)->findOrFail($id))]);
    }

    public function simpan(Request $request, ?string $id = null)
    {
        $peta = $id ? PetaTema::findOrFail($id) : null;
        if ($peta) $this->cekPengubah($request, $peta);
        abort_if(!$peta && !$this->bolehMenyusun($request), 403, 'Peta tema disusun dan ditetapkan kepala sekolah; guru dan wali kelas melihat peta yang sudah ditetapkan.');
        $data = $request->validate([
            'judul' => [$peta ? 'sometimes' : 'required', 'string', 'max:200'],
            'id_kelas' => 'nullable|exists:classes,id_kelas',
            'id_periode' => 'nullable|exists:master_periode,id_periode',
            'tanggal_mulai' => 'nullable|date',
            'jumlah_minggu' => 'nullable|integer|min:1|max:' . PetaTema::MAKS_MINGGU,
            'pendekatan' => 'nullable|string|max:2000',
            'konteks_lokal' => 'nullable|string|max:2000',
            'jaring' => 'nullable|array',
            'minggu' => 'nullable|array|max:' . PetaTema::MAKS_MINGGU,
            'pola' => 'nullable|array',
            'pola_slot' => 'nullable|array',
            'pola_slot.slot' => 'nullable|array|max:' . PetaTema::MAKS_SLOT,
            'id_kategori' => 'nullable|exists:master_kategori_penilaian,id_kategori',
        ]);
        $kelas = array_key_exists('id_kelas', $data) ? Classes::find($data['id_kelas']) : $peta?->kelas;
        $jumlah = (int) ($data['jumlah_minggu'] ?? $peta?->jumlah_minggu ?? 3);
        $isi = [
            'fase' => CapaianPembelajaran::faseKelas($kelas?->nama_kelas),
            'jumlah_minggu' => $jumlah,
            'jaring' => $this->jaringSah(PetaTema::normalJaring($data['jaring'] ?? $peta?->jaring)),
            'minggu' => PetaTema::normalMinggu($data['minggu'] ?? $peta?->minggu, $jumlah),
            'pola' => PetaTema::normalPola($data['pola'] ?? $peta?->pola),
        ];
        // High Level menjadi pusat spider web: teks kategori di jaring mengikuti nama High Level
        $idKategori = array_key_exists('id_kategori', $data) ? $data['id_kategori'] : $peta?->id_kategori;
        if ($idKategori) $isi['jaring']['kategori'] = mb_substr((string) MasterKategoriPenilaian::whereKey($idKategori)->value('nama_kategori'), 0, 40);
        $slotBerubah = false;
        if (array_key_exists('pola_slot', $data)) {
            $isi['pola_slot'] = PetaTema::normalSlot($data['pola_slot']);
            $lama = $peta ? PetaTema::normalSlot($peta->pola_slot)['slot'] : [];
            $kunci = fn($d) => collect($d)->map(fn($x) => [$x['id'], $x['hari'], $x['mulai'], $x['selesai'], $x['id_mapel'], $x['ulang']])->all();
            $slotBerubah = $kunci($isi['pola_slot']['slot']) !== $kunci($lama);
            // Pola terstruktur menjadi sumber teks pola mingguan
            if ($isi['pola_slot']['slot']) $isi['pola'] = $this->jadwal->teksDariSlot($isi['pola_slot'], $isi['jaring']);
        }
        $adaJadwal = $peta?->jadwal_dibuat_pada !== null;
        if (isset($data['jumlah_minggu']) && $adaJadwal && (int) $data['jumlah_minggu'] !== $peta->jumlah_minggu) $slotBerubah = true;
        if (isset($data['tanggal_mulai']) && $adaJadwal && $data['tanggal_mulai'] !== $peta->tanggal_mulai?->format('Y-m-d')) $slotBerubah = true;
        if ($slotBerubah && $adaJadwal && $peta->terkunci()) {
            return response()->json(['message' => 'Pola sudah diubah ' . PetaTema::BATAS_PERUBAHAN . ' kali sejak jadwal dibuat dan terkunci. Buka kunci dulu bila memang perlu diubah lagi.'], 422);
        }
        $header = collect($data)->except(['jaring', 'minggu', 'pola', 'pola_slot', 'jumlah_minggu'])->all();

        if (!$peta) {
            // array_merge: nilai bawaan di bawah menimpa null dari formulir
            $peta = PetaTema::create(array_merge($header, $isi, [
                'id_peta' => 'PTM-' . Str::upper(Str::random(10)),
                'id_periode' => ($header['id_periode'] ?? null) ?: MasterPeriode::where('status_aktif', 'AKTIF')->value('id_periode'),
                'pendekatan' => ($header['pendekatan'] ?? null) ?: PetaTema::PENDEKATAN_BAWAAN,
                'status' => 'DRAF', 'dibuat_oleh' => PetaTemaJadwalService::akunKepsek($request->user())->id, 'diinput_oleh' => $request->user()->id,
                'sumber' => $request->input('sumber') === 'AI' ? 'AI' : 'MANUAL', 'ai_mode' => $request->input('sumber') === 'AI' ? $request->input('ai_mode') : null,
            ]));
        } else {
            // Peta yang sudah ditetapkan tetap berlaku (kepala sekolah sendiri yang mengubah); versi naik
            if ($peta->status === 'DISETUJUI') $header += ['versi' => $peta->versi + 1];
            if ($request->input('sumber') === 'AI') $header += ['sumber' => 'AI', 'ai_mode' => $request->input('ai_mode')];
            $header += ['diinput_oleh' => $request->user()->id];
            $peta->fill($header + $isi);
            if ($slotBerubah && $adaJadwal) $peta->catatPerubahan($request->user(), 'POLA', 'Pola mingguan diubah di Peta Tema');
            $peta->save();
        }
        $sinkron = $slotBerubah && $adaJadwal ? $this->jadwal->sinkron($peta->fresh()) : null;
        return response()->json(['success' => true, 'message' => 'Peta tema disimpan.' . ($sinkron ? ' ' . $this->pesanSinkron($sinkron) : ''),
            'sinkron' => $sinkron, 'data' => $this->muat($peta->fresh(self::RELASI))], $id ? 200 : 201);
    }

    public function destroy(Request $request, string $id)
    {
        $peta = PetaTema::findOrFail($id);
        $this->cekPengubah($request, $peta);
        // Sesi tema yang belum dimulai ikut dihapus; yang sudah berjalan tetap ada sebagai riwayat
        $hapus = TransJadwal::where('id_peta', $peta->id_peta)->where('mulai', '>', now(config('app.zona_sekolah'))->format('Y-m-d H:i:s'))->delete();
        $peta->delete();
        return response()->json(['success' => true, 'message' => 'Peta tema dihapus.' . ($hapus ? " {$hapus} sesi tema yang akan datang ikut dihapus dari Jadwal." : '')]);
    }

    /**
     * Draf dari AI (belum disimpan): bagian "semua" menyusun jaring mapel + konsep + peta mingguan;
     * "kalibrasi" hanya mengisi isi konkret tiap cabang mapel. Formulir yang belum disimpan ikut dikirim sebagai acuan.
     */
    public function susunAI(Request $request, string $id, PerangkatAjarAIService $ai)
    {
        $peta = PetaTema::with('kelas')->findOrFail($id);
        $this->cekPengubah($request, $peta);
        $request->validate([
            'ai_mode' => ['required', Rule::in(SoalAIService::MODES)],
            'bagian' => ['required', Rule::in(['semua', 'kalibrasi'])],
            'mapel' => 'nullable|array|max:' . PetaTema::MAKS_CABANG,
            'mapel.*' => 'exists:subjects,id_mapel',
            'jaring' => 'nullable|array',
            'judul' => 'nullable|string|max:200',
            'konteks_lokal' => 'nullable|string|max:2000',
            'catatan' => 'nullable|string|max:1500',
            'id_catatan_notebook' => 'nullable|integer',
        ]);
        $jaring = PetaTema::normalJaring($request->input('jaring', $peta->jaring));
        $idMapel = collect($request->input('mapel', []))->merge(collect($jaring['mapel'])->pluck('id_mapel'))->filter()->unique()->values();
        if ($idMapel->isEmpty()) return response()->json(['message' => 'Pilih minimal satu mata pelajaran untuk cabang spider web.'], 422);
        if ($request->bagian === 'kalibrasi' && !count($jaring['mapel'])) return response()->json(['message' => 'Tambahkan dulu cabang mata pelajaran, lalu kalibrasi.'], 422);

        $mapel = Subject::whereIn('id_mapel', $idMapel)->get(['id_mapel', 'nama_mapel']);
        $tpMapel = $this->tpPerMapel($idMapel->all(), $peta->id_kelas);
        $cp = CapaianPembelajaran::whereIn('id_mapel', $idMapel)->when($peta->fase, fn($q) => $q->where('fase', $peta->fase))->get(['id_mapel', 'elemen', 'teks'])->groupBy('id_mapel');
        $contoh = PetaTema::where('status', 'DISETUJUI')->where('id_peta', '!=', $peta->id_peta)->latest('disetujui_pada')->first();

        $konteks = array_filter([
            'tema' => $request->input('judul') ?: $peta->judul,
            'kategori' => $jaring['kategori'] ?: null,
            'kelas' => $peta->kelas?->nama_kelas, 'fase' => $peta->fase, 'jumlah_minggu' => $peta->jumlah_minggu,
            'pendekatan' => $peta->pendekatan,
            'konteks_lokal' => $request->input('konteks_lokal') ?: $peta->konteks_lokal,
            'catatan_guru' => $request->catatan,
            'catatan_revisi_kepala_sekolah' => $peta->catatan_revisi,
            'mapel' => $mapel->map(fn($m) => [
                'id_mapel' => $m->id_mapel, 'nama' => $m->nama_mapel,
                'cp' => ($cp[$m->id_mapel] ?? collect())->map(fn($c) => "{$c->elemen}: " . Str::limit($c->teks, 400))->values()->all(),
                'tp' => collect($tpMapel[$m->id_mapel] ?? [])->take(40)->map(fn($t) => ['id_indikator' => $t['id_indikator'], 'deskripsi' => $t['deskripsi']])->values()->all(),
            ])->values()->all(),
            'jaring_sekarang' => $request->bagian === 'kalibrasi' ? collect($jaring['mapel'])->map(fn($c) => ['id_mapel' => $c['id_mapel'], 'nama' => $c['nama'], 'kalibrasi' => $c['kalibrasi']])->all() : null,
            'contoh_peta_disetujui' => $contoh ? ['tema' => $contoh->judul, 'minggu_1' => $contoh->minggu[0] ?? null] : null,
            // Kategori pusat diambil dari High Level sekolah bila cocok
            'high_level_tersedia' => MasterKategoriPenilaian::whereNull('id_mapel')->orderBy('nama_kategori')->pluck('nama_kategori')->all(),
        ], fn($v) => $v !== null && $v !== '' && $v !== []);

        $dariNotebook = NotebookCatatan::pasang($ai, $request->id_catatan_notebook, $request->user());
        $mentah = $ai->susunPetaTema($konteks, $request->bagian, $request->ai_mode);
        if ($mentah === null) return response()->json(['message' => $ai->galat()], 422);

        // Cabang mapel dari AI: hanya mapel yang diminta, TP harus milik mapel itu; kalibrasi mempertahankan id cabang lama
        $nama = $mapel->pluck('nama_mapel', 'id_mapel');
        $lama = collect($jaring['mapel'])->keyBy('id_mapel');
        $cabang = collect($mentah['mapel'])->filter(fn($c) => is_array($c) && isset($nama[$c['id_mapel'] ?? '']))->unique('id_mapel')
            ->map(fn($c) => [
                'id' => $lama[$c['id_mapel']]['id'] ?? null,
                'id_mapel' => $c['id_mapel'], 'nama' => $lama[$c['id_mapel']]['nama'] ?? $nama[$c['id_mapel']],
                'kalibrasi' => $c['kalibrasi'] ?? '',
                'tp' => collect(is_array($c['tp'] ?? null) ? $c['tp'] : [])->filter(fn($t) => collect($tpMapel[$c['id_mapel']] ?? [])->contains('id_indikator', $t))->values()->all(),
            ]);
        if ($request->bagian === 'kalibrasi') {
            // Cabang lama yang tidak dijawab AI tetap ada
            $cabang = collect($jaring['mapel'])->map(fn($c) => $cabang->firstWhere('id_mapel', $c['id_mapel']) ?? $c)
                ->merge($cabang->whereNotIn('id_mapel', collect($jaring['mapel'])->pluck('id_mapel')));
            $hasil = ['jaring' => PetaTema::normalJaring(['kategori' => $jaring['kategori'], 'mapel' => $cabang->values()->all(), 'konsep' => $jaring['konsep']])];
        } else {
            $hasil = [
                'jaring' => PetaTema::normalJaring(['kategori' => $mentah['kategori'] ?? $jaring['kategori'], 'mapel' => $cabang->values()->all(), 'konsep' => $mentah['konsep'] ?? []]),
                'minggu' => PetaTema::normalMinggu($mentah['minggu'] ?? [], $peta->jumlah_minggu),
            ];
        }
        // Kategori usulan AI dicocokkan ke High Level yang ada (nama sama); bila belum ada, disarankan untuk dibuat
        $saran = trim((string) ($mentah['kategori'] ?? ''));
        $cocok = $saran !== '' ? MasterKategoriPenilaian::whereNull('id_mapel')->get(['id_kategori', 'nama_kategori'])
            ->first(fn($k) => mb_strtolower(trim($k->nama_kategori)) === mb_strtolower($saran)) : null;
        $hasil += ['id_kategori' => $cocok?->id_kategori, 'kategori_saran' => $cocok ? null : ($saran ?: null)];
        return response()->json(['success' => true, 'message' => ($request->bagian === 'kalibrasi'
            ? 'Kalibrasi tiap mata pelajaran siap. Periksa, ubah bila perlu, lalu Simpan.'
            : 'Draf peta tema siap. Periksa jaring, konsep, dan peta mingguan, ubah bila perlu, lalu Simpan.') . $dariNotebook] + $hasil);
    }

    /**
     * Pola mingguan dari Jadwal kelas: sesi KBM satu minggu (Senin-Sabtu) mulai tanggal_mulai peta atau minggu ini,
     * dikelompokkan per hari: "07:30 Bahasa Indonesia (Naton)".
     */
    public function polaJadwal(Request $request, string $id)
    {
        $peta = $this->terjangkau($request)->findOrFail($id);
        abort_unless($peta->id_kelas, 422, 'Pilih kelas peta tema ini dulu.');
        [$pola, $senin, $jumlah] = $this->polaMingguJadwal($peta, $request->input('tanggal'));
        return response()->json(['data' => $pola, 'minggu_mulai' => $senin->toDateString(), 'jumlah_sesi' => $jumlah]);
    }

    /** @return array{0: \Illuminate\Support\Collection, 1: Carbon, 2: int} pola per hari, Senin acuan, jumlah sesi */
    private function polaMingguJadwal(PetaTema $peta, ?string $tanggal): array
    {
        $zona = config('app.zona_sekolah');
        $acuan = $tanggal ? Carbon::parse($tanggal, $zona) : ($peta->tanggal_mulai ? Carbon::parse($peta->tanggal_mulai, $zona) : Carbon::now($zona));
        $senin = $acuan->copy()->startOfWeek(Carbon::MONDAY)->startOfDay();
        $sesi = TransJadwal::with(['mapel:id_mapel,nama_mapel,id_guru', 'mapel.guru:id_guru,nama_guru', 'guru:id_guru,nama_guru'])->where('id_kelas', $peta->id_kelas)
            ->where('status_sesi', '!=', 'Batal')->whereBetween('mulai', [$senin, $senin->copy()->addDays(6)])->orderBy('mulai')->get();
        $pola = collect(PetaTema::HARI)->mapWithKeys(function ($hari, $i) use ($sesi, $senin) {
            // Kolom mulai menyimpan jam dinding sekolah (lihat ProgramAjarService), jadi tidak dikonversi zona lagi
            $baris = $sesi->filter(fn($s) => $s->mulai->format('Y-m-d') === $senin->copy()->addDays($i)->format('Y-m-d'))
                ->map(fn($s) => $s->mulai->format('H:i') . ' ' . ($s->mapel?->nama_mapel ?? $s->judul ?? 'Kegiatan')
                    . ($s->guru?->nama_guru ? " ({$s->guru->nama_guru})" : ''));
            return [$hari => $baris->unique()->implode("\n")];
        });
        return [$pola, $senin, $sesi->count()];
    }

    /**
     * Rekomendasi pola mingguan (AI atau aturan lokal) untuk kelas yang jadwalnya belum disusun atau masih kosong sebagian.
     * Hari yang sudah punya sesi di Jadwal dipertahankan (bila "pertahankan_jadwal"), AI hanya mengisi hari yang kosong.
     * Pola kelas dari minggu-minggu lain (bila ada) dipakai sebagai acuan jam & mapel.
     */
    public function polaAI(Request $request, string $id, PerangkatAjarAIService $ai)
    {
        $peta = PetaTema::with('kelas')->findOrFail($id);
        $this->cekPengubah($request, $peta);
        $request->validate([
            'ai_mode' => ['required', Rule::in([...SoalAIService::MODES, PetaTema::MODE_LOKAL])],
            'jam_masuk' => ['nullable', 'date_format:H:i'],
            'jam_pulang' => ['nullable', 'date_format:H:i', 'after:jam_masuk'],
            'menit_jp' => 'nullable|integer|min:20|max:60',
            'sabtu' => 'boolean',
            'pertahankan_jadwal' => 'boolean',
            'catatan' => 'nullable|string|max:1500',
            'jaring' => 'nullable|array',
            'minggu' => 'nullable|array',
            'judul' => 'nullable|string|max:200',
        ]);
        $aturan = [
            'jam_masuk' => $request->input('jam_masuk', '07:30'), 'jam_pulang' => $request->input('jam_pulang', '12:30'),
            'menit_jp' => (int) $request->input('menit_jp', 35), 'sabtu' => $request->boolean('sabtu'),
        ];
        $jaring = PetaTema::normalJaring($request->input('jaring', $peta->jaring));
        $minggu = PetaTema::normalMinggu($request->input('minggu', $peta->minggu), $peta->jumlah_minggu);

        $tetap = collect(PetaTema::HARI)->mapWithKeys(fn($h) => [$h => '']);
        $jumlahJadwal = 0;
        if ($peta->id_kelas) {
            [$polaJadwal, , $jumlahJadwal] = $this->polaMingguJadwal($peta, null);
            if ($request->boolean('pertahankan_jadwal', true)) $tetap = $polaJadwal;
        }
        $hariKosong = collect(PetaTema::HARI)->filter(fn($h) => trim($tetap[$h]) === '' && ($h !== 'sabtu' || $aturan['sabtu']))->values()->all();
        if (!$hariKosong) return response()->json(['message' => 'Semua hari sudah terisi dari Jadwal. Matikan "Pertahankan hari dari Jadwal" bila ingin pola baru.'], 422);

        $konteks = array_filter([
            'tema' => $request->input('judul') ?: $peta->judul,
            'kategori' => $jaring['kategori'] ?: null,
            'kelas' => $peta->kelas?->nama_kelas, 'fase' => $peta->fase,
            'pendekatan' => $peta->pendekatan,
            'konteks_lokal' => $peta->konteks_lokal,
            'aturan_hari' => $aturan,
            'hari_diisi' => $hariKosong,
            'mapel' => collect($jaring['mapel'])->map(fn($c) => ['nama' => $c['nama'], 'kalibrasi' => $c['kalibrasi']])->values()->all(),
            'konsep' => collect($jaring['konsep'])->pluck('label')->filter()->values()->all(),
            'minggu_1' => $minggu[0] ?? null,
            'hari_tetap_dari_jadwal' => collect($tetap)->filter(fn($t) => trim($t) !== '')->all(),
            'pola_kelas_minggu_lain' => $peta->id_kelas ? $this->polaKelasBiasa($peta->id_kelas) : [],
            'catatan_guru' => $request->catatan,
        ], fn($v) => $v !== null && $v !== '' && $v !== []);
        if (empty($konteks['mapel'])) return response()->json(['message' => 'Tambahkan dulu cabang mata pelajaran di spider web, lalu minta rekomendasi pola.'], 422);

        $hasil = $request->ai_mode === PetaTema::MODE_LOKAL ? $this->polaLokal($konteks) : $ai->susunPolaMingguan($konteks, $request->ai_mode);
        if ($hasil === null) return response()->json(['message' => $ai->galat()], 422);

        $pola = collect(PetaTema::HARI)->mapWithKeys(function ($h) use ($tetap, $hasil, $hariKosong) {
            if (trim($tetap[$h]) !== '') return [$h => $tetap[$h]];
            if (!in_array($h, $hariKosong, true)) return [$h => ''];
            $isi = $hasil['pola'][$h] ?? '';
            return [$h => is_array($isi) ? implode("\n", array_filter(array_map(fn($x) => trim((string) $x), $isi))) : trim((string) $isi)];
        })->all();
        $diisi = count(array_filter($hariKosong, fn($h) => trim($pola[$h]) !== ''));
        return response()->json([
            'success' => true, 'data' => PetaTema::normalPola($pola), 'alasan' => mb_substr((string) ($hasil['alasan'] ?? ''), 0, 600),
            'hari_diisi' => $diisi, 'hari_dari_jadwal' => count(PetaTema::HARI) - count(array_filter($tetap->all(), fn($t) => trim($t) === '')),
            'jumlah_sesi_jadwal' => $jumlahJadwal, 'mode' => $request->ai_mode,
            'message' => "Rekomendasi pola untuk {$diisi} hari siap. Periksa, ubah bila perlu, lalu Simpan.",
        ]);
    }

    /** Pola jam & mapel yang paling sering dipakai kelas ini (8 minggu sebelum & sesudah hari ini), sebagai acuan AI. */
    private function polaKelasBiasa(string $idKelas): array
    {
        $kini = Carbon::now(config('app.zona_sekolah'));
        $sesi = TransJadwal::with('mapel:id_mapel,nama_mapel')->where('id_kelas', $idKelas)->where('status_sesi', '!=', 'Batal')
            ->whereBetween('mulai', [$kini->copy()->subWeeks(8), $kini->copy()->addWeeks(8)])->get(['id_mapel', 'judul', 'mulai'])->toBase();
        return $sesi->groupBy(fn($s) => PetaTema::HARI[$s->mulai->dayOfWeekIso - 1] ?? 'minggu')
            ->only(PetaTema::HARI)
            ->map(fn($g) => $g->countBy(fn($s) => $s->mulai->format('H:i') . ' ' . ($s->mapel?->nama_mapel ?? $s->judul ?? 'Kegiatan'))
                ->sortDesc()->take(8)->keys()->sort()->values()->all())
            ->all();
    }

    /**
     * Pola lokal tanpa AI: tiap hari dibuka dengan Realita (cerita pengalaman), blok mapel bergiliran sesuai kalibrasi,
     * Jumat ditutup dengan Makna & berbagi Produk anak.
     */
    private function polaLokal(array $k): array
    {
        $mapel = $k['mapel'];
        $a = $k['aturan_hari'];
        $mulai = Carbon::createFromFormat('H:i', $a['jam_masuk']);
        $pulang = Carbon::createFromFormat('H:i', $a['jam_pulang']);
        $jp = max(20, $a['menit_jp']);
        $blokMapel = 2 * $jp;
        $pola = [];
        $giliran = 0;
        $tema = $k['tema'] ?? 'tema';
        foreach ($k['hari_diisi'] as $h) {
            $jam = $mulai->copy();
            $baris = [$jam->format('H:i') . " Pembukaan & Realita: anak bercerita pengalaman tentang {$tema}"];
            $jam->addMinutes($jp);
            $istirahat = false;
            while ($jam->copy()->addMinutes($blokMapel)->lte($pulang)) {
                if (!$istirahat && $jam->format('H:i') >= '09:30') {
                    $baris[] = $jam->format('H:i') . ' Istirahat';
                    $jam->addMinutes(30);
                    $istirahat = true;
                    continue;
                }
                $m = $mapel[$giliran % count($mapel)];
                $giliran++;
                $baris[] = $jam->format('H:i') . " {$m['nama']}" . ($m['kalibrasi'] ? ': ' . mb_substr($m['kalibrasi'], 0, 90) : '');
                $jam->addMinutes($blokMapel);
            }
            if ($h === 'jumat') $baris[] = $jam->copy()->min($pulang->copy()->subMinutes($jp))->format('H:i') . ' Makna & berbagi Produk anak (tanpa peringkat)';
            $pola[$h] = $baris;
        }
        return ['pola' => $pola, 'alasan' => 'Disusun dari aturan sederhana: setiap hari dibuka dengan Realita, mapel cabang spider web bergiliran per blok 2 JP, Jumat ditutup dengan Makna & berbagi produk.'];
    }

    /**
     * Draf pola terstruktur (belum disimpan): dari JP per minggu tiap cabang, atau dari teks pola mingguan
     * (hasil Rekomendasi AI). Formulir yang belum disimpan ikut dikirim.
     */
    public function slot(Request $request, string $id)
    {
        $peta = PetaTema::findOrFail($id);
        $this->cekPengubah($request, $peta);
        $request->validate([
            'sumber' => ['required', Rule::in(['jp', 'teks'])],
            'jaring' => 'nullable|array', 'pola' => 'nullable|array',
            'jam_masuk' => ['nullable', 'date_format:H:i'], 'jam_pulang' => ['nullable', 'date_format:H:i', 'after:jam_masuk'],
            'menit_jp' => 'nullable|integer|min:20|max:60', 'sabtu' => 'boolean',
        ]);
        $jaring = PetaTema::normalJaring($request->input('jaring', $peta->jaring));
        $aturan = ['jam_masuk' => $request->input('jam_masuk', '07:30'), 'jam_pulang' => $request->input('jam_pulang', '12:30'),
            'menit_jp' => (int) $request->input('menit_jp', 35), 'sabtu' => $request->boolean('sabtu')];
        if ($request->sumber === 'jp') {
            if (!collect($jaring['mapel'])->contains(fn($c) => $c['id_mapel'] && $c['jp_minggu'] > 0)) {
                return response()->json(['message' => 'Isi dulu JP per minggu pada cabang mata pelajaran.'], 422);
            }
            ['pola' => $pola, 'tidak_muat' => $tidakMuat] = $this->jadwal->susunDariJp($jaring, $aturan);
        } else {
            $pola = $this->jadwal->slotDariTeks(PetaTema::normalPola($request->input('pola', $peta->pola)), $jaring, $aturan);
            $tidakMuat = [];
            if (!collect($pola['slot'])->contains(fn($x) => $x['id_mapel'])) {
                return response()->json(['message' => 'Tidak ada baris "jam + nama mapel" di pola mingguan yang cocok dengan cabang spider web. Minta Rekomendasi AI dulu atau susun dari JP.'], 422);
            }
        }
        $jp = $this->jadwal->jpPola($pola);
        return response()->json(['success' => true, 'data' => $pola, 'jp_pola' => $jp, 'tidak_muat' => $tidakMuat,
            'message' => count($pola['slot']) . ' slot disusun' . ($tidakMuat ? '; ' . count($tidakMuat) . ' blok tidak muat sebelum jam pulang' : '') . '. Periksa, lalu Simpan.']);
    }

    /** Tetapkan peta tema (kepala sekolah; admin atas nama kepala sekolah). */
    public function tetapkan(Request $request, string $id)
    {
        $peta = PetaTema::findOrFail($id);
        $this->cekPengubah($request, $peta);
        abort_if($peta->status === 'DISETUJUI', 422, 'Peta tema ini sudah ditetapkan.');
        abort_if(count($peta->jaring['mapel'] ?? []) < 2, 422, 'Lengkapi minimal dua cabang mata pelajaran sebelum menetapkan.');
        abort_if(collect($peta->minggu ?? [])->every(fn($m) => !trim(($m['realita'] ?? '') . ($m['imajinasi'] ?? ''))), 422, 'Isi peta mingguan (realita & imajinasi) sebelum menetapkan.');
        $peta->update(['status' => 'DISETUJUI', 'catatan_revisi' => null, 'disetujui_oleh' => PetaTemaJadwalService::akunKepsek($request->user())->id,
            'disetujui_pada' => now(), 'diinput_oleh' => $request->user()->id]);
        return response()->json(['success' => true, 'message' => 'Peta tema ditetapkan. Guru dan wali kelas kini dapat melihatnya; lanjutkan dengan Buat Jadwal.']);
    }

    public function jadwalPratinjau(Request $request, string $id)
    {
        $peta = $this->petaUntukJadwal($request, $id);
        return response()->json($this->jadwal->pratinjau($peta));
    }

    /** Buat sesi Jadwal dari pola mingguan (sesi bentrok/sudah ada dilewati). Bisa diulang untuk melengkapi. */
    public function buatJadwal(Request $request, string $id)
    {
        $peta = $this->petaUntukJadwal($request, $id);
        $hasil = $this->jadwal->buat($peta);
        return response()->json(['success' => true] + $hasil + [
            'message' => "{$hasil['dibuat']} sesi dibuat di Jadwal" . ($hasil['bentrok'] ? ", {$hasil['bentrok']} dilewati karena bentrok" : '') . ($hasil['sudah_ada'] ? ", {$hasil['sudah_ada']} sudah ada" : '') . '.',
            'data' => $this->muat($peta->fresh(self::RELASI)),
        ], 201);
    }

    public function cek(Request $request, string $id)
    {
        return response()->json($this->jadwal->cek($this->terjangkau($request)->findOrFail($id)));
    }

    /** Buka kunci perubahan pola (kepala sekolah/admin): hitungan perubahan kembali 0, tercatat di riwayat. */
    public function bukaKunci(Request $request, string $id)
    {
        $peta = PetaTema::findOrFail($id);
        $this->cekPengubah($request, $peta);
        $request->validate(['alasan' => 'required|string|max:300']);
        $peta->catatPerubahan($request->user(), 'KUNCI', 'Kunci dibuka: ' . $request->alasan, false);
        $peta->jumlah_perubahan = 0;
        $peta->save();
        return response()->json(['success' => true, 'message' => 'Kunci dibuka; pola boleh diubah lagi ' . PetaTema::BATAS_PERUBAHAN . ' kali.', 'data' => $this->muat($peta->fresh(self::RELASI))]);
    }

    private function petaUntukJadwal(Request $request, string $id): PetaTema
    {
        $peta = PetaTema::findOrFail($id);
        $this->cekPengubah($request, $peta);
        abort_unless($peta->status === 'DISETUJUI', 422, 'Tetapkan peta tema dulu sebelum membuat jadwal.');
        abort_unless($peta->id_kelas, 422, 'Pilih kelas peta tema ini dulu.');
        abort_unless($peta->tanggal_mulai, 422, 'Isi tanggal mulai tema dulu.');
        abort_unless(collect(PetaTema::normalSlot($peta->pola_slot)['slot'])->contains(fn($x) => $x['id_mapel']), 422, 'Susun dan simpan dulu slot pola mingguan (jam & mapel).');
        return $peta;
    }

    private function pesanSinkron(array $h): string
    {
        $bagian = array_filter([$h['diperbarui'] ? "{$h['diperbarui']} sesi digeser" : null, $h['dibuat'] ? "{$h['dibuat']} sesi baru" : null,
            $h['dihapus'] ? "{$h['dihapus']} sesi dihapus" : null, $h['bentrok'] ? "{$h['bentrok']} bentrok dilewati" : null]);
        return 'Jadwal disesuaikan' . ($bagian ? ': ' . implode(', ', $bagian) : ' (tidak ada sesi yang berubah)') . '.';
    }

    public function ajukan(Request $request, string $id)
    {
        $peta = PetaTema::findOrFail($id);
        $this->cekPengubah($request, $peta);
        abort_unless(in_array($peta->status, ['DRAF', 'REVISI'], true), 422, 'Peta tema ini sudah diajukan atau disetujui.');
        abort_if(count($peta->jaring['mapel'] ?? []) < 2, 422, 'Lengkapi minimal dua cabang mata pelajaran sebelum mengajukan.');
        abort_if(collect($peta->minggu ?? [])->every(fn($m) => !trim(($m['realita'] ?? '') . ($m['imajinasi'] ?? ''))), 422, 'Isi peta mingguan (realita & imajinasi) sebelum mengajukan.');
        $peta->update(['status' => 'DIAJUKAN']);
        return response()->json(['success' => true, 'message' => 'Peta tema diajukan ke kepala sekolah.']);
    }

    public function tarik(Request $request, string $id)
    {
        $peta = PetaTema::findOrFail($id);
        $this->cekPengubah($request, $peta);
        abort_unless($peta->status === 'DIAJUKAN', 422, 'Hanya peta tema yang sedang diajukan yang bisa ditarik.');
        $peta->update(['status' => 'DRAF']);
        return response()->json(['success' => true, 'message' => 'Peta tema ditarik menjadi draf.']);
    }

    public function setujui(Request $request, string $id)
    {
        $this->cekKepsek($request);
        $peta = PetaTema::findOrFail($id);
        abort_unless($peta->status === 'DIAJUKAN', 422, 'Peta tema ini tidak sedang diajukan.');
        $peta->update(['status' => 'DISETUJUI', 'catatan_revisi' => null, 'disetujui_oleh' => $request->user()->id, 'disetujui_pada' => now()]);
        return response()->json(['success' => true, 'message' => 'Peta tema disetujui.']);
    }

    public function revisi(Request $request, string $id)
    {
        $this->cekKepsek($request);
        $request->validate(['catatan' => 'required|string|max:2000']);
        $peta = PetaTema::findOrFail($id);
        abort_unless($peta->status === 'DIAJUKAN', 422, 'Peta tema ini tidak sedang diajukan.');
        $peta->update(['status' => 'REVISI', 'catatan_revisi' => $request->catatan]);
        return response()->json(['success' => true, 'message' => 'Peta tema dikembalikan ke guru dengan catatan.']);
    }

    // ===== bantu =====

    /** TP aktif per mapel (untuk kelas itu atau materi umum). */
    private function tpPerMapel(array $idMapel, ?string $idKelas): array
    {
        return MasterIndikator::query()->where('aktif', true)
            ->join('master_materi as m', 'm.id_materi', '=', 'master_indikator.id_materi')
            ->whereIn('m.id_mapel', $idMapel)
            ->when($idKelas, fn($q) => $q->where(fn($w) => $w->where('m.id_kelas', $idKelas)->orWhereNull('m.id_kelas')))
            ->orderBy('master_indikator.urutan')
            ->get(['master_indikator.id_indikator', 'master_indikator.deskripsi', 'm.id_mapel'])
            ->groupBy('id_mapel')->map(fn($g) => $g->map(fn($t) => ['id_indikator' => $t->id_indikator, 'deskripsi' => $t->deskripsi])->all())->all();
    }

    /** Cabang mapel harus memakai mapel yang ada; TP yang bukan milik mapel cabang dibuang. */
    private function jaringSah(array $jaring): array
    {
        $mapel = Subject::whereIn('id_mapel', collect($jaring['mapel'])->pluck('id_mapel')->filter())->pluck('nama_mapel', 'id_mapel');
        $tpSah = MasterIndikator::join('master_materi as m', 'm.id_materi', '=', 'master_indikator.id_materi')
            ->whereIn('master_indikator.id_indikator', collect($jaring['mapel'])->pluck('tp')->flatten()->unique())
            ->pluck('m.id_mapel', 'master_indikator.id_indikator');
        $jaring['mapel'] = collect($jaring['mapel'])->map(function ($c) use ($mapel, $tpSah) {
            if ($c['id_mapel'] && !isset($mapel[$c['id_mapel']])) $c['id_mapel'] = null;
            $c['tp'] = array_values(array_filter($c['tp'], fn($t) => $c['id_mapel'] && ($tpSah[$t] ?? null) === $c['id_mapel']));
            return $c;
        })->all();
        return $jaring;
    }

    private function muat(PetaTema $peta): array
    {
        $idTp = collect($peta->jaring['mapel'] ?? [])->pluck('tp')->flatten()->unique()->values();
        $tp = MasterIndikator::whereIn('id_indikator', $idTp)->pluck('deskripsi', 'id_indikator');
        return $peta->toArray() + [
            'jaring' => PetaTema::normalJaring($peta->jaring),
            'minggu' => PetaTema::normalMinggu($peta->minggu, $peta->jumlah_minggu),
            'pola' => PetaTema::normalPola($peta->pola),
            'pola_slot' => PetaTema::normalSlot($peta->pola_slot),
            'jp_pola' => $this->jadwal->jpPola(PetaTema::normalSlot($peta->pola_slot)),
            'terkunci' => $peta->terkunci(), 'batas_perubahan' => PetaTema::BATAS_PERUBAHAN,
            'jumlah_sesi_jadwal' => $peta->jadwal_dibuat_pada ? TransJadwal::where('id_peta', $peta->id_peta)->where('status_sesi', '!=', 'Batal')->count() : 0,
            'tp_detail' => $tp,
        ];
    }

    private function terjangkau(Request $request): Builder
    {
        $user = $request->user();
        return PetaTema::query()->when(!$user->isPengelola(), fn($q) => $q->where(fn($w) => $w->where('dibuat_oleh', $user->id)->orWhere('status', 'DISETUJUI')));
    }

    private function bolehMenyusun(Request $request): bool
    {
        return $request->user()->isAdmin() || $request->user()->isKepsek();
    }

    private function cekPengubah(Request $request, PetaTema $peta): void
    {
        abort_unless($this->bolehMenyusun($request), 403, 'Peta tema disusun dan ditetapkan kepala sekolah; guru dan wali kelas hanya melihat.');
    }

    private function cekKepsek(Request $request): void
    {
        abort_unless($request->user()->isKepsek(), 403, 'Persetujuan peta tema hanya oleh kepala sekolah.');
    }
}

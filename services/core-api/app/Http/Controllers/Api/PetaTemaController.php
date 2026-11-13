<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\CapaianPembelajaran;
use App\Models\Classes;
use App\Models\MasterIndikator;
use App\Models\MasterPeriode;
use App\Models\PetaTema;
use App\Models\Subject;
use App\Models\TransJadwal;
use App\Services\PerangkatAjarAIService;
use App\Services\SoalAIService;
use Carbon\Carbon;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

/**
 * Peta Tema / spider web kurikulum PBPM (Perangkat Ajar). Tema lintas mapel, jadi semua guru boleh memakai semua mapel;
 * guru melihat peta miliknya dan peta yang sudah disetujui; kepala sekolah menyetujui seperti ATP & modul ajar.
 */
class PetaTemaController extends Controller
{
    private const RELASI = ['kelas:id_kelas,nama_kelas', 'periode:id_periode,tahun_ajaran,semester', 'pembuat:id,name', 'penyetuju:id,name'];

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
        ]);
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
        abort_if(!$peta && $request->user()->isKepsek(), 403, 'Kepala sekolah memeriksa dan menyetujui peta tema; penyusunan oleh guru.');
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
        $header = collect($data)->except(['jaring', 'minggu', 'pola', 'jumlah_minggu'])->all();

        if (!$peta) {
            // array_merge: nilai bawaan di bawah menimpa null dari formulir
            $peta = PetaTema::create(array_merge($header, $isi, [
                'id_peta' => 'PTM-' . Str::upper(Str::random(10)),
                'id_periode' => ($header['id_periode'] ?? null) ?: MasterPeriode::where('status_aktif', 'AKTIF')->value('id_periode'),
                'pendekatan' => ($header['pendekatan'] ?? null) ?: PetaTema::PENDEKATAN_BAWAAN,
                'status' => 'DRAF', 'dibuat_oleh' => $request->user()->id,
                'sumber' => $request->input('sumber') === 'AI' ? 'AI' : 'MANUAL', 'ai_mode' => $request->input('sumber') === 'AI' ? $request->input('ai_mode') : null,
            ]));
        } else {
            if (in_array($peta->status, ['DISETUJUI', 'DIAJUKAN'], true)) $header += ['status' => 'DRAF', 'versi' => $peta->versi + 1, 'disetujui_oleh' => null, 'disetujui_pada' => null];
            if ($request->input('sumber') === 'AI') $header += ['sumber' => 'AI', 'ai_mode' => $request->input('ai_mode')];
            $peta->update($header + $isi);
        }
        return response()->json(['success' => true, 'message' => 'Peta tema disimpan.', 'data' => $this->muat($peta->fresh(self::RELASI))], $id ? 200 : 201);
    }

    public function destroy(Request $request, string $id)
    {
        $peta = PetaTema::findOrFail($id);
        $this->cekPengubah($request, $peta);
        $peta->delete();
        return response()->json(['success' => true, 'message' => 'Peta tema dihapus.']);
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
        ], fn($v) => $v !== null && $v !== '' && $v !== []);

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
        return response()->json(['success' => true, 'message' => $request->bagian === 'kalibrasi'
            ? 'Kalibrasi tiap mata pelajaran siap. Periksa, ubah bila perlu, lalu Simpan.'
            : 'Draf peta tema siap. Periksa jaring, konsep, dan peta mingguan, ubah bila perlu, lalu Simpan.'] + $hasil);
    }

    /**
     * Pola mingguan dari Jadwal kelas: sesi KBM satu minggu (Senin-Sabtu) mulai tanggal_mulai peta atau minggu ini,
     * dikelompokkan per hari: "07:30 Bahasa Indonesia (Naton)".
     */
    public function polaJadwal(Request $request, string $id)
    {
        $peta = $this->terjangkau($request)->findOrFail($id);
        abort_unless($peta->id_kelas, 422, 'Pilih kelas peta tema ini dulu.');
        $zona = config('app.zona_sekolah');
        $acuan = $request->filled('tanggal') ? Carbon::parse($request->tanggal, $zona) : ($peta->tanggal_mulai ? Carbon::parse($peta->tanggal_mulai, $zona) : Carbon::now($zona));
        $senin = $acuan->copy()->startOfWeek(Carbon::MONDAY)->startOfDay();
        $sesi = TransJadwal::with(['mapel:id_mapel,nama_mapel', 'guru:id_guru,nama_guru'])->where('id_kelas', $peta->id_kelas)
            ->where('status_sesi', '!=', 'Batal')->whereBetween('mulai', [$senin, $senin->copy()->addDays(6)])->orderBy('mulai')->get();
        $pola = collect(PetaTema::HARI)->mapWithKeys(function ($hari, $i) use ($sesi, $senin) {
            // Kolom mulai menyimpan jam dinding sekolah (lihat ProgramAjarService), jadi tidak dikonversi zona lagi
            $baris = $sesi->filter(fn($s) => $s->mulai->format('Y-m-d') === $senin->copy()->addDays($i)->format('Y-m-d'))
                ->map(fn($s) => $s->mulai->format('H:i') . ' ' . ($s->mapel?->nama_mapel ?? $s->judul ?? 'Kegiatan')
                    . ($s->guru?->nama_guru ? " ({$s->guru->nama_guru})" : ''));
            return [$hari => $baris->unique()->implode("\n")];
        });
        return response()->json(['data' => $pola, 'minggu_mulai' => $senin->toDateString(), 'jumlah_sesi' => $sesi->count()]);
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
            'tp_detail' => $tp,
        ];
    }

    private function terjangkau(Request $request): Builder
    {
        $user = $request->user();
        return PetaTema::query()->when(!$user->isPengelola(), fn($q) => $q->where(fn($w) => $w->where('dibuat_oleh', $user->id)->orWhere('status', 'DISETUJUI')));
    }

    private function cekPengubah(Request $request, PetaTema $peta): void
    {
        $user = $request->user();
        abort_unless($user->isAdmin() || $peta->dibuat_oleh === $user->id, 403, 'Peta tema ini milik guru lain.');
    }

    private function cekKepsek(Request $request): void
    {
        abort_unless($request->user()->isKepsek(), 403, 'Persetujuan peta tema hanya oleh kepala sekolah.');
    }
}

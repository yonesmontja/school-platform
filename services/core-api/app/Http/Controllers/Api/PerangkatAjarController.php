<?php

namespace App\Http\Controllers\Api;

use App\Models\NotebookCatatan;
use App\Http\Controllers\Controller;
use App\Models\Atp;
use App\Models\AtpBaris;
use App\Models\CapaianPembelajaran;
use App\Models\Classes;
use App\Models\DokumenRujukan;
use App\Models\MasterIndikator;
use App\Models\MasterMateri;
use App\Models\MasterPeriode;
use App\Models\Subject;
use App\Services\CpDariDokumen;
use App\Services\PerangkatAjarAIService;
use App\Services\PustakaDokumenService;
use App\Services\SoalAIService;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

/**
 * Perangkat ajar (Fase 17 Tahap A): CP per mapel/fase/elemen dan ATP per mapel/kelas/periode.
 * Guru mengelola mapel yang diampunya; ATP dipakai setelah disetujui kepala sekolah. Saat disetujui,
 * TP dan materi usulan dibuat di master materi/TP sehingga langsung bisa dipakai Input Nilai & Bank Soal.
 */
class PerangkatAjarController extends Controller
{
    private const RELASI_ATP = ['mapel:id_mapel,nama_mapel,id_guru', 'mapel.guru:id_guru,nama_guru', 'kelas:id_kelas,nama_kelas', 'periode:id_periode,tahun_ajaran,semester', 'pembuat:id,name,id_guru', 'penyetuju:id,name'];

    /** Pilihan formulir: mapel (guru: yang diampu), kelas, periode, materi + TP, profil lulusan, penyedia AI. */
    public function referensi(Request $request)
    {
        $user = $request->user();
        $mapel = Subject::when(!$user->isPengelola(), fn($q) => $q->whereIn('id_mapel', $user->mapelDiampu()))
            ->orderBy('nama_mapel')->get(['id_mapel', 'nama_mapel']);
        return response()->json([
            'mapel' => $mapel,
            'kelas' => Classes::untukPengguna($request->user())->orderBy('nama_kelas')->get(['id_kelas', 'nama_kelas'])->map(fn($k) => $k->toArray() + ['fase' => CapaianPembelajaran::faseKelas($k->nama_kelas)]),
            'periode' => MasterPeriode::orderByDesc('tahun_ajaran')->orderByDesc('semester')->get(['id_periode', 'tahun_ajaran', 'semester', 'status_aktif']),
            'materi' => MasterMateri::with(['indikator' => fn($q) => $q->where('aktif', true)->orderBy('urutan')->select('id_indikator', 'id_materi', 'deskripsi', 'urutan')])
                ->whereIn('id_mapel', $mapel->pluck('id_mapel'))->orderBy('nama_materi')
                ->get(['id_materi', 'id_mapel', 'id_kelas', 'id_periode', 'nama_materi']),
            'profil_lulusan' => Atp::PROFIL_LULUSAN,
            'ai_modes' => SoalAIService::MODES,
            'sekolah' => \App\Models\SchoolSetting::first()?->only(['nama_sekolah', 'kota', 'nama_kepsek', 'nip_kepsek']),
        ]);
    }

    // ===== CP =====

    public function daftarCp(Request $request)
    {
        $request->validate(['id_mapel' => 'nullable|string', 'fase' => ['nullable', Rule::in(CapaianPembelajaran::FASE)]]);
        $user = $request->user();
        $data = CapaianPembelajaran::with('mapel:id_mapel,nama_mapel,id_guru', 'mapel.guru:id_guru,nama_guru')
            ->when(!$user->isPengelola(), fn($q) => $q->whereIn('id_mapel', $user->mapelDiampu()))
            ->when($request->id_mapel, fn($q) => $q->where('id_mapel', $request->id_mapel))
            ->when($request->fase, fn($q) => $q->where('fase', $request->fase))
            ->orderBy('id_mapel')->orderBy('fase')->orderBy('urutan')->orderBy('elemen')->get();
        return response()->json(['data' => $data]);
    }

    public function simpanCp(Request $request, ?string $id = null)
    {
        $cp = $id ? CapaianPembelajaran::findOrFail($id) : null;
        $data = $request->validate([
            'id_mapel' => [$cp ? 'sometimes' : 'required', 'exists:subjects,id_mapel'],
            'fase' => [$cp ? 'sometimes' : 'required', Rule::in(CapaianPembelajaran::FASE)],
            'elemen' => [$cp ? 'sometimes' : 'required', 'string', 'max:200'],
            'teks' => [$cp ? 'sometimes' : 'required', 'string', 'max:10000'],
            'urutan' => 'nullable|integer|min:0|max:999',
            'sumber' => ['nullable', Rule::in(CapaianPembelajaran::SUMBER)],
        ]);
        $this->cekMapel($request, $data['id_mapel'] ?? $cp->id_mapel);
        $kunci = ['id_mapel' => $data['id_mapel'] ?? $cp->id_mapel, 'fase' => $data['fase'] ?? $cp->fase, 'elemen' => trim($data['elemen'] ?? $cp->elemen)];
        $kembar = CapaianPembelajaran::where($kunci)->when($cp, fn($q) => $q->where('id_cp', '!=', $cp->id_cp))->exists();
        abort_if($kembar, 422, "Elemen \"{$kunci['elemen']}\" fase {$kunci['fase']} sudah ada untuk mapel ini.");

        $cp ??= new CapaianPembelajaran(['id_cp' => 'CP-' . Str::upper(Str::random(10)), 'dibuat_oleh' => $request->user()->id]);
        $cp->fill($kunci + ['teks' => trim($data['teks'] ?? $cp->teks), 'urutan' => $data['urutan'] ?? $cp->urutan ?? 0, 'sumber' => $data['sumber'] ?? $cp->sumber ?? 'RESMI'])->save();
        return response()->json(['success' => true, 'message' => 'CP disimpan.', 'data' => $cp], $id ? 200 : 201);
    }

    public function hapusCp(Request $request, string $id)
    {
        $cp = CapaianPembelajaran::findOrFail($id);
        $this->cekMapel($request, $cp->id_mapel);
        $cp->delete();
        return response()->json(['success' => true, 'message' => 'CP dihapus.']);
    }

    /** AI memecah teks CP tempelan menjadi elemen (pratinjau, belum disimpan). */
    public function pecahCp(Request $request, PerangkatAjarAIService $ai)
    {
        $request->validate([
            'id_mapel' => 'required|exists:subjects,id_mapel',
            'fase' => ['nullable', Rule::in(CapaianPembelajaran::FASE)],
            'teks' => 'required|string|min:30|max:60000',
            'ai_mode' => ['required', Rule::in(SoalAIService::MODES)],
        ]);
        $this->cekMapel($request, $request->id_mapel);
        $hasil = $ai->pecahCp($request->teks, Subject::find($request->id_mapel)->nama_mapel, $request->fase, $request->ai_mode);
        if ($hasil === null) return response()->json(['message' => $ai->galat()], 422);
        $data = $this->rapikanCpAi($hasil['cp'], $request->fase, 'RESMI');
        return response()->json(['success' => true, 'message' => "{$data->count()} elemen CP terbaca. Periksa sebelum menyimpan.", 'data' => $data,
            'catatan' => $data->isEmpty() ? ($hasil['catatan'] ?? 'Teks yang ditempel tidak memuat rumusan CP per elemen.') : null]);
    }

    /** Dokumen Pustaka yang boleh dilihat akun ini (aturan sama dengan Pustaka Dokumen) dan teksnya sudah terbaca. */
    private function dokumenPustaka(Request $request, string $id): DokumenRujukan
    {
        $u = $request->user();
        $d = DokumenRujukan::query()
            ->when(!$u->isPengelola(), fn($q) => $q->where(fn($w) => $w->where('status', 'AKTIF')->orWhere('diunggah_oleh', $u->id)))
            ->findOrFail($id);
        abort_unless($d->status_teks === 'TERBACA', 422, 'Teks dokumen ini belum terbaca.');
        return $d;
    }

    /** Daftar bagian CP per mapel di satu dokumen Pustaka, dengan saran bagian untuk mapel ini. */
    public function bagianCpDokumen(Request $request, string $id)
    {
        $request->validate(['id_mapel' => 'required|exists:subjects,id_mapel']);
        $this->cekMapel($request, $request->id_mapel);
        $d = $this->dokumenPustaka($request, $id);
        $bagian = CpDariDokumen::daftarBagian($d);
        $saran = CpDariDokumen::cocokkan($bagian, Subject::find($request->id_mapel)->nama_mapel);
        return response()->json(['data' => [
            'bagian' => $bagian,
            'saran' => $saran !== null ? $bagian[$saran]['dari'] : null,
            'terpotong' => (int) $d->jumlah_karakter >= PustakaDokumenService::MAKS_TEKS,
        ]]);
    }

    /** AI mengambil CP mapel ini (jenjang SD) dari bagian dokumen Pustaka (pratinjau, belum disimpan). */
    public function cpDariDokumen(Request $request, PerangkatAjarAIService $ai)
    {
        $request->validate([
            'id_mapel' => 'required|exists:subjects,id_mapel',
            'id_dokumen' => 'required|string',
            'dari' => 'nullable|integer|min:0',
            'fase' => ['nullable', Rule::in(CapaianPembelajaran::FASE)],
            'ai_mode' => ['required', Rule::in(SoalAIService::MODES)],
        ]);
        $this->cekMapel($request, $request->id_mapel);
        $d = $this->dokumenPustaka($request, $request->id_dokumen);
        $namaMapel = Subject::find($request->id_mapel)->nama_mapel;
        $bagian = CpDariDokumen::teksBagian($d, $request->filled('dari') ? (int) $request->dari : null, $namaMapel);
        if (!$bagian) {
            return response()->json(['message' => "Bagian CP {$namaMapel} tidak ditemukan di dokumen ini. Pilih bagiannya secara manual"
                . ((int) $d->jumlah_karakter >= PustakaDokumenService::MAKS_TEKS ? ', atau unggah lampiran CP mapel ini sebagai dokumen tersendiri karena teks dokumen ini terpotong.' : '.')], 422);
        }
        @set_time_limit(180);
        $hasil = $ai->cpDariDokumen($bagian['teks'], $namaMapel, $bagian['judul'], $request->fase, $request->ai_mode);
        if ($hasil === null) return response()->json(['message' => $ai->galat()], 422);
        $data = $this->rapikanCpAi($hasil['cp'], $request->fase, 'RESMI');
        $sumber = ['id_dokumen' => $d->id_dokumen, 'judul' => $d->judul, 'bagian' => $bagian['judul'], 'dari' => $bagian['dari'] + 1, 'sampai' => $bagian['sampai'] + 1, 'terpotong' => $bagian['terpotong']];
        return response()->json(['success' => true, 'message' => "{$data->count()} elemen CP diambil dari {$d->judul}. Periksa sebelum menyimpan.", 'data' => $data, 'sumber' => $sumber,
            'catatan' => $data->isEmpty() ? ($hasil['catatan'] ?? 'Bagian dokumen ini tidak memuat CP SD untuk mapel ini.') : null]);
    }

    /** AI menyusun draf CP sekolah untuk mapel/fase yang belum punya CP nasional (pratinjau, belum disimpan). */
    public function susunCp(Request $request, PerangkatAjarAIService $ai)
    {
        $request->validate([
            'id_mapel' => 'required|exists:subjects,id_mapel',
            'fase' => ['required', Rule::in(CapaianPembelajaran::FASE)],
            'catatan' => 'nullable|string|max:8000',
            'ai_mode' => ['required', Rule::in(SoalAIService::MODES)],
        ]);
        $this->cekMapel($request, $request->id_mapel);
        $rujukan = CapaianPembelajaran::where('id_mapel', $request->id_mapel)->where('fase', '!=', $request->fase)->where('sumber', 'RESMI')
            ->orderBy('fase')->orderBy('urutan')->get(['fase', 'elemen', 'teks'])->toArray();
        $namaMapel = Subject::find($request->id_mapel)->nama_mapel;
        $sumber = app(PustakaDokumenService::class)->pasang($ai, "capaian pembelajaran {$namaMapel} fase {$request->fase} elemen {$request->catatan}", $request->id_mapel, $request->fase);
        $hasil = $ai->susunCp($namaMapel, $request->fase, $rujukan, $request->catatan, $request->ai_mode);
        if ($hasil === null) return response()->json(['message' => $ai->galat()], 422);
        $data = $this->rapikanCpAi($hasil, $request->fase, 'SEKOLAH')->map(fn($c) => ['fase' => $request->fase] + $c)->values();
        return response()->json(['success' => true, 'message' => "Draf {$data->count()} elemen CP sekolah tersusun. Periksa dan sesuaikan sebelum menyimpan."
            . PustakaDokumenService::catatanSumber($sumber), 'data' => $data, 'rujukan' => $sumber]);
    }

    private function rapikanCpAi(array $cp, ?string $fase, string $sumber)
    {
        return collect($cp)->map(fn($c) => [
            'fase' => in_array(strtoupper((string) ($c['fase'] ?? '')), CapaianPembelajaran::FASE, true) ? strtoupper($c['fase']) : ($fase ?? 'A'),
            'elemen' => mb_substr(trim((string) $c['elemen']), 0, 200),
            'teks' => mb_substr(trim((string) $c['teks']), 0, 10000),
            'sumber' => $sumber,
        ])->values();
    }

    /** Simpan banyak elemen CP sekaligus; elemen dengan fase & nama sama diperbarui teksnya. */
    public function simpanBanyakCp(Request $request)
    {
        $request->validate([
            'id_mapel' => 'required|exists:subjects,id_mapel',
            'cp' => 'required|array|min:1|max:60',
            'cp.*.fase' => ['required', Rule::in(CapaianPembelajaran::FASE)],
            'cp.*.elemen' => 'required|string|max:200',
            'cp.*.teks' => 'required|string|max:10000',
            'cp.*.sumber' => ['nullable', Rule::in(CapaianPembelajaran::SUMBER)],
        ]);
        $this->cekMapel($request, $request->id_mapel);
        $jumlah = DB::transaction(function () use ($request) {
            foreach ($request->cp as $i => $c) {
                $cp = CapaianPembelajaran::firstOrNew(['id_mapel' => $request->id_mapel, 'fase' => $c['fase'], 'elemen' => trim($c['elemen'])]);
                if (!$cp->exists) $cp->fill(['id_cp' => 'CP-' . Str::upper(Str::random(10)), 'dibuat_oleh' => $request->user()->id]);
                $cp->fill(['teks' => trim($c['teks']), 'urutan' => $i, 'sumber' => $c['sumber'] ?? 'RESMI'])->save();
            }
            return count($request->cp);
        });
        return response()->json(['success' => true, 'message' => "{$jumlah} elemen CP disimpan."]);
    }

    // ===== ATP =====

    public function daftarAtp(Request $request)
    {
        $request->validate(['status' => ['nullable', Rule::in(Atp::STATUS)]]);
        $data = $this->atpTerjangkau($request)->with(self::RELASI_ATP)->withCount('baris')
            ->when($request->status, fn($q) => $q->where('status', $request->status))
            ->when($request->id_mapel, fn($q) => $q->where('id_mapel', $request->id_mapel))
            ->when($request->boolean('milik'), fn($q) => $q->where('dibuat_oleh', $request->user()->id))
            ->orderByRaw("CASE status WHEN 'DIAJUKAN' THEN 0 WHEN 'REVISI' THEN 1 WHEN 'DRAF' THEN 2 ELSE 3 END")
            ->orderByDesc('updated_at')->get();
        $user = $request->user();
        $data->each(fn($a) => $a->setAttribute('boleh_ubah', $this->bolehUbahAtp($user, $a)));
        return response()->json(['data' => $data]);
    }

    public function lihatAtp(Request $request, string $id)
    {
        $atp = $this->atpTerjangkau($request)->with(self::RELASI_ATP)->findOrFail($id);
        return response()->json(['data' => $this->muatAtp($atp)]);
    }

    public function simpanAtp(Request $request, ?string $id = null)
    {
        $atp = $id ? Atp::findOrFail($id) : null;
        if ($atp) $this->cekPengubah($request, $atp);
        $data = $request->validate([
            'judul' => [$atp ? 'sometimes' : 'required', 'string', 'max:200'],
            'id_mapel' => [$atp ? 'sometimes' : 'required', 'exists:subjects,id_mapel'],
            'id_kelas' => 'nullable|exists:classes,id_kelas',
            'id_periode' => 'nullable|exists:master_periode,id_periode',
            'jp_per_minggu' => 'nullable|integer|min:1|max:60',
            'minggu_efektif' => 'nullable|integer|min:1|max:40',
            'baris' => 'nullable|array|max:120',
            'baris.*.id_cp' => 'nullable|exists:capaian_pembelajaran,id_cp',
            'baris.*.id_materi' => 'nullable|exists:master_materi,id_materi',
            'baris.*.id_indikator' => 'nullable|exists:master_indikator,id_indikator',
            'baris.*.materi_usulan' => 'nullable|string|max:255',
            'baris.*.tp_usulan' => 'nullable|string|max:1000',
            'baris.*.alokasi_jp' => 'nullable|integer|min:0|max:200',
            'baris.*.minggu' => 'nullable|string|max:20',
            'baris.*.dimensi' => ['nullable', Rule::in(['S', 'T', 'N', 'K', 'M'])],
            'baris.*.profil_lulusan' => 'nullable|array|max:4',
            'baris.*.profil_lulusan.*' => [Rule::in(Atp::PROFIL_LULUSAN)],
            'baris.*.catatan' => 'nullable|string|max:1000',
        ]);
        $idMapel = $data['id_mapel'] ?? $atp->id_mapel;
        $this->cekMapel($request, $idMapel);
        foreach ($data['baris'] ?? [] as $i => $b) {
            abort_if(empty($b['id_indikator']) && !trim((string) ($b['tp_usulan'] ?? '')), 422, 'Baris ' . ($i + 1) . ': pilih TP yang ada atau tulis TP baru.');
        }

        $atp = DB::transaction(function () use ($request, $data, $atp, $idMapel) {
            $kelas = isset($data['id_kelas']) ? Classes::find($data['id_kelas']) : ($atp?->kelas);
            $header = collect($data)->except('baris')->all() + ['fase' => CapaianPembelajaran::faseKelas($kelas?->nama_kelas)];
            if (!$atp) {
                $header['id_periode'] = ($header['id_periode'] ?? null) ?: MasterPeriode::where('status_aktif', 'AKTIF')->value('id_periode');
                $atp = Atp::create($header + [
                    'id_atp' => 'ATP-' . Str::upper(Str::random(10)), 'status' => 'DRAF', 'sumber' => $request->input('sumber') === 'AI' ? 'AI' : 'MANUAL',
                    'ai_mode' => $request->input('sumber') === 'AI' ? $request->input('ai_mode') : null, 'dibuat_oleh' => $request->user()->id,
                ]);
            } else {
                // Mengubah ATP yang sudah disetujui/diajukan membuatnya kembali menjadi draf
                if (in_array($atp->status, ['DISETUJUI', 'DIAJUKAN'], true)) $header += ['status' => 'DRAF', 'versi' => $atp->versi + 1, 'disetujui_oleh' => null, 'disetujui_pada' => null];
                if ($atp->status === 'DISETUJUI') $header['suntingan_setuju'] = $atp->suntingan_setuju + 1;
                $atp->update($header);
            }
            if (array_key_exists('baris', $data)) {
                $atp->baris()->delete();
                foreach ($data['baris'] ?? [] as $i => $b) {
                    $tp = !empty($b['id_indikator']) ? MasterIndikator::find($b['id_indikator']) : null;
                    $atp->baris()->create([
                        'urutan' => $i, 'id_cp' => $b['id_cp'] ?? null,
                        'id_materi' => $tp?->id_materi ?? ($b['id_materi'] ?? null), 'id_indikator' => $tp?->id_indikator,
                        'materi_usulan' => $tp || !empty($b['id_materi']) ? null : (trim((string) ($b['materi_usulan'] ?? '')) ?: null),
                        'tp_usulan' => $tp ? null : trim((string) $b['tp_usulan']),
                        'alokasi_jp' => $b['alokasi_jp'] ?? null, 'minggu' => $b['minggu'] ?? null, 'dimensi' => $b['dimensi'] ?? null,
                        'profil_lulusan' => array_values(array_unique($b['profil_lulusan'] ?? [])) ?: null, 'catatan' => $b['catatan'] ?? null,
                    ]);
                }
            }
            return $atp;
        });
        return response()->json(['success' => true, 'message' => 'ATP disimpan.', 'data' => $this->muatAtp($atp->fresh(self::RELASI_ATP))], $id ? 200 : 201);
    }

    public function hapusAtp(Request $request, string $id)
    {
        $atp = Atp::findOrFail($id);
        $this->cekPengubah($request, $atp);
        $atp->delete();
        return response()->json(['success' => true, 'message' => 'ATP dihapus. TP yang sudah dibuat tetap ada di master TP.']);
    }

    /** Draf baris ATP dari AI (belum disimpan; guru memeriksa di editor lalu menyimpan). */
    public function susunAtpAI(Request $request, string $id, PerangkatAjarAIService $ai)
    {
        $atp = Atp::with(['mapel', 'kelas', 'periode'])->findOrFail($id);
        $this->cekPengubah($request, $atp);
        $request->validate(['ai_mode' => ['required', Rule::in(SoalAIService::MODES)], 'catatan' => 'nullable|string|max:1500', 'id_catatan_notebook' => 'nullable|integer']);

        $cp = CapaianPembelajaran::where('id_mapel', $atp->id_mapel)->when($atp->fase, fn($q) => $q->where('fase', $atp->fase))
            ->orderBy('urutan')->get(['id_cp', 'fase', 'elemen', 'teks']);
        if ($cp->isEmpty()) {
            return response()->json(['message' => 'Isi dulu CP ' . ($atp->mapel->nama_mapel ?? '') . ($atp->fase ? " fase {$atp->fase}" : '') . ' di tab CP, agar AI bisa menurunkan TP darinya.'], 422);
        }
        $materi = MasterMateri::with(['indikator' => fn($q) => $q->where('aktif', true)->orderBy('urutan')])
            ->where('id_mapel', $atp->id_mapel)
            ->when($atp->id_kelas, fn($q) => $q->where(fn($w) => $w->where('id_kelas', $atp->id_kelas)->orWhereNull('id_kelas')))
            ->orderBy('nama_materi')->get();
        // Capaian siswa per TP dari nilai yang sudah masuk (rata-rata nilai TP)
        $capaian = DB::table('trans_nilai_indikator')->whereIn('id_indikator', $materi->flatMap->indikator->pluck('id_indikator'))
            ->groupBy('id_indikator')->selectRaw('id_indikator, AVG(nilai) as rata, COUNT(*) as n')->get()->keyBy('id_indikator');
        $contoh = Atp::with('baris.indikator')->where('status', 'DISETUJUI')->where('id_mapel', $atp->id_mapel)->where('id_atp', '!=', $atp->id_atp)
            ->latest('disetujui_pada')->first();

        $konteks = [
            'mapel' => $atp->mapel?->nama_mapel, 'kelas' => $atp->kelas?->nama_kelas, 'fase' => $atp->fase,
            'periode' => $atp->periode ? "{$atp->periode->tahun_ajaran} {$atp->periode->semester}" : null,
            'jp_per_minggu' => $atp->jp_per_minggu, 'minggu_efektif' => $atp->minggu_efektif,
            'cp' => $cp->map(fn($c) => ['id_cp' => $c->id_cp, 'elemen' => $c->elemen, 'teks' => $c->teks])->all(),
            'materi' => $materi->map(fn($m) => [
                'id_materi' => $m->id_materi, 'nama' => $m->nama_materi, 'deskripsi' => $m->deskripsi_kompetensi,
                'tp' => $m->indikator->map(fn($i) => array_filter([
                    'id_indikator' => $i->id_indikator, 'deskripsi' => $i->deskripsi,
                    'capaian_siswa' => isset($capaian[$i->id_indikator]) ? round((float) $capaian[$i->id_indikator]->rata) . " (dari {$capaian[$i->id_indikator]->n} nilai)" : null,
                ]))->all(),
            ])->all(),
            'catatan_guru' => $request->catatan,
            'contoh_atp_disetujui' => $contoh ? $contoh->baris->map(fn($b) => $b->indikator?->deskripsi ?? $b->tp_usulan)->filter()->values()->all() : null,
        ];
        $sumber = app(PustakaDokumenService::class)->pasang($ai, 'alur tujuan pembelajaran ' . ($atp->mapel?->nama_mapel ?? '') . " fase {$atp->fase} "
            . $cp->pluck('elemen')->implode(' '), $atp->id_mapel, $atp->fase);
        $dariNotebook = NotebookCatatan::pasang($ai, $request->id_catatan_notebook, $request->user());
        $mentah = $ai->susunAtp(array_filter($konteks, fn($v) => $v !== null), $request->ai_mode);
        if ($mentah === null) return response()->json(['message' => $ai->galat()], 422);

        // Bersihkan: hanya id yang sah untuk mapel ini
        $idCp = $cp->pluck('id_cp')->all();
        $tpSah = $materi->flatMap->indikator->keyBy('id_indikator');
        $materiSah = $materi->keyBy('id_materi');
        $baris = collect($mentah)->map(function ($b) use ($idCp, $tpSah, $materiSah) {
            $tp = $tpSah->get($b['id_indikator'] ?? null);
            $idMateri = $tp?->id_materi ?? ($materiSah->has($b['id_materi'] ?? null) ? $b['id_materi'] : null);
            $tpBaru = $tp ? null : trim((string) ($b['tp_usulan'] ?? ''));
            if (!$tp && $tpBaru === '') return null;
            return [
                'id_cp' => in_array($b['id_cp'] ?? null, $idCp, true) ? $b['id_cp'] : null,
                'id_materi' => $idMateri,
                'materi_usulan' => $idMateri ? null : (mb_substr(trim((string) ($b['materi_usulan'] ?? '')), 0, 255) ?: null),
                'id_indikator' => $tp?->id_indikator,
                'tp_usulan' => $tpBaru ? mb_substr($tpBaru, 0, 1000) : null,
                'alokasi_jp' => is_numeric($b['alokasi_jp'] ?? null) ? min(max((int) $b['alokasi_jp'], 0), 200) : null,
                'minggu' => mb_substr((string) ($b['minggu'] ?? ''), 0, 20) ?: null,
                'dimensi' => in_array(strtoupper((string) ($b['dimensi'] ?? '')), ['S', 'T', 'N', 'K', 'M'], true) ? strtoupper($b['dimensi']) : null,
                'profil_lulusan' => array_values(array_intersect((array) ($b['profil_lulusan'] ?? []), Atp::PROFIL_LULUSAN)) ?: null,
                'catatan' => mb_substr(trim((string) ($b['catatan'] ?? '')), 0, 1000) ?: null,
            ];
        })->filter()->values()->take(120);
        $baru = $baris->whereNotNull('tp_usulan')->count();
        return response()->json([
            'success' => true,
            'message' => "AI menyusun {$baris->count()} langkah ATP" . ($baru ? " ({$baru} TP baru diusulkan)" : '') . '. Periksa, ubah bila perlu, lalu Simpan.' . $dariNotebook,
            'baris' => $baris,
        ]);
    }

    public function ajukanAtp(Request $request, string $id)
    {
        $atp = Atp::withCount('baris')->findOrFail($id);
        $this->cekPengubah($request, $atp);
        abort_unless(in_array($atp->status, ['DRAF', 'REVISI'], true), 422, 'ATP ini sudah diajukan atau disetujui.');
        abort_if($atp->baris_count === 0, 422, 'ATP belum berisi TP.');
        $atp->update(['status' => 'DIAJUKAN']);
        return response()->json(['success' => true, 'message' => 'ATP diajukan ke kepala sekolah.']);
    }

    public function tarikAtp(Request $request, string $id)
    {
        $atp = Atp::findOrFail($id);
        $this->cekPengubah($request, $atp);
        abort_unless($atp->status === 'DIAJUKAN', 422, 'Hanya ATP yang sedang diajukan yang bisa ditarik.');
        $atp->update(['status' => 'DRAF']);
        return response()->json(['success' => true, 'message' => 'ATP ditarik menjadi draf.']);
    }

    /** Kepala sekolah menyetujui: materi & TP usulan dibuat di master, lalu baris ATP ditautkan ke sana. */
    public function setujuiAtp(Request $request, string $id)
    {
        $this->cekKepsek($request);
        $atp = Atp::with('baris')->findOrFail($id);
        abort_unless($atp->status === 'DIAJUKAN', 422, 'ATP ini tidak sedang diajukan.');
        $dibuat = DB::transaction(function () use ($request, $atp) {
            $tpBaru = 0;
            $materiBaru = [];
            foreach ($atp->baris as $b) {
                if ($b->id_indikator || !$b->tp_usulan) continue;
                $idMateri = $b->id_materi;
                if (!$idMateri) {
                    $nama = $b->materi_usulan ?: 'Materi ' . ($atp->judul);
                    $idMateri = $materiBaru[mb_strtolower($nama)] ??= MasterMateri::create([
                        'id_materi' => 'MAT-' . Str::random(8), 'id_mapel' => $atp->id_mapel, 'id_kelas' => $atp->id_kelas,
                        'id_periode' => $atp->id_periode, 'nama_materi' => $nama,
                        'deskripsi_kompetensi' => $b->cp?->teks ? Str::limit($b->cp->teks, 1000) : null,
                    ])->id_materi;
                }
                $tp = MasterIndikator::create([
                    'id_indikator' => 'IND-' . Str::upper(Str::random(8)), 'id_materi' => $idMateri, 'deskripsi' => $b->tp_usulan,
                    'urutan' => (int) MasterIndikator::where('id_materi', $idMateri)->max('urutan') + 1, 'aktif' => true, 'dibuat_oleh' => $atp->dibuat_oleh,
                ]);
                $b->update(['id_materi' => $idMateri, 'id_indikator' => $tp->id_indikator, 'tp_usulan' => null, 'materi_usulan' => null]);
                $tpBaru++;
            }
            $atp->update(['status' => 'DISETUJUI', 'catatan_revisi' => null, 'disetujui_oleh' => $request->user()->id, 'disetujui_pada' => now()]);
            return ['tp' => $tpBaru, 'materi' => count($materiBaru)];
        });
        return response()->json(['success' => true, 'message' => 'ATP disetujui.'
            . ($dibuat['tp'] ? " {$dibuat['tp']} TP baru" . ($dibuat['materi'] ? " dan {$dibuat['materi']} materi baru" : '') . ' ditambahkan ke Referensi Penilaian.' : '')]);
    }

    public function revisiAtp(Request $request, string $id)
    {
        $this->cekKepsek($request);
        $request->validate(['catatan' => 'required|string|max:2000']);
        $atp = Atp::findOrFail($id);
        abort_unless($atp->status === 'DIAJUKAN', 422, 'ATP ini tidak sedang diajukan.');
        $atp->update(['status' => 'REVISI', 'catatan_revisi' => $request->catatan]);
        return response()->json(['success' => true, 'message' => 'ATP dikembalikan ke guru dengan catatan.']);
    }

    // ===== bantu =====

    private function muatAtp(Atp $atp): array
    {
        $atp->load(['baris.cp:id_cp,fase,elemen', 'baris.materi:id_materi,nama_materi', 'baris.indikator:id_indikator,deskripsi']);
        return $atp->toArray() + ['total_jp' => $atp->baris->sum('alokasi_jp'), 'boleh_ubah' => request()->user() ? $this->bolehUbahAtp(request()->user(), $atp) : false];
    }

    private function atpTerjangkau(Request $request): Builder
    {
        $user = $request->user();
        // Guru: ATP buatannya sendiri + semua ATP (draf s.d. disetujui) untuk mapel yang ia ampu, termasuk yang disiapkan admin
        return Atp::query()->when(!$user->isPengelola(), fn($q) => $q->where(fn($w) => $w->where('dibuat_oleh', $user->id)
            ->orWhereIn('id_mapel', $user->mapelDiampu())));
    }

    /** Pembuat, pengelola, atau guru pengampu mapel ATP ini */
    private function bolehUbahAtp($user, Atp $atp): bool
    {
        return ($user->isPengelola() || $atp->dibuat_oleh === $user->id || $user->bolehNilaiMapel($atp->id_mapel)) && !$atp->terkunciUntuk($user);
    }

    private function cekMapel(Request $request, ?string $idMapel): void
    {
        abort_unless($request->user()->bolehNilaiMapel($idMapel), 403, 'Anda hanya dapat mengelola perangkat ajar untuk mata pelajaran yang Anda ampu.');
    }

    private function cekPengubah(Request $request, Atp $atp): void
    {
        $user = $request->user();
        abort_if($atp->terkunciUntuk($user), 403, 'ATP ini sudah disetujui dan sudah disunting ' . Atp::BATAS_SUNTING_SETUJU . ' kali (versi ' . Atp::BATAS_SUNTING_SETUJU . '). Hubungi admin atau kepala sekolah bila masih perlu diubah.');
        abort_unless($this->bolehUbahAtp($user, $atp), 403, 'ATP ini milik guru lain.');
    }

    private function cekKepsek(Request $request): void
    {
        abort_unless($request->user()->isKepsek(), 403, 'Persetujuan ATP hanya oleh kepala sekolah.');
    }
}

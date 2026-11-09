<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Atp;
use App\Models\CapaianPembelajaran;
use App\Models\Classes;
use App\Models\MasterIndikator;
use App\Models\MasterPeriode;
use App\Models\ModulAjar;
use App\Models\PaketSoal;
use App\Models\Student;
use App\Models\TransDiagnostikNonkognitif;
use App\Services\PerangkatAjarAIService;
use App\Services\SoalAIService;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

/**
 * Modul ajar (Fase 17 Tahap B), format Perencanaan Pembelajaran Mendalam (RPM). Dibuat dari baris ATP yang
 * disetujui atau dari TP langsung; AI menyusun draf memakai CP, TP, dan data kelas (tanpa nama siswa);
 * disetujui kepala sekolah seperti ATP.
 */
class ModulAjarController extends Controller
{
    private const RELASI = ['mapel:id_mapel,nama_mapel', 'kelas:id_kelas,nama_kelas', 'periode:id_periode,tahun_ajaran,semester',
        'atp:id_atp,judul', 'materi:id_materi,nama_materi', 'paket:id_paket,judul,tanggal', 'pembuat:id,name', 'penyetuju:id,name'];

    public function index(Request $request)
    {
        $request->validate(['status' => ['nullable', Rule::in(Atp::STATUS)]]);
        $data = $this->terjangkau($request)->with(self::RELASI)
            ->when($request->status, fn($q) => $q->where('status', $request->status))
            ->when($request->id_atp, fn($q) => $q->where('id_atp', $request->id_atp))
            ->orderByRaw("CASE status WHEN 'DIAJUKAN' THEN 0 WHEN 'REVISI' THEN 1 WHEN 'DRAF' THEN 2 ELSE 3 END")
            ->orderByDesc('updated_at')->get()->makeHidden('isi');
        // Kemajuan: pertemuan yang sudah selesai dilaksanakan menurut Jadwal
        $selesai = \App\Models\TransJadwal::whereIn('id_modul', $data->pluck('id_modul'))->where('status_sesi', 'Selesai')->whereNotNull('pertemuan_ke')
            ->selectRaw('id_modul, COUNT(DISTINCT pertemuan_ke) as n')->groupBy('id_modul')->pluck('n', 'id_modul');
        $data->each(fn($m) => $m->setAttribute('pertemuan_selesai', (int) ($selesai[$m->id_modul] ?? 0)));
        return response()->json(['data' => $data]);
    }

    public function show(Request $request, string $id)
    {
        return response()->json(['data' => $this->muat($this->terjangkau($request)->with(self::RELASI)->findOrFail($id))]);
    }

    public function simpan(Request $request, ?string $id = null)
    {
        $modul = $id ? ModulAjar::findOrFail($id) : null;
        if ($modul) $this->cekPengubah($request, $modul);
        $data = $request->validate([
            'judul' => [$modul ? 'sometimes' : 'required', 'string', 'max:200'],
            'id_mapel' => [$modul ? 'sometimes' : 'required', 'exists:subjects,id_mapel'],
            'id_kelas' => 'nullable|exists:classes,id_kelas',
            'id_periode' => 'nullable|exists:master_periode,id_periode',
            'id_atp' => 'nullable|exists:atp,id_atp',
            'id_materi' => 'nullable|exists:master_materi,id_materi',
            'id_paket' => 'nullable|exists:paket_soal,id_paket',
            'tp' => 'nullable|array|max:20',
            'tp.*' => 'exists:master_indikator,id_indikator',
            'jumlah_pertemuan' => 'nullable|integer|min:1|max:12',
            'jp_per_pertemuan' => 'nullable|integer|min:1|max:12',
            'isi' => 'nullable|array',
        ]);
        $idMapel = $data['id_mapel'] ?? $modul->id_mapel;
        abort_unless($request->user()->bolehNilaiMapel($idMapel), 403, 'Anda hanya dapat menyusun modul untuk mata pelajaran yang Anda ampu.');

        $pertemuan = (int) ($data['jumlah_pertemuan'] ?? $modul?->jumlah_pertemuan ?? 1);
        $kelas = array_key_exists('id_kelas', $data) ? Classes::find($data['id_kelas']) : $modul?->kelas;
        $header = collect($data)->except('isi')->all() + ['fase' => CapaianPembelajaran::faseKelas($kelas?->nama_kelas), 'jumlah_pertemuan' => $pertemuan];
        // Materi mengikuti TP pertama bila belum dipilih
        if (!($header['id_materi'] ?? $modul?->id_materi) && !empty($data['tp'])) $header['id_materi'] = MasterIndikator::find($data['tp'][0])?->id_materi;
        $isi = ModulAjar::normalisasi($data['isi'] ?? $modul?->isi, $pertemuan);

        if (!$modul) {
            $header['id_periode'] = ($header['id_periode'] ?? null) ?: MasterPeriode::where('status_aktif', 'AKTIF')->value('id_periode');
            $modul = ModulAjar::create($header + [
                'id_modul' => 'MOD-' . Str::upper(Str::random(10)), 'isi' => $isi, 'status' => 'DRAF',
                'sumber' => $request->input('sumber') === 'AI' ? 'AI' : 'MANUAL', 'ai_mode' => $request->input('sumber') === 'AI' ? $request->input('ai_mode') : null,
                'dibuat_oleh' => $request->user()->id,
            ]);
        } else {
            if (in_array($modul->status, ['DISETUJUI', 'DIAJUKAN'], true)) $header += ['status' => 'DRAF', 'versi' => $modul->versi + 1, 'disetujui_oleh' => null, 'disetujui_pada' => null];
            if ($request->input('sumber') === 'AI') $header += ['sumber' => 'AI', 'ai_mode' => $request->input('ai_mode')];
            $modul->update($header + ['isi' => $isi]);
        }
        return response()->json(['success' => true, 'message' => 'Modul ajar disimpan.', 'data' => $this->muat($modul->fresh(self::RELASI))], $id ? 200 : 201);
    }

    public function destroy(Request $request, string $id)
    {
        $modul = ModulAjar::findOrFail($id);
        $this->cekPengubah($request, $modul);
        $modul->delete();
        return response()->json(['success' => true, 'message' => 'Modul ajar dihapus.']);
    }

    /** Draf isi modul dari AI (belum disimpan). */
    public function susunAI(Request $request, string $id, PerangkatAjarAIService $ai)
    {
        $modul = ModulAjar::with(['mapel', 'kelas', 'materi', 'paket'])->findOrFail($id);
        $this->cekPengubah($request, $modul);
        $request->validate(['ai_mode' => ['required', Rule::in(SoalAIService::MODES)], 'catatan' => 'nullable|string|max:1500']);
        $tp = MasterIndikator::with('materi:id_materi,nama_materi,deskripsi_kompetensi')->whereIn('id_indikator', $modul->tp ?? [])->get();
        if ($tp->isEmpty()) return response()->json(['message' => 'Pilih dulu TP yang dicakup modul ini.'], 422);

        // CP elemen yang terkait (dari baris ATP) atau semua CP fase itu
        $idCp = $modul->id_atp ? DB::table('atp_baris')->where('id_atp', $modul->id_atp)->whereIn('id_indikator', $tp->pluck('id_indikator'))->whereNotNull('id_cp')->pluck('id_cp') : collect();
        $cp = CapaianPembelajaran::where('id_mapel', $modul->id_mapel)
            ->when($idCp->isNotEmpty(), fn($q) => $q->whereIn('id_cp', $idCp), fn($q) => $q->when($modul->fase, fn($w) => $w->where('fase', $modul->fase)))
            ->get(['elemen', 'teks']);
        $contoh = ModulAjar::where('status', 'DISETUJUI')->where('id_mapel', $modul->id_mapel)->where('id_modul', '!=', $modul->id_modul)->latest('disetujui_pada')->first();

        $konteks = array_filter([
            'mapel' => $modul->mapel?->nama_mapel, 'kelas' => $modul->kelas?->nama_kelas, 'fase' => $modul->fase,
            'cp' => $cp->map(fn($c) => "{$c->elemen}: {$c->teks}")->all() ?: null,
            'tp' => $tp->map(fn($t) => $t->deskripsi)->all(),
            'materi' => $tp->pluck('materi.nama_materi')->filter()->unique()->values()->all(),
            'deskripsi_materi' => $modul->materi?->deskripsi_kompetensi,
            'jumlah_pertemuan' => $modul->jumlah_pertemuan, 'jp_per_pertemuan' => $modul->jp_per_pertemuan,
            'data_kelas' => $this->dataKelas($modul, $tp),
            'asesmen_tersedia' => $modul->paket ? "Paket soal \"{$modul->paket->judul}\"" : null,
            'catatan_guru' => $request->catatan,
            'catatan_revisi_kepala_sekolah' => $modul->catatan_revisi,
            'contoh_modul_disetujui' => $contoh ? ['tujuan' => $contoh->isi['desain']['tujuan'] ?? null, 'pertemuan_1' => $contoh->isi['pertemuan'][0] ?? null] : null,
        ], fn($v) => $v !== null && $v !== []);

        $sumber = app(\App\Services\PustakaDokumenService::class)->pasang($ai, 'modul ajar pembelajaran mendalam ' . ($modul->mapel?->nama_mapel ?? '')
            . " fase {$modul->fase} " . $tp->pluck('deskripsi')->implode(' ') . ' ' . $cp->pluck('elemen')->implode(' '), $modul->id_mapel, $modul->fase);
        $mentah = $ai->susunModul($konteks, $request->ai_mode);
        if ($mentah === null) return response()->json(['message' => $ai->galat()], 422);
        $isi = ModulAjar::normalisasi($mentah, $modul->jumlah_pertemuan);
        foreach ($isi['pertemuan'] as &$p) $p['jp'] ??= $modul->jp_per_pertemuan;
        unset($p);
        return response()->json(['success' => true, 'message' => 'Draf modul ajar siap. Periksa setiap bagian, ubah bila perlu, lalu Simpan.'
            . \App\Services\PustakaDokumenService::catatanSumber($sumber), 'isi' => $isi, 'rujukan' => $sumber]);
    }

    public function ajukan(Request $request, string $id)
    {
        $modul = ModulAjar::findOrFail($id);
        $this->cekPengubah($request, $modul);
        abort_unless(in_array($modul->status, ['DRAF', 'REVISI'], true), 422, 'Modul ini sudah diajukan atau disetujui.');
        $isi = $modul->isi ?? [];
        $kosong = collect($isi['pertemuan'] ?? [])->every(fn($p) => !trim(($p['memahami'] ?? '') . ($p['mengaplikasi'] ?? '')));
        abort_if($kosong || !trim($isi['desain']['tujuan'] ?? ''), 422, 'Lengkapi tujuan dan pengalaman belajar sebelum mengajukan.');
        $modul->update(['status' => 'DIAJUKAN']);
        return response()->json(['success' => true, 'message' => 'Modul ajar diajukan ke kepala sekolah.']);
    }

    public function tarik(Request $request, string $id)
    {
        $modul = ModulAjar::findOrFail($id);
        $this->cekPengubah($request, $modul);
        abort_unless($modul->status === 'DIAJUKAN', 422, 'Hanya modul yang sedang diajukan yang bisa ditarik.');
        $modul->update(['status' => 'DRAF']);
        return response()->json(['success' => true, 'message' => 'Modul ditarik menjadi draf.']);
    }

    public function setujui(Request $request, string $id)
    {
        $this->cekKepsek($request);
        $modul = ModulAjar::findOrFail($id);
        abort_unless($modul->status === 'DIAJUKAN', 422, 'Modul ini tidak sedang diajukan.');
        $modul->update(['status' => 'DISETUJUI', 'catatan_revisi' => null, 'disetujui_oleh' => $request->user()->id, 'disetujui_pada' => now()]);
        return response()->json(['success' => true, 'message' => 'Modul ajar disetujui.']);
    }

    public function revisi(Request $request, string $id)
    {
        $this->cekKepsek($request);
        $request->validate(['catatan' => 'required|string|max:2000']);
        $modul = ModulAjar::findOrFail($id);
        abort_unless($modul->status === 'DIAJUKAN', 422, 'Modul ini tidak sedang diajukan.');
        $modul->update(['status' => 'REVISI', 'catatan_revisi' => $request->catatan]);
        return response()->json(['success' => true, 'message' => 'Modul dikembalikan ke guru dengan catatan.']);
    }

    /** Paket soal mapel/kelas modul ini, untuk ditautkan sebagai asesmen akhir. */
    public function pilihanPaket(Request $request, string $id)
    {
        $modul = $this->terjangkau($request)->findOrFail($id);
        $paket = PaketSoal::where('id_mapel', $modul->id_mapel)->when($modul->id_kelas, fn($q) => $q->where('id_kelas', $modul->id_kelas))
            ->orderByDesc('updated_at')->limit(50)->get(['id_paket', 'judul', 'tanggal']);
        return response()->json(['data' => $paket]);
    }

    // ===== bantu =====

    /**
     * Ringkasan kelas untuk AI, tanpa nama siswa: jumlah siswa, sebaran gaya belajar & minat (diagnostik non-kognitif),
     * rata-rata nilai TP yang dicakup dan TP lain di materi yang sama, serta siswa di bawah KKM / sedang remedial.
     */
    private function dataKelas(ModulAjar $modul, $tp): ?array
    {
        if (!$modul->id_kelas) return null;
        $siswa = Student::where('id_kelas', $modul->id_kelas)->pluck('id_siswa');
        if ($siswa->isEmpty()) return null;
        $diag = TransDiagnostikNonkognitif::whereIn('id_siswa', $siswa)->when($modul->id_periode, fn($q) => $q->where('id_periode', $modul->id_periode))->get(['gaya_belajar', 'minat']);
        $sebaran = fn($kolom) => $diag->pluck($kolom)->filter()->flatMap(fn($v) => is_array($v) ? $v : preg_split('/\s*[,;]\s*/', (string) $v))
            ->filter()->countBy()->sortDesc()->take(6)->all();
        $idTpMateri = MasterIndikator::whereIn('id_materi', $tp->pluck('id_materi')->unique())->pluck('id_indikator');
        $nilai = DB::table('trans_nilai_indikator as ni')->join('trans_nilai as n', 'n.id_nilai', '=', 'ni.id_nilai')
            ->whereIn('n.id_siswa', $siswa)->whereIn('ni.id_indikator', $idTpMateri)
            ->groupBy('ni.id_indikator')->selectRaw('ni.id_indikator, AVG(ni.nilai) as rata, SUM(CASE WHEN ni.nilai < 75 THEN 1 ELSE 0 END) as kurang, COUNT(*) as n')->get();
        $deskripsi = MasterIndikator::whereIn('id_indikator', $nilai->pluck('id_indikator'))->pluck('deskripsi', 'id_indikator');
        $remedial = DB::table('trans_rencana_remedial')->whereIn('id_siswa', $siswa)->where('id_mapel', $modul->id_mapel)
            ->where('status', 'DIRENCANAKAN')->distinct()->count('id_siswa');

        return array_filter([
            'jumlah_siswa' => $siswa->count(),
            'gaya_belajar' => $sebaran('gaya_belajar') ?: null,
            'minat' => $sebaran('minat') ?: null,
            'capaian_tp_terkait' => $nilai->map(fn($r) => ['tp' => $deskripsi[$r->id_indikator] ?? '', 'rata_nilai' => round((float) $r->rata), 'di_bawah_75' => (int) $r->kurang, 'jumlah_nilai' => (int) $r->n])->values()->all() ?: null,
            'siswa_sedang_remedial_mapel_ini' => $remedial ?: null,
        ], fn($v) => $v !== null);
    }

    private function muat(ModulAjar $modul): array
    {
        $tp = MasterIndikator::with('materi:id_materi,nama_materi')->whereIn('id_indikator', $modul->tp ?? [])->get(['id_indikator', 'id_materi', 'deskripsi']);
        $urut = array_flip($modul->tp ?? []);
        $sesi = \App\Models\TransJadwal::where('id_modul', $modul->id_modul)->where('status_sesi', '!=', 'Batal')->orderBy('mulai')
            ->get(['id_jadwal', 'pertemuan_ke', 'mulai', 'status_sesi', 'id_kelas']);
        return $modul->toArray() + [
            'isi' => ModulAjar::normalisasi($modul->isi, $modul->jumlah_pertemuan),
            'tp_detail' => $tp->sortBy(fn($t) => $urut[$t->id_indikator] ?? 99)->values(),
            'jadwal' => $sesi,
        ];
    }

    private function terjangkau(Request $request): Builder
    {
        $user = $request->user();
        return ModulAjar::query()->when(!$user->isPengelola(), fn($q) => $q->where(fn($w) => $w->where('dibuat_oleh', $user->id)
            ->orWhere(fn($x) => $x->where('status', 'DISETUJUI')->whereIn('id_mapel', $user->mapelDiampu()))));
    }

    private function cekPengubah(Request $request, ModulAjar $modul): void
    {
        $user = $request->user();
        abort_unless($user->isPengelola() || $modul->dibuat_oleh === $user->id, 403, 'Modul ini milik guru lain.');
    }

    private function cekKepsek(Request $request): void
    {
        abort_unless($request->user()->isKepsek(), 403, 'Persetujuan modul ajar hanya oleh kepala sekolah.');
    }
}

<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Classes;
use App\Models\MasterMateri;
use App\Models\MasterPeriode;
use App\Models\MasterRuangan;
use App\Models\SchoolSetting;
use App\Models\Subject;
use App\Models\Teacher;
use App\Models\TransJadwal;
use App\Services\LampiranJadwalService;
use Carbon\Carbon;
use App\Models\ModulAjar;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class JadwalController extends Controller
{
    public const STATUS = ['Menunggu', 'Berlangsung', 'Selesai', 'Batal'];
    private const MODE_BERANTAI = ['only_this', 'following', 'all'];
    private const FORMAT = 'Y-m-d\TH:i';
    private const MAKS_SESI = 300;

    private const RELASI = [
        'guru:id_guru,nama_guru,no_wa',
        'mapel:id_mapel,nama_mapel',
        'materi:id_materi,nama_materi,mat_S,mat_T,mat_N,mat_K,mat_M',
        'kelas:id_kelas,nama_kelas',
        'ruangan:id_ruangan,nama_ruangan',
        'modul:id_modul,judul,jumlah_pertemuan,status',
    ];

    /**
     * Data pilihan form jadwal sekaligus pengaturan WA sekolah.
     */
    public function referensi(Request $request)
    {
        $user = $request->user();
        return response()->json([
            // Modul ajar yang bisa ditautkan: yang disetujui, atau milik sendiri
            'modul' => ModulAjar::where(fn($q) => $q->where('status', 'DISETUJUI')->orWhere('dibuat_oleh', $user->id))
                ->orderBy('judul')->get(['id_modul', 'judul', 'id_mapel', 'id_kelas', 'id_materi', 'jumlah_pertemuan', 'status']),
            'teachers' => Teacher::orderBy('nama_guru')->get(['id_guru', 'nama_guru', 'no_wa']),
            'subjects' => Subject::orderBy('nama_mapel')->get(['id_mapel', 'nama_mapel', 'id_guru']),
            'materi' => MasterMateri::orderBy('nama_materi')->get(['id_materi', 'nama_materi', 'id_mapel', 'id_kelas', 'mat_S', 'mat_T', 'mat_N', 'mat_K', 'mat_M']),
            'classes' => Classes::orderBy('nama_kelas')->get(['id_kelas', 'nama_kelas']),
            'ruangan' => MasterRuangan::orderBy('nama_ruangan')->get(),
            'periode_aktif' => MasterPeriode::where('status_aktif', 'AKTIF')->first(),
            'settings' => SchoolSetting::first(),
        ]);
    }

    /**
     * Sesi yang beririsan dengan rentang tampilan kalender.
     */
    public function index(Request $request)
    {
        $request->validate(['start' => 'required|date', 'end' => 'required|date|after:start']);

        $data = TransJadwal::with(self::RELASI)
            ->where('mulai', '<', Carbon::parse($request->end))
            ->where('selesai', '>', Carbon::parse($request->start))
            ->orderBy('mulai')
            ->get();

        return response()->json(['data' => $data]);
    }

    private function rules(bool $baru): array
    {
        return [
            'id_guru' => 'nullable|exists:teachers,id_guru',
            'id_mapel' => 'nullable|required_without:judul|exists:subjects,id_mapel',
            'id_materi' => 'nullable|exists:master_materi,id_materi',
            'id_kelas' => 'nullable|exists:classes,id_kelas',
            'id_ruangan' => 'nullable|exists:master_ruangan,id_ruangan',
            'judul' => 'nullable|required_without:id_mapel|string|max:150',
            'mulai' => 'required|date_format:' . self::FORMAT,
            'selesai' => 'required|date_format:' . self::FORMAT . '|after:mulai',
            'warna' => ['nullable', 'regex:/^#[0-9a-fA-F]{6}$/'],
            'catatan' => 'nullable|string|max:3000',
            'status_sesi' => ['nullable', Rule::in(self::STATUS)],
            'id_modul' => 'nullable|exists:modul_ajar,id_modul',
            'pertemuan_ke' => 'nullable|integer|min:1|max:12',
            ...LampiranJadwalService::RULES,
            'hapus_lampiran' => 'nullable|boolean',
            'abaikan_bentrok' => 'nullable|boolean',
            ...($baru ? [
                'pola' => ['required', Rule::in(['sekali', 'harian', 'kustom'])],
                'hari' => 'nullable|array',
                'hari.*' => 'integer|between:0,6',
                'sampai' => 'nullable|required_unless:pola,sekali|date_format:Y-m-d',
            ] : [
                'mode' => ['nullable', Rule::in(self::MODE_BERANTAI)],
            ]),
        ];
    }

    private function pesanValidasi(): array
    {
        return [
            'id_mapel.required_without' => 'Pilih mata pelajaran, atau isi judul untuk agenda non-KBM.',
            'judul.required_without' => 'Isi judul agenda bila tidak memilih mata pelajaran.',
            'selesai.after' => 'Jam selesai harus setelah jam mulai.',
            'sampai.required_unless' => 'Tentukan tanggal batas akhir pengulangan.',
        ];
    }

    private function atribut(Request $request): array
    {
        return [
            'id_guru' => $request->user()->isGuru() ? $request->user()->id_guru : $request->id_guru,
            'id_mapel' => $request->id_mapel,
            'id_materi' => $request->id_materi,
            'id_kelas' => $request->id_kelas,
            'id_ruangan' => $request->id_ruangan,
            'judul' => $request->filled('judul') ? trim($request->judul) : null,
            'warna' => $request->warna ?: '#3f51b5',
            'catatan' => $request->catatan,
            'id_modul' => $request->id_modul ?: null,
        ];
    }

    /** Nomor pertemuan modul untuk sesi ke-$i dalam rangkaian (naik satu per sesi, berhenti di jumlah pertemuan modul). */
    private function pertemuanKe(Request $request, int $i): ?int
    {
        if (!$request->id_modul) return null;
        $awal = $request->integer('pertemuan_ke', 1) ?: 1;
        $jumlah = ModulAjar::whereKey($request->id_modul)->value('jumlah_pertemuan') ?? 1;
        $ke = $awal + $i;
        return $ke <= $jumlah ? $ke : null;
    }

    public function store(Request $request)
    {
        $request->validate($this->rules(true), $this->pesanValidasi());
        abort_if($request->user()->isGuru() && !$request->user()->id_guru, 403, 'Akun guru Anda belum terhubung dengan data guru. Hubungi admin.');

        $mulai = Carbon::createFromFormat(self::FORMAT, $request->mulai);
        $selesai = Carbon::createFromFormat(self::FORMAT, $request->selesai);
        if (!$mulai->isSameDay($selesai)) {
            throw ValidationException::withMessages(['selesai' => 'Sesi harus selesai di hari yang sama.']);
        }

        // Daftar tanggal sesi sesuai pola pengulangan
        $tanggal = [$mulai->copy()->startOfDay()];
        if ($request->pola !== 'sekali') {
            $hari = $request->pola === 'harian' ? [1, 2, 3, 4, 5] : array_map('intval', $request->hari ?? []);
            if (!$hari) throw ValidationException::withMessages(['hari' => 'Pilih minimal satu hari pertemuan.']);
            $sampai = Carbon::createFromFormat('Y-m-d', $request->sampai)->endOfDay();
            if ($sampai->lt($mulai)) throw ValidationException::withMessages(['sampai' => 'Batas akhir harus setelah tanggal mulai.']);
            if ($sampai->gt($mulai->copy()->addYear())) throw ValidationException::withMessages(['sampai' => 'Pengulangan maksimal 1 tahun.']);

            $tanggal = [];
            for ($d = $mulai->copy()->startOfDay(); $d->lte($sampai); $d->addDay()) {
                if (in_array($d->dayOfWeek, $hari, true)) $tanggal[] = $d->copy();
            }
            if (!$tanggal) throw ValidationException::withMessages(['hari' => 'Tidak ada tanggal yang cocok dalam rentang tersebut.']);
            if (count($tanggal) > self::MAKS_SESI) throw ValidationException::withMessages(['sampai' => 'Terlalu banyak sesi (maks. ' . self::MAKS_SESI . ').']);
        }

        $atribut = $this->atribut($request);
        $slot = array_map(fn(Carbon $d, int $i) => [
            'mulai' => $d->copy()->setTimeFrom($mulai),
            'selesai' => $d->copy()->setTimeFrom($selesai),
            'pertemuan_ke' => $this->pertemuanKe($request, $i),
        ] + $atribut, $tanggal, array_keys($tanggal));

        if (!$request->boolean('abaikan_bentrok') && ($bentrok = $this->cariBentrok($slot))->isNotEmpty()) {
            return $this->responBentrok($bentrok);
        }

        [$lampiranUrl, $lampiranNama] = LampiranJadwalService::dariRequest($request);
        $idGroup = count($slot) > 1 ? 'GRP-' . Str::uuid() : null;
        $idPeriode = MasterPeriode::where('status_aktif', 'AKTIF')->value('id_periode');

        $ids = DB::transaction(function () use ($slot, $idGroup, $idPeriode, $lampiranUrl, $lampiranNama, $request) {
            $ids = [];
            foreach ($slot as $s) {
                $id = 'JDW-' . Str::uuid();
                TransJadwal::create([
                    ...$s,
                    'id_jadwal' => $id,
                    'id_group' => $idGroup,
                    'id_periode' => $idPeriode,
                    'lampiran_url' => $lampiranUrl,
                    'lampiran_nama' => $lampiranNama,
                    'status_sesi' => $request->status_sesi ?: 'Menunggu',
                ]);
                $ids[] = $id;
            }
            return $ids;
        });

        return response()->json([
            'success' => true,
            'message' => count($ids) > 1 ? count($ids) . ' sesi jadwal berulang disimpan.' : 'Jadwal disimpan.',
            'jumlah' => count($ids),
            'data' => TransJadwal::with(self::RELASI)->whereIn('id_jadwal', $ids)->orderBy('mulai')->get(),
        ], 201);
    }

    /**
     * Ubah sesi. Untuk jadwal berulang, mode menentukan cakupan: hanya sesi ini, sesi ini & berikutnya,
     * atau seluruh rangkaian. Sesi lain mempertahankan tanggalnya dan mengikuti jam yang baru.
     */
    public function update(Request $request, $id)
    {
        $jadwal = TransJadwal::findOrFail($id);
        $this->cekPemilik($request, $jadwal);
        $request->validate($this->rules(false), $this->pesanValidasi());

        $mulai = Carbon::createFromFormat(self::FORMAT, $request->mulai);
        $selesai = Carbon::createFromFormat(self::FORMAT, $request->selesai);
        if (!$mulai->isSameDay($selesai)) {
            throw ValidationException::withMessages(['selesai' => 'Sesi harus selesai di hari yang sama.']);
        }

        $target = $this->targetBerantai($request, $jadwal, $request->mode ?? 'only_this');
        $atribut = $this->atribut($request);
        $slot = $target->map(fn($t) => $t->id_jadwal === $jadwal->id_jadwal
            ? ['id_jadwal' => $t->id_jadwal, 'mulai' => $mulai, 'selesai' => $selesai] + $atribut
            : ['id_jadwal' => $t->id_jadwal, 'mulai' => $t->mulai->copy()->setTimeFrom($mulai), 'selesai' => $t->selesai->copy()->setTimeFrom($selesai)] + $atribut
        )->all();

        if (!$request->boolean('abaikan_bentrok') && ($bentrok = $this->cariBentrok($slot, $target->pluck('id_jadwal')->all()))->isNotEmpty()) {
            return $this->responBentrok($bentrok);
        }

        $lampiranBaru = null;
        if ($request->filled('lampiran_base64') || $request->filled('lampiran_url')) {
            $lampiranBaru = LampiranJadwalService::dariRequest($request);
        }
        $lampiranLama = $target->pluck('lampiran_url')->filter()->unique();

        DB::transaction(function () use ($slot, $lampiranBaru, $request, $jadwal) {
            foreach ($slot as $s) {
                $data = collect($s)->except('id_jadwal')->all();
                if ($lampiranBaru) [$data['lampiran_url'], $data['lampiran_nama']] = $lampiranBaru;
                elseif ($request->boolean('hapus_lampiran')) [$data['lampiran_url'], $data['lampiran_nama']] = [null, null];
                // Status & nomor pertemuan bersifat per sesi: hanya sesi yang sedang diedit yang berubah
                if ($s['id_jadwal'] === $jadwal->id_jadwal && $request->filled('status_sesi')) $data['status_sesi'] = $request->status_sesi;
                if ($s['id_jadwal'] === $jadwal->id_jadwal) $data['pertemuan_ke'] = $request->id_modul ? ($request->integer('pertemuan_ke') ?: null) : null;
                elseif (!$request->id_modul) $data['pertemuan_ke'] = null;
                TransJadwal::whereKey($s['id_jadwal'])->update($data);
            }
        });

        if ($lampiranBaru || $request->boolean('hapus_lampiran')) LampiranJadwalService::bersihkan($lampiranLama);

        return response()->json([
            'success' => true,
            'message' => count($slot) > 1 ? count($slot) . ' sesi diperbarui.' : 'Jadwal diperbarui.',
            'jumlah' => count($slot),
        ]);
    }

    /**
     * Geser/ubah durasi lewat drag & drop di kalender (dalam menit).
     */
    public function geser(Request $request, $id)
    {
        $jadwal = TransJadwal::findOrFail($id);
        $this->cekPemilik($request, $jadwal);
        $request->validate([
            'mode' => ['nullable', Rule::in(self::MODE_BERANTAI)],
            'delta_mulai' => 'required|integer|between:-525600,525600',
            'delta_selesai' => 'required|integer|between:-525600,525600',
            'abaikan_bentrok' => 'nullable|boolean',
        ]);

        $target = $this->targetBerantai($request, $jadwal, $request->mode ?? 'only_this');
        $slot = $target->map(fn($t) => [
            'id_jadwal' => $t->id_jadwal,
            'mulai' => $t->mulai->copy()->addMinutes($request->delta_mulai),
            'selesai' => $t->selesai->copy()->addMinutes($request->delta_selesai),
            'id_guru' => $t->id_guru, 'id_ruangan' => $t->id_ruangan, 'id_kelas' => $t->id_kelas,
        ])->all();

        foreach ($slot as $s) {
            if ($s['selesai']->lte($s['mulai'])) throw ValidationException::withMessages(['selesai' => 'Durasi sesi tidak valid.']);
        }
        if (!$request->boolean('abaikan_bentrok') && ($bentrok = $this->cariBentrok($slot, $target->pluck('id_jadwal')->all()))->isNotEmpty()) {
            return $this->responBentrok($bentrok);
        }

        DB::transaction(function () use ($slot) {
            foreach ($slot as $s) TransJadwal::whereKey($s['id_jadwal'])->update(['mulai' => $s['mulai'], 'selesai' => $s['selesai']]);
        });

        return response()->json(['success' => true, 'message' => count($slot) > 1 ? count($slot) . ' sesi digeser.' : 'Jadwal digeser.']);
    }

    public function status(Request $request, $id)
    {
        $request->validate(['status_sesi' => ['required', Rule::in(self::STATUS)]]);
        $jadwal = TransJadwal::findOrFail($id);
        $this->cekPemilik($request, $jadwal);
        $jadwal->update(['status_sesi' => $request->status_sesi]);

        return response()->json(['success' => true, 'message' => "Status sesi: {$request->status_sesi}."]);
    }

    /**
     * Rencana pembelajaran sesi-sesi pada satu tanggal (untuk formulir jurnal): sesi yang menautkan modul ajar
     * beserta langkah pertemuannya. Guru melihat sesinya sendiri; admin/kepsek semua.
     */
    public function rencanaHari(Request $request)
    {
        $request->validate(['tanggal' => 'required|date_format:Y-m-d', 'id_kelas' => 'nullable|exists:classes,id_kelas']);
        $user = $request->user();
        $sesi = TransJadwal::with(['mapel:id_mapel,nama_mapel', 'kelas:id_kelas,nama_kelas', 'modul'])
            ->whereNotNull('id_modul')->whereDate('mulai', $request->tanggal)->where('status_sesi', '!=', 'Batal')
            ->when($request->id_kelas, fn($q) => $q->where('id_kelas', $request->id_kelas))
            ->when($user->isGuru(), fn($q) => $q->where('id_guru', $user->id_guru))
            ->orderBy('mulai')->get();
        return response()->json(['data' => $sesi->map(fn($j) => $this->rencanaSesi($j))->values()]);
    }

    /** Rencana satu sesi: modul & langkah pertemuannya. */
    public function rencana(Request $request, $id)
    {
        $jadwal = TransJadwal::with(['mapel:id_mapel,nama_mapel', 'kelas:id_kelas,nama_kelas', 'modul'])->findOrFail($id);
        abort_unless($jadwal->modul, 404, 'Sesi ini belum ditautkan ke modul ajar.');
        return response()->json(['data' => $this->rencanaSesi($jadwal)]);
    }

    private function rencanaSesi(TransJadwal $j): array
    {
        $isi = ModulAjar::normalisasi($j->modul->isi, $j->modul->jumlah_pertemuan);
        $p = $j->pertemuan_ke ? ($isi['pertemuan'][$j->pertemuan_ke - 1] ?? null) : null;
        return [
            'id_jadwal' => $j->id_jadwal, 'mulai' => $j->mulai, 'selesai' => $j->selesai, 'status_sesi' => $j->status_sesi,
            'mapel' => $j->mapel?->nama_mapel, 'kelas' => $j->kelas?->nama_kelas, 'id_materi' => $j->modul->id_materi ?? $j->id_materi,
            'modul' => ['id_modul' => $j->modul->id_modul, 'judul' => $j->modul->judul, 'status' => $j->modul->status, 'jumlah_pertemuan' => $j->modul->jumlah_pertemuan],
            'pertemuan_ke' => $j->pertemuan_ke,
            'tujuan' => $isi['desain']['tujuan'] ?: null,
            'langkah' => $p ? collect(ModulAjar::LANGKAH)->mapWithKeys(fn($l) => [$l => $p[$l]])->filter()->all() : null,
        ];
    }

    public function destroy(Request $request, $id)
    {
        $jadwal = TransJadwal::findOrFail($id);
        $this->cekPemilik($request, $jadwal);
        $request->validate(['mode' => ['nullable', Rule::in(self::MODE_BERANTAI)]]);

        $target = $this->targetBerantai($request, $jadwal, $request->mode ?? 'only_this');
        $lampiran = $target->pluck('lampiran_url')->filter()->unique();
        // Bukti remedial yang tersimpan di sesi ini tetap melekat pada rencananya
        LampiranJadwalService::pindahkanKeRencana($target);
        TransJadwal::whereIn('id_jadwal', $target->pluck('id_jadwal'))->delete();
        LampiranJadwalService::bersihkan($lampiran);

        return response()->json(['success' => true, 'message' => $target->count() > 1 ? $target->count() . ' sesi dihapus.' : 'Jadwal dihapus.']);
    }

    // ================= BANTUAN =================

    // Guru hanya boleh mengubah sesi yang ia ampu sendiri
    private function cekPemilik(Request $request, TransJadwal $jadwal): void
    {
        $user = $request->user();
        abort_if($user->isGuru() && (!$user->id_guru || $jadwal->id_guru !== $user->id_guru), 403, 'Anda hanya dapat mengubah jadwal milik Anda sendiri.');
    }

    private function targetBerantai(Request $request, TransJadwal $jadwal, string $mode): Collection
    {
        if (!$jadwal->id_group || $mode === 'only_this') return collect([$jadwal]);

        $user = $request->user();
        return TransJadwal::where('id_group', $jadwal->id_group)
            ->when($user->isGuru(), fn($q) => $q->where('id_guru', $user->id_guru))
            ->when($mode === 'following', fn($q) => $q->where('mulai', '>=', $jadwal->mulai))
            ->orderBy('mulai')
            ->get();
    }

    /**
     * Cari sesi lain (yang tidak batal) yang beririsan waktu dengan guru, ruangan, atau kelas yang sama.
     */
    private function cariBentrok(array $slot, array $kecuali = []): Collection
    {
        $guru = array_filter(array_column($slot, 'id_guru'));
        $ruang = array_filter(array_column($slot, 'id_ruangan'));
        $kelas = array_filter(array_column($slot, 'id_kelas'));
        if (!$guru && !$ruang && !$kelas) return collect();

        $awal = collect($slot)->min('mulai');
        $akhir = collect($slot)->max('selesai');
        $kandidat = TransJadwal::with(self::RELASI)
            ->where('status_sesi', '!=', 'Batal')
            ->where('mulai', '<', $akhir)
            ->where('selesai', '>', $awal)
            ->when($kecuali, fn($q) => $q->whereNotIn('id_jadwal', $kecuali))
            ->where(fn($q) => $q->whereIn('id_guru', $guru ?: ['-'])->orWhereIn('id_ruangan', $ruang ?: ['-'])->orWhereIn('id_kelas', $kelas ?: ['-']))
            ->get();

        $hasil = collect();
        foreach ($slot as $s) {
            foreach ($kandidat as $k) {
                if (!($k->mulai->lt($s['selesai']) && $k->selesai->gt($s['mulai']))) continue;
                $sebab = array_values(array_filter([
                    $s['id_guru'] && $s['id_guru'] === $k->id_guru ? 'guru ' . ($k->guru->nama_guru ?? $k->id_guru) : null,
                    $s['id_ruangan'] && $s['id_ruangan'] === $k->id_ruangan ? 'ruangan ' . ($k->ruangan->nama_ruangan ?? $k->id_ruangan) : null,
                    $s['id_kelas'] && $s['id_kelas'] === $k->id_kelas ? 'kelas ' . ($k->kelas->nama_kelas ?? $k->id_kelas) : null,
                ]));
                if (!$sebab) continue;
                $hasil->push([
                    'id_jadwal' => $k->id_jadwal,
                    'judul' => $k->judul ?: ($k->mapel->nama_mapel ?? 'Sesi'),
                    'waktu' => $k->mulai->locale('id')->translatedFormat('D, j M Y H:i') . '–' . $k->selesai->format('H:i'),
                    'sebab' => implode(', ', $sebab),
                ]);
                if ($hasil->count() >= 10) return $hasil->unique('id_jadwal')->values();
            }
        }
        return $hasil->unique('id_jadwal')->values();
    }

    private function responBentrok(Collection $bentrok)
    {
        return response()->json([
            'message' => 'Jadwal bentrok dengan ' . $bentrok->count() . ' sesi lain.',
            'bentrok' => $bentrok,
        ], 409);
    }
}

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
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class JadwalController extends Controller
{
    public const STATUS = ['Menunggu', 'Berlangsung', 'Selesai', 'Batal'];
    private const MODE_BERANTAI = ['only_this', 'following', 'all'];
    private const FORMAT = 'Y-m-d\TH:i';
    private const MAKS_SESI = 300;

    private const LAMPIRAN_MIME = [
        'application/pdf' => 'pdf',
        'image/jpeg' => 'jpg',
        'image/png' => 'png',
        'image/webp' => 'webp',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document' => 'docx',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation' => 'pptx',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' => 'xlsx',
        'application/msword' => 'doc',
        'application/vnd.ms-powerpoint' => 'ppt',
        'application/zip' => 'zip',
    ];
    private const LAMPIRAN_MAX_BYTES = 10 * 1024 * 1024;

    private const RELASI = [
        'guru:id_guru,nama_guru,no_wa',
        'mapel:id_mapel,nama_mapel',
        'materi:id_materi,nama_materi,mat_S,mat_T,mat_N,mat_K,mat_M',
        'kelas:id_kelas,nama_kelas',
        'ruangan:id_ruangan,nama_ruangan',
    ];

    /**
     * Data pilihan form jadwal sekaligus pengaturan WA sekolah.
     */
    public function referensi()
    {
        return response()->json([
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
            'lampiran_base64' => 'nullable|string',
            'lampiran_nama' => 'nullable|string|max:255',
            'lampiran_url' => 'nullable|url|max:500',
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
        ];
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
        $slot = array_map(fn(Carbon $d) => [
            'mulai' => $d->copy()->setTimeFrom($mulai),
            'selesai' => $d->copy()->setTimeFrom($selesai),
        ] + $atribut, $tanggal);

        if (!$request->boolean('abaikan_bentrok') && ($bentrok = $this->cariBentrok($slot))->isNotEmpty()) {
            return $this->responBentrok($bentrok);
        }

        [$lampiranUrl, $lampiranNama] = $this->lampiranDariRequest($request);
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
            $lampiranBaru = $this->lampiranDariRequest($request);
        }
        $lampiranLama = $target->pluck('lampiran_url')->filter()->unique();

        DB::transaction(function () use ($slot, $lampiranBaru, $request, $jadwal) {
            foreach ($slot as $s) {
                $data = collect($s)->except('id_jadwal')->all();
                if ($lampiranBaru) [$data['lampiran_url'], $data['lampiran_nama']] = $lampiranBaru;
                elseif ($request->boolean('hapus_lampiran')) [$data['lampiran_url'], $data['lampiran_nama']] = [null, null];
                // Status bersifat per sesi: hanya sesi yang sedang diedit yang berubah statusnya
                if ($s['id_jadwal'] === $jadwal->id_jadwal && $request->filled('status_sesi')) $data['status_sesi'] = $request->status_sesi;
                TransJadwal::whereKey($s['id_jadwal'])->update($data);
            }
        });

        if ($lampiranBaru || $request->boolean('hapus_lampiran')) $this->bersihkanLampiran($lampiranLama);

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

    public function destroy(Request $request, $id)
    {
        $jadwal = TransJadwal::findOrFail($id);
        $this->cekPemilik($request, $jadwal);
        $request->validate(['mode' => ['nullable', Rule::in(self::MODE_BERANTAI)]]);

        $target = $this->targetBerantai($request, $jadwal, $request->mode ?? 'only_this');
        $lampiran = $target->pluck('lampiran_url')->filter()->unique();
        TransJadwal::whereIn('id_jadwal', $target->pluck('id_jadwal'))->delete();
        $this->bersihkanLampiran($lampiran);

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

    /**
     * Lampiran berupa file unggahan (base64) atau tautan eksternal (mis. Google Drive).
     * @return array [url, nama]
     */
    private function lampiranDariRequest(Request $request): array
    {
        if ($request->filled('lampiran_base64')) {
            $decoded = base64_decode(preg_replace('/^data:[^;]*;base64,/', '', $request->lampiran_base64), true);
            if ($decoded === false || $decoded === '') throw ValidationException::withMessages(['lampiran_base64' => 'Lampiran tidak valid.']);
            if (strlen($decoded) > self::LAMPIRAN_MAX_BYTES) throw ValidationException::withMessages(['lampiran_base64' => 'Ukuran lampiran maksimal 10MB.']);

            $mime = (new \finfo(FILEINFO_MIME_TYPE))->buffer($decoded);
            if (!isset(self::LAMPIRAN_MIME[$mime])) {
                throw ValidationException::withMessages(['lampiran_base64' => 'Format lampiran tidak didukung (PDF, gambar, Word, PowerPoint, Excel, ZIP).']);
            }
            $file = 'jadwal_' . Str::random(16) . '.' . self::LAMPIRAN_MIME[$mime];
            Storage::disk('public')->put('jadwal/' . $file, $decoded);
            $nama = Str::limit(basename((string) $request->lampiran_nama) ?: $file, 250, '');
            return ['/storage/jadwal/' . $file, $nama];
        }
        if ($request->filled('lampiran_url')) {
            return [$request->lampiran_url, Str::limit($request->lampiran_nama ?: 'Tautan lampiran', 250, '')];
        }
        return [null, null];
    }

    // Hapus file unggahan yang sudah tidak dipakai sesi mana pun
    private function bersihkanLampiran(Collection $urls): void
    {
        foreach ($urls as $url) {
            if (!Str::startsWith($url, '/storage/jadwal/')) continue;
            if (!TransJadwal::where('lampiran_url', $url)->exists()) {
                Storage::disk('public')->delete(Str::after($url, '/storage/'));
            }
        }
    }
}

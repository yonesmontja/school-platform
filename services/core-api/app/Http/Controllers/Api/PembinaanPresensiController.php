<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Student;
use App\Models\TransJurnal;
use App\Models\TransPembinaanPresensi;
use App\Models\Classes;
use App\Models\TransPresensi;
use App\Models\TransPresensiMapel;
use App\Models\TransVersi;
use App\Rules\BukanHariMinggu;
use App\Services\PembinaanAIService;
use App\Services\VersiCatatan;
use App\Support\HtmlAman;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

/**
 * Rencana pembinaan siswa yang kehadirannya perlu perhatian: tindakan (pilihan + tulisan guru), tanggal mulai &
 * tindak lanjut, status (Otomatis/Berlangsung/Selesai/Batal), hasil, dan jurnal yang mencatat tiap langkahnya.
 * Semua staf boleh merencanakan; mengubah/menghapus hanya pembuatnya, wali kelas siswa, admin, atau kepala sekolah.
 * Catatan/latar belakang berupa HTML editor (dibersihkan HtmlAman; foto/video lewat LampiranController). Setiap simpan rencana
 * dan catatan progres di jurnal tercatat sebagai versi (VersiCatatan), seperti riwayat commit, sampai pembinaan selesai.
 */
class PembinaanPresensiController extends Controller
{
    public function index(Request $request)
    {
        $request->validate(['id_kelas' => 'required|exists:classes,id_kelas', 'id_periode' => 'nullable|exists:master_periode,id_periode']);
        $data = TransPembinaanPresensi::with(['siswa:id_siswa,nama_siswa', 'pembuat:id,name,id_guru', 'kelas.waliKelas:id_guru,nama_guru'])
            ->where('id_kelas', $request->id_kelas)
            ->when($request->id_periode, fn($q) => $q->where(fn($w) => $w->where('id_periode', $request->id_periode)->orWhereNull('id_periode')))
            ->orderByDesc('created_at')->get();
        return response()->json([
            'data' => $this->lengkapi($data, $request),
            'opsi' => TransPembinaanPresensi::OPSI,
            'hari_pulih' => TransPembinaanPresensi::HARI_PULIH,
        ]);
    }

    private function rules(): array
    {
        return [
            'tindakan' => 'required|array|min:1|max:12',
            'tindakan.*' => 'string|max:200',
            'catatan' => 'nullable|string|max:60000',
            'keterangan_versi' => 'nullable|string|max:300',
            'tanggal_mulai' => 'required|date_format:Y-m-d',
            'tanggal_tindak_lanjut' => 'required|date_format:Y-m-d|after_or_equal:tanggal_mulai',
            'status' => ['nullable', Rule::in(TransPembinaanPresensi::STATUS)],
            'hasil' => 'nullable|string|max:2000',
        ];
    }

    private const PESAN = [
        'tindakan.required' => 'Pilih atau tulis minimal satu tindakan pembinaan.',
        'tanggal_tindak_lanjut.after_or_equal' => 'Tanggal tindak lanjut tidak boleh sebelum tanggal mulai.',
    ];

    public function store(Request $request)
    {
        $request->validate(['id_siswa' => 'required|exists:students,id_siswa', 'id_periode' => 'nullable|exists:master_periode,id_periode'] + $this->rules(), self::PESAN);
        $siswa = Student::findOrFail($request->id_siswa);
        abort_if(!$siswa->id_kelas, 422, 'Siswa belum masuk kelas mana pun.');

        // Potret kehadiran saat rencana dibuat, untuk dibandingkan dengan hasil pembinaan
        $hadir = TransPresensi::where('id_siswa', $siswa->id_siswa)->when($request->id_periode, fn($q) => $q->where('id_periode', $request->id_periode))->get(['status_kehadiran']);
        $hitung = $hadir->countBy('status_kehadiran');
        $awal = ['hari' => $hadir->count(), 'hadir' => $hitung['HADIR'] ?? 0, 'sakit' => $hitung['SAKIT'] ?? 0, 'izin' => $hitung['IZIN'] ?? 0, 'alpa' => $hitung['ALPA'] ?? 0,
            'persen' => $hadir->count() ? round(($hitung['HADIR'] ?? 0) / $hadir->count() * 100) : null];

        $r = TransPembinaanPresensi::create([
            'id_pembinaan' => 'PBN-' . Str::uuid(),
            'id_siswa' => $siswa->id_siswa, 'id_kelas' => $siswa->id_kelas, 'id_periode' => $request->id_periode,
            ...$this->isian($request),
            'ringkasan_awal' => $awal,
            'dibuat_oleh' => $request->user()->id,
        ]);
        $this->catatVersi($request, $r, 'Rencana dibuat');
        return response()->json(['success' => true, 'message' => 'Rencana pembinaan disimpan.', 'data' => $this->lengkapi(collect([$r->load(['siswa:id_siswa,nama_siswa', 'pembuat:id,name,id_guru', 'kelas.waliKelas:id_guru,nama_guru'])]), $request)[0]], 201);
    }

    public function update(Request $request, string $id)
    {
        $r = TransPembinaanPresensi::findOrFail($id);
        $this->cekPengubah($request, $r);
        $request->validate($this->rules(), self::PESAN);
        $r->update($this->isian($request, $r));
        $this->catatVersi($request, $r, 'Rencana diperbarui');
        return response()->json(['success' => true, 'message' => 'Rencana pembinaan diperbarui.', 'data' => $this->lengkapi(collect([$r->fresh(['siswa:id_siswa,nama_siswa', 'pembuat:id,name,id_guru', 'kelas.waliKelas:id_guru,nama_guru'])]), $request)[0]]);
    }

    /** Ubah status cepat (mis. tandai Selesai dari daftar) beserta hasilnya. */
    public function status(Request $request, string $id)
    {
        $r = TransPembinaanPresensi::findOrFail($id);
        $this->cekPengubah($request, $r);
        $request->validate(['status' => ['required', Rule::in(TransPembinaanPresensi::STATUS)], 'hasil' => 'nullable|string|max:2000']);
        $r->update([
            'status' => $request->status,
            'hasil' => $request->has('hasil') ? $request->hasil : $r->hasil,
            'tanggal_selesai' => $request->status === 'SELESAI' ? ($r->tanggal_selesai ?? now(config('app.zona_sekolah'))->toDateString()) : null,
        ]);
        $this->catatVersi($request, $r, ['SELESAI' => 'Ditandai selesai', 'BATAL' => 'Dibatalkan', 'OTOMATIS' => 'Kembali ke status otomatis', 'BERLANGSUNG' => 'Ditandai berlangsung'][$request->status]);
        return response()->json(['success' => true, 'message' => 'Status pembinaan diperbarui.', 'data' => $this->lengkapi(collect([$r->fresh(['siswa:id_siswa,nama_siswa', 'pembuat:id,name,id_guru', 'kelas.waliKelas:id_guru,nama_guru'])]), $request)[0]]);
    }

    /** Tautkan jurnal (dibuat lewat /jurnal/store) sebagai catatan langkah pembinaan ini. */
    public function tautJurnal(Request $request, string $id)
    {
        $r = TransPembinaanPresensi::findOrFail($id);
        $request->validate(['id_jurnal' => 'required|exists:trans_jurnal,id_jurnal']);
        $j = TransJurnal::findOrFail($request->id_jurnal);
        abort_unless($j->id_siswa === $r->id_siswa, 422, 'Jurnal ini bukan milik siswa yang dibina.');
        $r->update(['jurnal' => collect($r->jurnal ?? [])->push($j->id_jurnal)->unique()->values()->all()]);
        if (!VersiCatatan::terakhir('jurnal', $j->id_jurnal)) VersiCatatan::simpan('jurnal', $j->id_jurnal, $j->isiVersi(), 'Catatan dibuat', $j->dicatat_oleh ?? $request->user()->id);
        return response()->json(['success' => true, 'message' => 'Catatan pembinaan tercatat di jurnal.', 'data' => $this->lengkapi(collect([$r->fresh(['siswa:id_siswa,nama_siswa', 'pembuat:id,name,id_guru', 'kelas.waliKelas:id_guru,nama_guru'])]), $request)[0]]);
    }

    /** Rincian satu rencana: data lengkap, riwayat versi rencana, dan catatan progres jurnal beserta versinya. */
    public function detail(Request $request, string $id)
    {
        $r = TransPembinaanPresensi::with(['siswa:id_siswa,nama_siswa', 'pembuat:id,name,id_guru', 'kelas:id_kelas,nama_kelas,wali_kelas', 'kelas.waliKelas:id_guru,nama_guru'])->findOrFail($id);
        $baris = $this->lengkapi(collect([$r]), $request)[0];
        $versiJurnal = VersiCatatan::riwayat('jurnal', collect($baris['jurnal_detail'])->pluck('id_jurnal')->all());
        $baris['jurnal_detail'] = collect($baris['jurnal_detail'])->map(fn($j) => $j + [
            // Catatan sensitif yang tidak boleh dibaca akun ini: riwayatnya juga tertutup
            'versi' => $j['narasi_kejadian'] === null ? [] : $versiJurnal->get($j['id_jurnal'], collect())->values(),
        ])->values();
        $baris['riwayat'] = VersiCatatan::riwayat('pembinaan', [$r->id_pembinaan])->get($r->id_pembinaan, collect())->values();
        return response()->json(['data' => $baris]);
    }

    /** Data yang bisa disisipkan ke catatan (dan bahan AI): kehadiran, pola alpa, keterangan, presensi mapel, jurnal, pembinaan lalu. */
    public function konteks(Request $request)
    {
        $request->validate(['id_siswa' => 'required|exists:students,id_siswa', 'id_periode' => 'nullable|exists:master_periode,id_periode', 'kecuali' => 'nullable|string']);
        $siswa = Student::with('kelas:id_kelas,nama_kelas')->findOrFail($request->id_siswa);
        return response()->json(['data' => $this->konteksSiswa($siswa, $request->id_periode, $request, $request->kecuali)]);
    }

    /** Saran AI: rencana (tindakan + latar belakang + checklist) atau draf catatan progres untuk jurnal. */
    public function ai(Request $request, PembinaanAIService $ai)
    {
        $request->validate([
            'bagian' => ['required', Rule::in(['rencana', 'progres'])],
            'ai_mode' => ['required', Rule::in([...PembinaanAIService::MODES, PembinaanAIService::MODE_LOKAL])],
            'id_siswa' => 'required_if:bagian,rencana|nullable|exists:students,id_siswa',
            'id_pembinaan' => 'required_if:bagian,progres|nullable|exists:trans_pembinaan_presensi,id_pembinaan',
            'id_periode' => 'nullable|exists:master_periode,id_periode',
            'arahan' => 'nullable|string|max:1500',
            'tindakan' => 'nullable|array|max:20',
            'tindakan.*' => 'string|max:200',
            'catatan' => 'nullable|string|max:60000',
        ]);
        $pb = $request->id_pembinaan ? TransPembinaanPresensi::findOrFail($request->id_pembinaan) : null;
        $siswa = Student::with('kelas:id_kelas,nama_kelas')->findOrFail($pb?->id_siswa ?? $request->id_siswa);
        $k = $this->konteksSiswa($siswa, $request->id_periode ?? $pb?->id_periode, $request, $pb?->id_pembinaan);
        unset($k['nama_siswa']);
        $k['arahan'] = $request->arahan;

        if ($request->bagian === 'rencana') {
            $k['tindakan_sudah_dipilih'] = $request->tindakan ?? [];
            $k['catatan_sekarang'] = mb_substr(HtmlAman::teks(HtmlAman::bersihkan($request->catatan)), 0, 3000);
            $hasil = $ai->saranRencana($this->samarkanNama($k, $siswa->nama_siswa), $request->ai_mode);
        } else {
            $ef = TransPembinaanPresensi::statusEfektif(collect([$pb]))[$pb->id_pembinaan];
            $sejak = TransPresensi::where('id_siswa', $pb->id_siswa)->where('tanggal', '>=', $pb->tanggal_mulai)->get(['status_kehadiran'])->countBy('status_kehadiran');
            $k['pembinaan'] = ['tindakan' => $pb->tindakan, 'catatan' => mb_substr(HtmlAman::teks($pb->catatan), 0, 2000),
                'tanggal_mulai' => $pb->tanggal_mulai->toDateString(), 'tanggal_tindak_lanjut' => $pb->tanggal_tindak_lanjut->toDateString(),
                'status' => $ef['status'], 'kondisi_awal' => $pb->ringkasan_awal];
            $k['sejak_mulai'] = ['hari' => $sejak->sum(), 'hadir' => $sejak['HADIR'] ?? 0, 'sakit' => $sejak['SAKIT'] ?? 0, 'izin' => $sejak['IZIN'] ?? 0,
                'alpa' => $sejak['ALPA'] ?? 0, 'beruntun' => $ef['beruntun'], 'hari_pulih' => TransPembinaanPresensi::HARI_PULIH];
            $k['catatan_progres_sebelumnya'] = TransJurnal::whereIn('id_jurnal', $pb->jurnal ?? [])->orderBy('tanggal')->get()
                ->filter(fn($j) => $j->bolehDibaca($request->user()))
                ->map(fn($j) => ['tanggal' => $j->tanggal->toDateString(), 'catatan' => mb_substr((string) $j->narasi_kejadian, 0, 600)])->values()->all();
            $hasil = $ai->catatanProgres($this->samarkanNama($k, $siswa->nama_siswa), $request->ai_mode);
        }
        if (!$hasil) return response()->json(['message' => $ai->galat() ?? 'AI belum berhasil menyusun saran.'], 422);
        return response()->json(['success' => true, 'data' => $hasil]);
    }

    /**
     * Simpan catatan progres pembinaan ke jurnal (catatan terpisah, STNKM kosong kecuali respons siswa dianalisis).
     * Tanpa id_jurnal: catatan baru. Dengan id_jurnal: memperbarui catatan itu sebagai versi berikutnya.
     * Terkunci setelah pembinaan selesai atau batal.
     */
    public function progres(Request $request, string $id)
    {
        $r = TransPembinaanPresensi::findOrFail($id);
        $request->validate([
            'id_jurnal' => 'nullable|string',
            'tanggal' => ['required', 'date_format:Y-m-d', 'before_or_equal:' . now(config('app.zona_sekolah'))->toDateString(), new BukanHariMinggu],
            'catatan' => 'required|string|min:10|max:1800',
            'respons' => 'nullable|string|max:600',
            'keterangan_versi' => 'nullable|string|max:300',
            'skor' => 'nullable|array',
            'skor.*' => 'nullable|numeric|between:-5,5',
            'ai_mode' => 'nullable|string|max:20',
            'ai_raw_response' => 'nullable|string|max:10000',
        ], ['tanggal.before_or_equal' => 'Tanggal catatan tidak boleh di masa mendatang.', 'catatan.min' => 'Catatan minimal 10 huruf.']);

        $ef = TransPembinaanPresensi::statusEfektif(collect([$r]))[$r->id_pembinaan];
        abort_if(in_array($ef['status'], ['SELESAI', 'BATAL'], true), 422,
            'Pembinaan ini sudah ' . ($ef['status'] === 'SELESAI' ? 'selesai' : 'dibatalkan') . '; catatannya terkunci.');

        $user = $request->user();
        $respons = trim((string) $request->respons);
        $narasi = Str::limit(trim($request->catatan) . ($respons !== '' ? TransJurnal::PEMISAH_RESPONS . $respons : ''), 2000, '');
        $skor = $request->filled('skor') ? collect(['S', 'T', 'N', 'K', 'M'])->mapWithKeys(fn($d) => ["val_{$d}" => (float) ($request->skor[$d] ?? 0)])->all() : null;
        $nol = ['val_S' => 0, 'val_T' => 0, 'val_N' => 0, 'val_K' => 0, 'val_M' => 0];
        $modeAi = $skor && $request->ai_mode === 'GEMINI' ? 'GEMINI' : 'HEURISTIK';

        if ($request->filled('id_jurnal')) {
            abort_unless(in_array($request->id_jurnal, $r->jurnal ?? [], true), 422, 'Catatan ini bukan bagian dari pembinaan tersebut.');
            $j = TransJurnal::findOrFail($request->id_jurnal);
            $boleh = $this->bolehUbah($request, $r) || $j->dicatat_oleh === $user->id || ($user->isGuru() && $user->id_guru && $j->id_guru === $user->id_guru);
            abort_unless($boleh, 403, 'Catatan ini hanya dapat diperbarui penulisnya, wali kelas, admin, atau kepala sekolah.');
            // Catatan lama yang belum punya riwayat disimpan dulu sebagai versi awal
            if (!VersiCatatan::terakhir('jurnal', $j->id_jurnal)) VersiCatatan::simpan('jurnal', $j->id_jurnal, $j->isiVersi(), 'Catatan awal', $j->dicatat_oleh);
            $data = ['tanggal' => $request->tanggal, 'narasi_kejadian' => $narasi];
            if ($skor) $data += $skor + ['ai_mode' => $modeAi, 'ai_raw_response' => $request->ai_raw_response];
            elseif ($respons === '') $data += $nol; // tanpa respons siswa, STNKM kembali kosong
            $j->update($data);
            $v = VersiCatatan::simpan('jurnal', $j->id_jurnal, $j->fresh()->isiVersi(), $request->keterangan_versi ?: 'Catatan diperbarui', $user->id);
            $pesan = $v ? "Catatan diperbarui (versi {$v->versi})." : 'Tidak ada perubahan pada catatan.';
        } else {
            $j = TransJurnal::create([
                'id_jurnal' => 'JRN-' . Str::uuid(), 'tanggal' => $request->tanggal, 'id_siswa' => $r->id_siswa, 'id_kelas' => $r->id_kelas,
                'id_guru' => $user->isGuru() && $user->id_guru ? $user->id_guru : Classes::whereKey($r->id_kelas)->value('wali_kelas'),
                'narasi_kejadian' => $narasi, 'mode_dampak' => 'PISAH', ...($skor ?? $nol),
                'ai_mode' => $modeAi, 'ai_raw_response' => $skor ? $request->ai_raw_response : null, 'dicatat_oleh' => $user->id,
            ]);
            $r->update(['jurnal' => collect($r->jurnal ?? [])->push($j->id_jurnal)->unique()->values()->all()]);
            VersiCatatan::simpan('jurnal', $j->id_jurnal, $j->isiVersi(), $request->keterangan_versi ?: 'Catatan dibuat', $user->id);
            $pesan = 'Tercatat di jurnal sebagai catatan terpisah (versi 1).';
        }
        return response()->json(['success' => true, 'message' => $pesan, 'id_jurnal' => $j->id_jurnal,
            'data' => $this->lengkapi(collect([$r->fresh(['siswa:id_siswa,nama_siswa', 'pembuat:id,name,id_guru', 'kelas.waliKelas:id_guru,nama_guru'])]), $request)[0]]);
    }

    public function destroy(Request $request, string $id)
    {
        $r = TransPembinaanPresensi::findOrFail($id);
        $this->cekPengubah($request, $r);
        $r->delete(); // jurnal yang sudah tercatat tetap ada di menu Jurnal
        return response()->json(['success' => true, 'message' => 'Rencana pembinaan dihapus. Catatan jurnalnya tetap tersimpan.']);
    }

    // ================= BANTUAN =================

    private function isian(Request $request, ?TransPembinaanPresensi $lama = null): array
    {
        $status = $request->status ?? $lama?->status ?? 'OTOMATIS';
        return [
            'tindakan' => collect($request->tindakan)->map(fn($t) => trim($t))->filter()->unique()->values()->all(),
            'catatan' => HtmlAman::bersihkan($request->catatan),
            'tanggal_mulai' => $request->tanggal_mulai,
            'tanggal_tindak_lanjut' => $request->tanggal_tindak_lanjut,
            'status' => $status,
            'hasil' => $request->hasil,
            'tanggal_selesai' => $status === 'SELESAI' ? ($lama?->tanggal_selesai ?? now(config('app.zona_sekolah'))->toDateString()) : null,
        ];
    }

    /** Status efektif, kemajuan pemulihan, jurnal tertaut (narasi disamarkan bila sensitif), dan hak ubah akun ini. */
    private function lengkapi($data, Request $request): array
    {
        $status = TransPembinaanPresensi::statusEfektif($data);
        $user = $request->user();
        $jurnal = TransJurnal::with(['pencatat:id,name,id_guru', 'guru:id_guru,nama_guru'])->whereIn('id_jurnal', $data->pluck('jurnal')->flatten()->filter()->unique()->values())
            ->get(['id_jurnal', 'tanggal', 'narasi_kejadian', 'sensitif', 'id_kelas', 'id_guru', 'dicatat_oleh', 'mode_dampak', 'val_S', 'val_T', 'val_N', 'val_K', 'val_M', 'updated_at']);
        TransJurnal::samarkan($jurnal, $user);
        $maksVersi = fn(string $entitas, $ids) => TransVersi::where('entitas', $entitas)->whereIn('id_entitas', $ids)->groupBy('id_entitas')
            ->selectRaw('id_entitas, max(versi) as n')->pluck('n', 'id_entitas');
        $versiJurnal = $maksVersi('jurnal', $jurnal->pluck('id_jurnal'));
        $versiRencana = $maksVersi('pembinaan', $data->pluck('id_pembinaan'));
        $jurnal = $jurnal->keyBy('id_jurnal')->map(fn($j) => collect($j->toArray())->except(['pencatat', 'guru'])->all() + [
            // Guru yang tercatat dan akun penginput (tampil "Guru · diisi Akun" bila berbeda)
            'guru_nama' => $j->guru?->nama_guru, 'pencatat_nama' => $j->pencatat?->name, 'pencatat_id_guru' => $j->pencatat?->id_guru,
            'versi_terakhir' => (int) ($versiJurnal[$j->id_jurnal] ?? 0),
            'isi' => $j->narasi_kejadian === null ? null : $j->isiVersi(),
            'boleh_perbarui' => $j->dicatat_oleh === $user->id || ($user->isGuru() && $user->id_guru && $j->id_guru === $user->id_guru),
        ]);
        $hariIni = now(config('app.zona_sekolah'))->toDateString();
        return $data->map(fn($r) => $r->toArray() + [
            'efektif' => $status[$r->id_pembinaan],
            'perlu_tindak_lanjut' => in_array($status[$r->id_pembinaan]['status'], ['DIRENCANAKAN', 'BERLANGSUNG'], true) && $r->tanggal_tindak_lanjut->toDateString() <= $hariIni,
            'jurnal_detail' => collect($r->jurnal ?? [])->map(fn($id) => $jurnal[$id] ?? null)->filter()->values(),
            'boleh_ubah' => $this->bolehUbah($request, $r),
            'catatan_teks' => HtmlAman::teks($r->catatan),
            'versi_terakhir' => (int) ($versiRencana[$r->id_pembinaan] ?? 0),
            'terkunci' => in_array($status[$r->id_pembinaan]['status'], ['SELESAI', 'BATAL'], true),
        ])->values()->all();
    }

    private function catatVersi(Request $request, TransPembinaanPresensi $r, string $bawaan): void
    {
        $r->refresh();
        LampiranController::tautkan('pembinaan', $r->id_pembinaan, $r->catatan);
        VersiCatatan::simpan('pembinaan', $r->id_pembinaan, [
            'tindakan' => $r->tindakan, 'catatan' => $r->catatan, 'tanggal_mulai' => $r->tanggal_mulai->toDateString(),
            'tanggal_tindak_lanjut' => $r->tanggal_tindak_lanjut->toDateString(), 'status' => $r->status, 'hasil' => $r->hasil,
        ], $request->input('keterangan_versi') ?: $bawaan, $request->user()->id);
    }

    private const HARI = [1 => 'Senin', 2 => 'Selasa', 3 => 'Rabu', 4 => 'Kamis', 5 => 'Jumat', 6 => 'Sabtu', 7 => 'Minggu'];

    private function konteksSiswa(Student $siswa, ?string $idPeriode, Request $request, ?string $kecuali = null): array
    {
        $presensi = TransPresensi::where('id_siswa', $siswa->id_siswa)->when($idPeriode, fn($q) => $q->where('id_periode', $idPeriode))
            ->orderBy('tanggal')->get(['tanggal', 'status_kehadiran', 'keterangan']);
        $hitung = $presensi->countBy('status_kehadiran');
        $n = $presensi->count();
        $alpa = $presensi->where('status_kehadiran', 'ALPA');
        $mapel = TransPresensiMapel::with('mapel:id_mapel,nama_mapel')->where('id_siswa', $siswa->id_siswa)->where('status_kehadiran', '!=', 'HADIR')
            ->when($idPeriode, fn($q) => $q->where('id_periode', $idPeriode))->get(['id_mapel', 'status_kehadiran']);
        $jurnal = TransJurnal::where('id_siswa', $siswa->id_siswa)->orderByDesc('tanggal')->orderByDesc('created_at')->limit(10)->get();
        return [
            'nama_siswa' => $siswa->nama_siswa,
            'kelas' => $siswa->kelas?->nama_kelas,
            'ringkasan' => ['hari' => $n, 'hadir' => $hitung['HADIR'] ?? 0, 'sakit' => $hitung['SAKIT'] ?? 0, 'izin' => $hitung['IZIN'] ?? 0,
                'alpa' => $hitung['ALPA'] ?? 0, 'persen' => $n ? round(($hitung['HADIR'] ?? 0) / $n * 100) : null],
            'alpa_per_hari' => collect([1, 2, 3, 4, 5])->mapWithKeys(fn($i) => [self::HARI[$i] => $alpa->filter(fn($p) => $p->tanggal->dayOfWeekIso === $i)->count()])->all(),
            'tidak_hadir_terakhir' => $presensi->where('status_kehadiran', '!=', 'HADIR')->sortByDesc(fn($p) => $p->tanggal->toDateString())->take(10)
                ->map(fn($p) => ['tanggal' => $p->tanggal->toDateString(), 'hari' => self::HARI[$p->tanggal->dayOfWeekIso], 'status' => $p->status_kehadiran, 'keterangan' => $p->keterangan])
                ->values()->all(),
            'mapel_tidak_hadir' => $mapel->groupBy('id_mapel')->map(fn($g) => ['mapel' => $g->first()->mapel?->nama_mapel ?? $g->first()->id_mapel,
                'jumlah' => $g->count(), 'alpa' => $g->where('status_kehadiran', 'ALPA')->count()])->sortByDesc('jumlah')->values()->all(),
            'jurnal_terbaru' => $jurnal->filter(fn($j) => $j->bolehDibaca($request->user()))->take(6)
                ->map(fn($j) => ['tanggal' => $j->tanggal->toDateString(), 'narasi' => Str::limit((string) $j->narasi_kejadian, 300)])->values()->all(),
            'pembinaan_sebelumnya' => TransPembinaanPresensi::where('id_siswa', $siswa->id_siswa)->when($kecuali, fn($q) => $q->where('id_pembinaan', '!=', $kecuali))
                ->orderByDesc('tanggal_mulai')->limit(5)->get()
                ->map(fn($p) => ['tanggal_mulai' => $p->tanggal_mulai->toDateString(), 'tindakan' => $p->tindakan, 'status' => $p->status, 'hasil' => $p->hasil])->values()->all(),
        ];
    }

    /** Nama siswa tidak dikirim ke penyedia AI: setiap bagian namanya diganti "Ananda". */
    private function samarkanNama(array $k, string $nama): array
    {
        $bagian = collect(preg_split('/\s+/u', $nama))->filter(fn($x) => mb_strlen($x) >= 3)->map(fn($x) => preg_quote($x, '/'))->all();
        if (!$bagian) return $k;
        $pola = '/\b(' . implode('|', $bagian) . ')\b/iu';
        array_walk_recursive($k, function (&$v) use ($pola) { if (is_string($v)) $v = preg_replace($pola, 'Ananda', $v); });
        return $k;
    }

    private function bolehUbah(Request $request, TransPembinaanPresensi $r): bool
    {
        $u = $request->user();
        return $u->isAdmin() || $u->isKepsek() || $r->dibuat_oleh === $u->id || ($u->isGuru() && in_array($r->id_kelas, $u->kelasBinaan(), true));
    }

    private function cekPengubah(Request $request, TransPembinaanPresensi $r): void
    {
        abort_unless($this->bolehUbah($request, $r), 403, 'Rencana pembinaan hanya dapat diubah pembuatnya, wali kelas siswa, admin, atau kepala sekolah.');
    }
}

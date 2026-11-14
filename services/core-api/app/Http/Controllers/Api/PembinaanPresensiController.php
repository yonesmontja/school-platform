<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Student;
use App\Models\TransJurnal;
use App\Models\TransPembinaanPresensi;
use App\Models\TransPresensi;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

/**
 * Rencana pembinaan siswa yang kehadirannya perlu perhatian: tindakan (pilihan + tulisan guru), tanggal mulai &
 * tindak lanjut, status (Otomatis/Berlangsung/Selesai/Batal), hasil, dan jurnal yang mencatat tiap langkahnya.
 * Semua staf boleh merencanakan; mengubah/menghapus hanya pembuatnya, wali kelas siswa, admin, atau kepala sekolah.
 */
class PembinaanPresensiController extends Controller
{
    public function index(Request $request)
    {
        $request->validate(['id_kelas' => 'required|exists:classes,id_kelas', 'id_periode' => 'nullable|exists:master_periode,id_periode']);
        $data = TransPembinaanPresensi::with(['siswa:id_siswa,nama_siswa', 'pembuat:id,name'])
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
            'catatan' => 'nullable|string|max:2000',
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
        return response()->json(['success' => true, 'message' => 'Rencana pembinaan disimpan.', 'data' => $this->lengkapi(collect([$r->load(['siswa:id_siswa,nama_siswa', 'pembuat:id,name'])]), $request)[0]], 201);
    }

    public function update(Request $request, string $id)
    {
        $r = TransPembinaanPresensi::findOrFail($id);
        $this->cekPengubah($request, $r);
        $request->validate($this->rules(), self::PESAN);
        $r->update($this->isian($request, $r));
        return response()->json(['success' => true, 'message' => 'Rencana pembinaan diperbarui.', 'data' => $this->lengkapi(collect([$r->fresh(['siswa:id_siswa,nama_siswa', 'pembuat:id,name'])]), $request)[0]]);
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
        return response()->json(['success' => true, 'message' => 'Status pembinaan diperbarui.', 'data' => $this->lengkapi(collect([$r->fresh(['siswa:id_siswa,nama_siswa', 'pembuat:id,name'])]), $request)[0]]);
    }

    /** Tautkan jurnal (dibuat lewat /jurnal/store) sebagai catatan langkah pembinaan ini. */
    public function tautJurnal(Request $request, string $id)
    {
        $r = TransPembinaanPresensi::findOrFail($id);
        $request->validate(['id_jurnal' => 'required|exists:trans_jurnal,id_jurnal']);
        $j = TransJurnal::findOrFail($request->id_jurnal);
        abort_unless($j->id_siswa === $r->id_siswa, 422, 'Jurnal ini bukan milik siswa yang dibina.');
        $r->update(['jurnal' => collect($r->jurnal ?? [])->push($j->id_jurnal)->unique()->values()->all()]);
        return response()->json(['success' => true, 'message' => 'Catatan pembinaan tercatat di jurnal.', 'data' => $this->lengkapi(collect([$r->fresh(['siswa:id_siswa,nama_siswa', 'pembuat:id,name'])]), $request)[0]]);
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
            'catatan' => $request->catatan,
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
        $jurnal = TransJurnal::whereIn('id_jurnal', $data->pluck('jurnal')->flatten()->filter()->unique()->values())->get(['id_jurnal', 'tanggal', 'narasi_kejadian', 'sensitif', 'id_kelas', 'id_guru', 'mode_dampak', 'val_S', 'val_T', 'val_N', 'val_K', 'val_M']);
        TransJurnal::samarkan($jurnal, $request->user());
        $jurnal = $jurnal->keyBy('id_jurnal');
        $hariIni = now(config('app.zona_sekolah'))->toDateString();
        return $data->map(fn($r) => $r->toArray() + [
            'efektif' => $status[$r->id_pembinaan],
            'perlu_tindak_lanjut' => in_array($status[$r->id_pembinaan]['status'], ['DIRENCANAKAN', 'BERLANGSUNG'], true) && $r->tanggal_tindak_lanjut->toDateString() <= $hariIni,
            'jurnal_detail' => collect($r->jurnal ?? [])->map(fn($id) => $jurnal[$id] ?? null)->filter()->values(),
            'boleh_ubah' => $this->bolehUbah($request, $r),
        ])->values()->all();
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

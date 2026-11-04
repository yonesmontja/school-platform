<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\SchoolSetting;
use App\Models\TransJadwal;
use App\Models\TransNilai;
use App\Models\TransRencanaRemedial;
use App\Services\PesanRemedialService;
use App\Services\RemedialService;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

/**
 * Rencana tindak lanjut untuk siswa yang belum mencapai KKM. Rencana bisa dibuat untuk
 * satu siswa atau sekelompok siswa sekaligus; sesi pelaksanaannya otomatis masuk ke Jadwal.
 */
class RemedialController extends Controller
{
    private const WARNA_JADWAL = '#e65100';

    private function rules(): array
    {
        return [
            'opsi_tindakan' => ['required', Rule::in(TransRencanaRemedial::OPSI)],
            'catatan' => 'nullable|string|max:2000',
            'tanggal_rencana' => 'required|date_format:Y-m-d',
            'masuk_jadwal' => 'nullable|boolean',
            'jam_mulai' => 'nullable|required_if:masuk_jadwal,true|date_format:H:i',
            'jam_selesai' => 'nullable|required_if:masuk_jadwal,true|date_format:H:i|after:jam_mulai',
            'id_ruangan' => 'nullable|exists:master_ruangan,id_ruangan',
        ];
    }

    private function pesan(): array
    {
        return [
            'jam_mulai.required_if' => 'Tentukan jam mulai sesi agar rencana bisa masuk ke Jadwal.',
            'jam_selesai.required_if' => 'Tentukan jam selesai sesi.',
            'jam_selesai.after' => 'Jam selesai harus setelah jam mulai.',
        ];
    }

    public function store(Request $request)
    {
        $request->validate($this->rules() + [
            'id_nilai' => 'required|array|min:1',
            'id_nilai.*' => 'distinct|exists:trans_nilai,id_nilai',
        ], $this->pesan());

        $nilai = TransNilai::with(['mapel', 'siswa:id_siswa,nama_siswa', 'rencana'])->whereIn('id_nilai', $request->id_nilai)->get();
        if ($nilai->pluck('id_mapel')->unique()->count() > 1 || $nilai->pluck('id_kelas')->unique()->count() > 1) {
            return response()->json(['message' => 'Rencana kelompok hanya untuk siswa dari kelas dan mata pelajaran yang sama.'], 422);
        }
        foreach ($nilai as $n) {
            $this->cekMapel($request, $n->id_mapel);
            if ((float) $n->nilai >= (float) ($n->mapel?->kkm ?? 75)) {
                return response()->json(['message' => "Nilai {$n->siswa?->nama_siswa} sudah mencapai KKM."], 422);
            }
            if (in_array($n->id_jenis, TransNilai::jenisDiagnostik(), true)) {
                return response()->json(['message' => 'Nilai asesmen diagnostik dipakai untuk pemetaan & pengelompokan (menu Asesmen Diagnostik), bukan remedial.'], 422);
            }
            if ($n->rencana) {
                return response()->json(['message' => "{$n->siswa?->nama_siswa} sudah punya rencana tindak lanjut untuk nilai ini."], 422);
            }
        }

        $rencana = DB::transaction(function () use ($request, $nilai) {
            $idJadwal = $request->boolean('masuk_jadwal') ? $this->buatJadwal($request, $nilai)->id_jadwal : null;
            return $nilai->map(fn($n) => TransRencanaRemedial::create([
                'id_rencana' => 'RMD-' . Str::uuid(),
                'id_nilai_asal' => $n->id_nilai,
                'id_siswa' => $n->id_siswa,
                'id_mapel' => $n->id_mapel,
                'opsi_tindakan' => $request->opsi_tindakan,
                'catatan' => $request->catatan,
                'tanggal_rencana' => $request->tanggal_rencana,
                'id_jadwal' => $idJadwal,
                'dibuat_oleh' => $request->user()->id,
            ]));
        });

        return response()->json([
            'success' => true,
            'message' => "Rencana tindak lanjut disimpan untuk {$rencana->count()} siswa" . ($request->boolean('masuk_jadwal') ? ' dan dijadwalkan.' : '.'),
            'data' => $rencana,
        ]);
    }

    public function update(Request $request, string $id)
    {
        $request->validate($this->rules(), $this->pesan());
        $rencana = TransRencanaRemedial::with(['jadwal', 'nilaiAsal.mapel', 'siswa:id_siswa,nama_siswa'])->findOrFail($id);
        $this->cekMapel($request, $rencana->id_mapel);

        DB::transaction(function () use ($request, $rencana) {
            $jadwalLama = $rencana->jadwal;
            $idJadwal = $rencana->id_jadwal;

            if (!$request->boolean('masuk_jadwal')) {
                $idJadwal = null;
            } elseif (!$jadwalLama) {
                $idJadwal = $this->buatJadwal($request, collect([$rencana->nilaiAsal->setRelation('siswa', $rencana->siswa)]))->id_jadwal;
            } else {
                [$mulai, $selesai] = $this->rentang($request);
                $berubah = !$jadwalLama->mulai->eq($mulai) || !$jadwalLama->selesai->eq($selesai);
                $dipakaiBersama = TransRencanaRemedial::where('id_jadwal', $jadwalLama->id_jadwal)->where('id_rencana', '!=', $rencana->id_rencana)->exists();
                if ($berubah && $dipakaiBersama) {
                    // Sesi kelompok tetap untuk siswa lain; siswa ini dipindah ke sesi tersendiri
                    $idJadwal = $this->buatJadwal($request, collect([$rencana->nilaiAsal->setRelation('siswa', $rencana->siswa)]))->id_jadwal;
                } else {
                    $jadwalLama->update([
                        'mulai' => $mulai, 'selesai' => $selesai,
                        'id_ruangan' => $request->id_ruangan,
                        ...(!$dipakaiBersama ? ['judul' => $this->judul($request->opsi_tindakan, collect([$rencana->siswa?->nama_siswa]))] : []),
                    ]);
                }
            }

            $rencana->update([
                'opsi_tindakan' => $request->opsi_tindakan,
                'catatan' => $request->catatan,
                'tanggal_rencana' => $request->tanggal_rencana,
                'id_jadwal' => $idJadwal,
            ]);
            if ($jadwalLama && $jadwalLama->id_jadwal !== $idJadwal) RemedialService::bersihkanJadwal([$jadwalLama->id_jadwal]);
        });

        return response()->json(['success' => true, 'message' => 'Rencana tindak lanjut diperbarui.', 'data' => $rencana->fresh()]);
    }

    public function destroy(Request $request, string $id)
    {
        $rencana = TransRencanaRemedial::with('nilaiRemedial')->findOrFail($id);
        $this->cekMapel($request, $rencana->id_mapel);
        if ($rencana->nilaiRemedial) {
            return response()->json(['message' => 'Rencana ini sudah punya nilai remedial. Hapus nilai remedialnya terlebih dahulu.'], 422);
        }

        DB::transaction(function () use ($rencana) {
            $idJadwal = $rencana->id_jadwal;
            $rencana->delete();
            RemedialService::bersihkanJadwal([$idJadwal]);
        });

        return response()->json(['success' => true, 'message' => 'Rencana tindak lanjut dibatalkan.']);
    }

    /**
     * Pesan WhatsApp untuk orang tua/wali: RENCANA (rencana baru dibuat) atau HASIL (nilai remedial sudah dicatat).
     * Frontend mengirimnya lewat /whatsapp bila Fonnte aktif, atau membuka chat WA satu per satu.
     */
    public function notifikasi(Request $request, PesanRemedialService $pesan)
    {
        $request->validate([
            'jenis' => 'required|in:RENCANA,HASIL',
            'id_rencana' => 'required|array|min:1|max:50',
            'id_rencana.*' => 'string',
        ]);

        $rencana = TransRencanaRemedial::with(PesanRemedialService::RELASI)->whereIn('id_rencana', $request->id_rencana)->get();
        foreach ($rencana as $r) $this->cekMapel($request, $r->id_mapel);
        if ($request->jenis === 'HASIL') $rencana = $rencana->filter(fn($r) => $r->nilaiRemedial);

        $settings = SchoolSetting::first();
        return response()->json([
            'wa_otomatis' => (bool) ($settings?->status_wa_api && $settings?->wa_api_token),
            'data' => $rencana->map(fn($r) => $pesan->susun($r, $request->jenis, $request->user()))->values(),
        ]);
    }

    private function cekMapel(Request $request, ?string $idMapel): void
    {
        abort_unless($request->user()->bolehNilaiMapel($idMapel), 403, 'Anda hanya dapat mengelola tindak lanjut mata pelajaran yang Anda ampu.');
    }

    private function rentang(Request $request): array
    {
        return [
            Carbon::parse("{$request->tanggal_rencana} {$request->jam_mulai}"),
            Carbon::parse("{$request->tanggal_rencana} {$request->jam_selesai}"),
        ];
    }

    private function judul(string $opsi, Collection $nama): string
    {
        $siapa = $nama->count() === 1 ? $nama->first() : "{$nama->count()} siswa";
        return Str::limit("Remedial · {$opsi}: {$siapa}", 150, '');
    }

    /**
     * Satu sesi jadwal untuk sekelompok nilai (kelas & mapel sama). Guru pemilik sesi:
     * akun guru yang membuatnya, atau guru pengampu mapel bila dibuat admin/kepsek.
     */
    private function buatJadwal(Request $request, Collection $nilai): TransJadwal
    {
        [$mulai, $selesai] = $this->rentang($request);
        $contoh = $nilai->first();
        $user = $request->user();
        $daftar = $nilai->map(fn($n) => '- ' . ($n->siswa?->nama_siswa ?? $n->id_siswa) . ' (nilai ' . (float) $n->nilai . ')')->implode("\n");

        return TransJadwal::create([
            'id_jadwal' => 'JDW-' . Str::uuid(),
            'id_periode' => $contoh->id_periode,
            'id_kelas' => $contoh->id_kelas,
            'id_guru' => $user->isGuru() ? $user->id_guru : $contoh->mapel?->id_guru,
            'id_mapel' => $contoh->id_mapel,
            'id_materi' => $contoh->id_materi,
            'id_ruangan' => $request->id_ruangan,
            'judul' => $this->judul($request->opsi_tindakan, $nilai->map(fn($n) => $n->siswa?->nama_siswa ?? $n->id_siswa)),
            'mulai' => $mulai,
            'selesai' => $selesai,
            'warna' => self::WARNA_JADWAL,
            'catatan' => trim("Tindak lanjut: {$request->opsi_tindakan}\n" . ($request->catatan ? "{$request->catatan}\n" : '') . "\nSiswa:\n{$daftar}"),
            'status_sesi' => 'Menunggu',
        ]);
    }
}

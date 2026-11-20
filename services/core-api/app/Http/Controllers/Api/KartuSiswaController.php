<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Classes;
use App\Models\MasterPeriode;
use App\Models\SchoolSetting;
use App\Models\Student;
use App\Services\AuditTrail;
use Illuminate\Http\Request;

/**
 * Kartu pelajar berfoto & ber-QR: data cetak untuk admin, kepala sekolah, dan wali kelas (kelas binaannya),
 * serta verifikasi publik dari kode QR di kartu.
 */
class KartuSiswaController extends Controller
{
    public function index(Request $request)
    {
        $request->validate(['id_kelas' => 'nullable|string|max:50', 'id_siswa' => 'nullable|array|max:500', 'id_siswa.*' => 'string|max:50']);
        $u = $request->user();
        abort_unless($u->isAdmin() || $u->isKepsek() || ($u->isGuru() && $u->kelasBinaan()), 403, 'Kartu pelajar dicetak oleh admin, kepala sekolah, atau wali kelas.');
        $bolehKelas = ($u->isAdmin() || $u->isKepsek()) ? null : $u->kelasBinaan();

        $siswa = Student::with('kelas:id_kelas,nama_kelas')
            ->when($request->id_kelas, fn($q) => $q->where('id_kelas', $request->id_kelas))
            ->when($request->id_siswa, fn($q) => $q->whereIn('id_siswa', $request->id_siswa))
            ->when($bolehKelas !== null, fn($q) => $q->whereIn('id_kelas', $bolehKelas))
            ->orderBy('id_kelas')->orderBy('nama_siswa')
            ->get(['id_siswa', 'nisn', 'nama_siswa', 'id_kelas', 'jenis_kelamin', 'tempat_lahir', 'tgl_lahir', 'foto_path', 'foto_diperbarui']);
        abort_if($siswa->isEmpty(), 404, 'Tidak ada siswa untuk dicetak (periksa kelas yang dipilih).');

        $periode = MasterPeriode::where('status_aktif', 'AKTIF')->first();
        AuditTrail::catat([
            'aksi' => 'CETAK_KARTU', 'kategori' => 'OUTPUT', 'modul' => 'Siswa',
            'deskripsi' => "Mencetak kartu pelajar untuk {$siswa->count()} siswa",
            'meta' => ['id_kelas' => $request->id_kelas, 'jumlah' => $siswa->count()],
        ]);

        return response()->json([
            'tahun_ajaran' => $periode?->tahun_ajaran,
            'data' => $siswa->map(fn($s) => [
                'id_siswa' => $s->id_siswa,
                'nama_siswa' => $s->nama_siswa,
                'nisn' => $s->nisn,
                'kelas' => $s->kelas?->nama_kelas,
                'jenis_kelamin' => $s->jenis_kelamin,
                'ttl' => trim(($s->tempat_lahir ?: '') . ($s->tgl_lahir ? ', ' . \Carbon\Carbon::parse($s->tgl_lahir)->locale('id')->translatedFormat('j F Y') : ''), ', ') ?: null,
                'foto_url' => $s->foto_url,
                'kode' => $s->kodeKartu(),
            ])->values(),
        ]);
    }

    /** Publik: cek kartu pelajar dari kode QR. Hanya data yang memang tercetak di kartu. */
    public function verifikasi(string $kode)
    {
        $kode = strtoupper($kode);
        $siswa = Student::with('kelas:id_kelas,nama_kelas')->get(['id_siswa', 'nama_siswa', 'id_kelas', 'foto_path', 'foto_diperbarui'])
            ->first(fn($s) => hash_equals($s->kodeKartu(), $kode));
        if (!$siswa) return response()->json(['message' => 'Kode kartu tidak ditemukan. Kartu ini tidak tercatat atau siswa sudah tidak terdaftar.'], 404);
        $nonaktif = $siswa->id_kelas ? in_array($siswa->id_kelas, Classes::idNonaktif(), true) : true;
        return response()->json(['data' => [
            'nama_siswa' => $siswa->nama_siswa,
            'kelas' => $siswa->kelas?->nama_kelas,
            'aktif' => !$nonaktif,
            'foto_url' => $siswa->foto_url,
            'sekolah' => SchoolSetting::first()?->nama_sekolah,
            'tahun_ajaran' => MasterPeriode::where('status_aktif', 'AKTIF')->value('tahun_ajaran'),
        ]]);
    }
}

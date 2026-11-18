<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\MasterAgama;
use App\Models\MasterPekerjaan;
use App\Models\MasterSuku;
use App\Models\SpmbBerkas;
use App\Models\SpmbGelombang;
use App\Models\SpmbPendaftar;
use App\Models\Student;
use App\Services\AuditTrail;
use App\Support\Spmb;
use Illuminate\Database\QueryException;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/**
 * SPMB tanpa login (Fase 26 Tahap B): calon murid/orang tua mengisi formulir, lalu memakai nomor pendaftaran +
 * kode akses untuk melihat status, memperbaiki data, mengunggah berkas, dan mengonfirmasi daftar ulang.
 * Kode akses hanya ditampilkan sekali saat mendaftar; yang disimpan hanyalah hash-nya.
 */
class SpmbPublikController extends Controller
{
    private const HURUF_KODE = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

    /** Aturan isian data pendaftar; dipakai juga operator saat merapikan data. */
    public static function aturanData(bool $sebagian = false): array
    {
        $wajib = $sebagian ? 'sometimes|required' : 'required';
        return [
            'nama_siswa' => "$wajib|string|max:255",
            'panggilan' => 'nullable|string|max:100',
            'nisn' => 'nullable|digits:10',
            'jenis_kelamin' => "$wajib|in:L,P",
            'tempat_lahir' => "$wajib|string|max:100",
            'tgl_lahir' => "$wajib|date|before:today|after:1990-01-01",
            'id_agama' => 'nullable|exists:master_agama,id_agama',
            'id_suku' => 'nullable|exists:master_suku,id_suku',
            'sekolah_asal' => 'nullable|string|max:255',
            'alamat' => "$wajib|string|max:1000",
            'nama_ayah' => 'nullable|string|max:255',
            'id_pekerjaan_ayah' => 'nullable|exists:master_pekerjaan,id_pekerjaan',
            'nama_ibu' => 'nullable|string|max:255',
            'id_pekerjaan_ibu' => 'nullable|exists:master_pekerjaan,id_pekerjaan',
            'nama_wali' => 'nullable|string|max:255',
            'id_pekerjaan_wali' => 'nullable|exists:master_pekerjaan,id_pekerjaan',
            'no_wa' => ["$wajib", 'regex:/^\+?[0-9]{9,15}$/'],
        ];
    }

    public const PESAN = [
        'nisn.digits' => 'NISN terdiri dari 10 angka. Kosongkan bila belum punya.',
        'no_wa.regex' => 'Nomor WhatsApp hanya angka (9–15 digit), boleh diawali +.',
        'tgl_lahir.before' => 'Tanggal lahir tidak valid.',
        'tgl_lahir.after' => 'Tanggal lahir tidak valid.',
    ];

    /** Nama ayah, ibu, atau wali: minimal satu terisi. */
    public static function cekKeluarga(array $data, ?SpmbPendaftar $lama = null): void
    {
        $nilai = fn($k) => array_key_exists($k, $data) ? $data[$k] : $lama?->$k;
        if (!filled($nilai('nama_ayah')) && !filled($nilai('nama_ibu')) && !filled($nilai('nama_wali'))) {
            throw ValidationException::withMessages(['nama_ibu' => 'Isi minimal nama ayah, nama ibu, atau nama wali.']);
        }
    }

    /** NISN tidak boleh milik siswa yang sudah ada atau pendaftar lain di gelombang yang sama. */
    public static function cekNisn(?string $nisn, int $idGelombang, ?int $kecuali = null): void
    {
        if (!filled($nisn)) return;
        if (Student::where('nisn', $nisn)->exists()) {
            throw ValidationException::withMessages(['nisn' => 'NISN ini sudah terdaftar sebagai siswa sekolah.']);
        }
        $ganda = SpmbPendaftar::where('id_gelombang', $idGelombang)->where('nisn', $nisn)
            ->when($kecuali, fn($q) => $q->whereKeyNot($kecuali))->value('nomor_daftar');
        if ($ganda) {
            throw ValidationException::withMessages(['nisn' => "NISN ini sudah dipakai pendaftaran {$ganda}. Cek status dengan nomor tersebut."]);
        }
    }

    /** Kode akses 6 huruf/angka tanpa karakter yang mudah tertukar (O/0, I/1, L). */
    public static function buatKode(): string
    {
        return collect(range(1, 6))->map(fn() => self::HURUF_KODE[random_int(0, strlen(self::HURUF_KODE) - 1)])->implode('');
    }

    // GET /spmb/info
    public function info()
    {
        $hariIni = now(config('app.zona_sekolah'))->toDateString();
        $gelombang = SpmbGelombang::where('tgl_tutup', '>=', $hariIni)->orderBy('tgl_buka')->get()
            ->map(fn($g) => $this->gelombangPublik($g));

        return response()->json(['data' => [
            'gelombang' => $gelombang,
            'jenis_berkas' => collect(Spmb::BERKAS)->map(fn($nama, $kode) => compact('kode', 'nama'))->values(),
            'agama' => MasterAgama::orderBy('id_agama')->get(['id_agama', 'nama_agama']),
            'suku' => MasterSuku::orderBy('nama_suku')->get(['id_suku', 'nama_suku']),
            'pekerjaan' => MasterPekerjaan::orderBy('id_pekerjaan')->get(['id_pekerjaan', 'nama_pekerjaan']),
        ]]);
    }

    // POST /spmb/daftar
    public function daftar(Request $request)
    {
        $data = $request->validate(['id_gelombang' => 'required|integer'] + self::aturanData(), self::PESAN);
        $gelombang = SpmbGelombang::find($data['id_gelombang']);
        if (!$gelombang || !$gelombang->sedangBuka()) {
            throw ValidationException::withMessages(['id_gelombang' => 'Gelombang pendaftaran ini sedang tidak dibuka.']);
        }
        self::cekKeluarga($data);
        self::cekNisn($data['nisn'] ?? null, $gelombang->id);

        $kode = self::buatKode();
        $tahun = preg_match('/^(\d{4})/', $gelombang->tahun_ajaran, $m) ? $m[1] : now()->format('Y');

        // Nomor urut per tahun ajaran; bila dua pendaftar bersamaan mendapat nomor sama, coba nomor berikutnya
        $pendaftar = null;
        for ($coba = 0; $coba < 5 && !$pendaftar; $coba++) {
            $urut = SpmbPendaftar::where('nomor_daftar', 'like', "SPMB-{$tahun}-%")->count() + 1 + $coba;
            try {
                $pendaftar = DB::transaction(fn() => SpmbPendaftar::create([
                    ...collect($data)->except('id_gelombang')->all(),
                    'id_gelombang' => $gelombang->id,
                    'nama_siswa' => trim($data['nama_siswa']),
                    'nomor_daftar' => sprintf('SPMB-%s-%04d', $tahun, $urut),
                    'kode_akses' => Hash::make($kode),
                    'status' => 'DIAJUKAN',
                ]));
            } catch (QueryException $e) {
                if (!str_contains($e->getMessage(), 'nomor_daftar')) throw $e;
            }
        }
        abort_unless($pendaftar, 503, 'Pendaftaran sedang ramai. Silakan coba lagi sebentar.');

        AuditTrail::catat([
            'user' => null, 'kategori' => 'DATA', 'aksi' => 'TAMBAH', 'modul' => 'SPMB',
            'deskripsi' => "Formulir SPMB dikirim: {$pendaftar->nama_siswa} ({$pendaftar->nomor_daftar})",
            'metode' => 'POST', 'rute' => '/' . $request->path(), 'status_http' => 201,
        ]);

        return response()->json([
            'message' => 'Pendaftaran terkirim.',
            'data' => ['nomor_daftar' => $pendaftar->nomor_daftar, 'kode_akses' => $kode, 'status' => $this->statusPublik($pendaftar)],
        ], 201);
    }

    // POST /spmb/status
    public function status(Request $request)
    {
        return response()->json(['data' => $this->ringkas($this->masuk($request))]);
    }

    // PUT /spmb/data
    public function ubah(Request $request)
    {
        $p = $this->masuk($request);
        $this->bolehUbah($p);
        $data = $request->validate(self::aturanData(true), self::PESAN);
        self::cekKeluarga($data, $p);
        if (array_key_exists('nisn', $data)) self::cekNisn($data['nisn'], $p->id_gelombang, $p->id);
        $p->update(collect($data)->only(array_keys(self::aturanData()))->all());

        $this->catatPendaftar($request, $p, 'UBAH', 'Pendaftar SPMB memperbaiki data');
        return response()->json(['message' => 'Data diperbarui.', 'data' => $this->ringkas($p->fresh())]);
    }

    // POST /spmb/berkas (multipart)
    public function unggah(Request $request)
    {
        $p = $this->masuk($request);
        $this->bolehUbah($p);
        $request->validate([
            'jenis' => ['required', Rule::in(array_keys(Spmb::BERKAS))],
            'berkas' => 'required|file|max:' . (Spmb::MAKS_BYTE / 1024),
        ], ['berkas.max' => 'Ukuran berkas maksimal 5 MB.', 'berkas.uploaded' => 'Berkas gagal diunggah (maksimal 5 MB).']);

        $file = $request->file('berkas');
        $mime = (new \finfo(FILEINFO_MIME_TYPE))->file($file->getRealPath());
        if (!isset(Spmb::MIME[$mime])) {
            throw ValidationException::withMessages(['berkas' => 'Hanya foto (JPG/PNG/WEBP) atau PDF yang dapat diunggah.']);
        }

        $path = "spmb/{$p->id}/" . Str::random(24) . '.' . Spmb::MIME[$mime];
        Storage::disk('local')->put($path, file_get_contents($file->getRealPath()));

        $lama = SpmbBerkas::where('id_pendaftar', $p->id)->where('jenis', $request->jenis)->first();
        $isian = ['path' => $path, 'nama_asli' => mb_substr((string) $file->getClientOriginalName(), 0, 200), 'mime' => $mime,
            'ukuran' => $file->getSize(), 'status' => 'MENUNGGU', 'catatan' => null];
        if ($lama) {
            $pathLama = $lama->path;
            $lama->update($isian);
            Storage::disk('local')->delete($pathLama);
        } else {
            SpmbBerkas::create($isian + ['id_pendaftar' => $p->id, 'jenis' => $request->jenis]);
        }

        $this->catatPendaftar($request, $p, 'UNGGAH', 'Pendaftar SPMB mengunggah ' . Spmb::BERKAS[$request->jenis]);
        return response()->json(['message' => Spmb::BERKAS[$request->jenis] . ' terunggah.', 'data' => $this->ringkas($p->fresh())], 201);
    }

    // POST /spmb/ajukan-ulang — setelah memperbaiki data/berkas yang diminta operator
    public function ajukanUlang(Request $request)
    {
        $p = $this->masuk($request);
        if ($p->status !== 'PERLU_PERBAIKAN') {
            throw ValidationException::withMessages(['status' => 'Pendaftaran ini tidak sedang diminta perbaikan.']);
        }
        $p->update(['status' => 'DIAJUKAN']);
        $this->catatPendaftar($request, $p, 'UBAH', 'Pendaftar SPMB mengirim ulang setelah perbaikan');
        return response()->json(['message' => 'Perbaikan terkirim. Operator akan memeriksanya kembali.', 'data' => $this->ringkas($p->fresh())]);
    }

    // POST /spmb/daftar-ulang — konfirmasi pendaftar yang diterima
    public function daftarUlang(Request $request)
    {
        $p = $this->masuk($request);
        if ($p->status !== 'DITERIMA' || !$p->gelombang->diumumkan_at) {
            throw ValidationException::withMessages(['status' => 'Daftar ulang hanya untuk pendaftar yang sudah diumumkan diterima.']);
        }
        $p->update(['status' => 'DAFTAR_ULANG', 'daftar_ulang_at' => now()]);
        $this->catatPendaftar($request, $p, 'UBAH', 'Pendaftar SPMB mengonfirmasi daftar ulang');
        return response()->json(['message' => 'Daftar ulang tercatat. Sekolah akan menghubungi Anda untuk langkah berikutnya.', 'data' => $this->ringkas($p->fresh())]);
    }

    // ===== bantuan =====

    private function masuk(Request $request): SpmbPendaftar
    {
        $request->validate(['nomor_daftar' => 'required|string|max:30', 'kode_akses' => 'required|string|max:20']);
        $p = SpmbPendaftar::with('gelombang')->where('nomor_daftar', Str::upper(trim($request->nomor_daftar)))->first();
        if (!$p || !Hash::check(Str::upper(trim($request->kode_akses)), $p->kode_akses)) {
            throw ValidationException::withMessages(['kode_akses' => 'Nomor pendaftaran atau kode akses tidak cocok.']);
        }
        return $p;
    }

    private function bolehUbah(SpmbPendaftar $p): void
    {
        if (!in_array($p->status, Spmb::BOLEH_UBAH, true)) {
            throw ValidationException::withMessages(['status' => 'Data sudah diverifikasi dan tidak bisa diubah lagi. Hubungi sekolah bila ada kesalahan.']);
        }
    }

    /** Hasil seleksi baru terlihat oleh pendaftar setelah gelombangnya diumumkan. */
    private function statusPublik(SpmbPendaftar $p): string
    {
        return in_array($p->status, Spmb::HASIL, true) && !$p->gelombang?->diumumkan_at ? 'TERVERIFIKASI' : $p->status;
    }

    private function gelombangPublik(SpmbGelombang $g): array
    {
        return [
            'id' => $g->id, 'nama' => $g->nama, 'tahun_ajaran' => $g->tahun_ajaran,
            'tgl_buka' => $g->tgl_buka->toDateString(), 'tgl_tutup' => $g->tgl_tutup->toDateString(),
            'tgl_pengumuman' => $g->tgl_pengumuman?->toDateString(), 'kuota' => $g->kuota, 'info' => $g->info,
            'berkas_wajib' => $g->berkas_wajib ?? [], 'buka' => $g->sedangBuka(), 'diumumkan' => (bool) $g->diumumkan_at,
        ];
    }

    private function ringkas(SpmbPendaftar $p): array
    {
        $p->loadMissing('gelombang', 'berkas');
        $status = $this->statusPublik($p);
        $wajib = $p->gelombang->berkas_wajib ?? [];
        $ada = $p->berkas->keyBy('jenis');
        $berkas = collect(Spmb::BERKAS)->map(fn($nama, $jenis) => [
            'jenis' => $jenis, 'nama' => $nama, 'wajib' => in_array($jenis, $wajib, true),
            'ada' => $ada->has($jenis), 'status' => $ada->get($jenis)?->status, 'catatan' => $ada->get($jenis)?->catatan,
            'nama_berkas' => $ada->get($jenis)?->nama_asli,
        ])->filter(fn($b) => $b['wajib'] || $b['ada'] || in_array($status, Spmb::BOLEH_UBAH, true))->values();

        return [
            'nomor_daftar' => $p->nomor_daftar,
            'data' => collect($p->only(array_keys(self::aturanData())))->put('tgl_lahir', $p->tgl_lahir?->toDateString()),
            'gelombang' => $this->gelombangPublik($p->gelombang),
            'status' => $status,
            'status_label' => Spmb::STATUS[$status],
            'catatan_verifikasi' => in_array($status, ['PERLU_PERBAIKAN', 'TIDAK_DITERIMA', 'CADANGAN', 'DITERIMA', 'DAFTAR_ULANG'], true) ? $p->catatan_verifikasi : null,
            'berkas' => $berkas,
            'boleh_ubah' => in_array($p->status, Spmb::BOLEH_UBAH, true),
            'boleh_daftar_ulang' => $status === 'DITERIMA',
            'dikirim' => $p->created_at?->toIso8601String(),
        ];
    }

    private function catatPendaftar(Request $request, SpmbPendaftar $p, string $aksi, string $teks): void
    {
        AuditTrail::catat([
            'user' => null, 'kategori' => 'DATA', 'aksi' => $aksi, 'modul' => 'SPMB',
            'deskripsi' => "{$teks}: {$p->nama_siswa} ({$p->nomor_daftar})",
            'metode' => $request->method(), 'rute' => '/' . $request->path(), 'status_http' => 200,
        ]);
    }
}

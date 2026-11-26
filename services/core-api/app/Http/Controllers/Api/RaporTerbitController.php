<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Classes;
use App\Models\MasterPeriode;
use App\Models\SchoolSetting;
use App\Models\Student;
use App\Models\TransRaporTerbit;
use App\Services\AuditTrail;
use App\Services\RaporTerbit;
use App\Services\RiwayatRombel;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

/**
 * Rapor digital terverifikasi:
 *  - wali kelas menerbitkan rapor resmi satu kelas (cuplikan nilai seperti tercetak + sidik data sumber + kode QR);
 *  - kepala sekolah mengesahkan (tanda tangan elektronik) per kelas;
 *  - orang tua/siswa menyatakan sudah menerima & membaca di portal;
 *  - siapa pun bisa memeriksa keaslian rapor dari kode QR (publik).
 */
class RaporTerbitController extends Controller
{
    private function cekKelas(Request $request): void
    {
        abort_unless($request->user()->bolehKelolaKelas($request->id_kelas), 403, 'Penerbitan rapor hanya untuk wali kelas, kepala sekolah, atau admin.');
    }

    private function cekKunci(Request $request): void
    {
        $p = MasterPeriode::find($request->id_periode);
        abort_if($p?->terkunci && !$request->user()->isAdmin(), 423, "Semester {$p->tahun_ajaran} {$p->semester} sudah dikunci. Hanya admin yang bisa menerbitkan atau mengesahkan rapornya.");
    }

    /** Status penerbitan satu kelas: rapor berlaku per siswa, tanda perubahan data, pengesahan, dan tanda terima. */
    public function index(Request $request)
    {
        $request->validate(['id_kelas' => 'required|exists:classes,id_kelas', 'id_periode' => 'required|exists:master_periode,id_periode']);
        $this->cekKelas($request);
        $anggota = RiwayatRombel::anggota($request->id_kelas, $request->id_periode)->orderBy('nama_siswa')->get(['id_siswa', 'nama_siswa']);
        $terbit = TransRaporTerbit::berlaku()->where('id_periode', $request->id_periode)->whereIn('id_siswa', $anggota->pluck('id_siswa'))
            ->with('penerima:id,name,role')->get()->keyBy('id_siswa');
        $sidik = RaporTerbit::sidikKelas($request->id_kelas, $request->id_periode, $anggota->pluck('id_siswa')->all());
        $berubah = fn($t) => !hash_equals($t->sidik, $sidik[$t->id_siswa] ?? '');

        return response()->json([
            'data' => $anggota->map(fn($s) => [
                'id_siswa' => $s->id_siswa, 'nama_siswa' => $s->nama_siswa,
                'terbit' => ($t = $terbit->get($s->id_siswa)) ? [
                    'id' => $t->id, 'versi' => $t->versi, 'kode_verifikasi' => $t->kode_verifikasi, 'tanggal_rapor' => $t->tanggal_rapor?->toDateString(),
                    'mode_kalkulasi' => $t->mode_kalkulasi, 'bobot' => $t->bobot,
                    'diterbitkan_pada' => $t->diterbitkan_pada, 'nama_wali' => $t->nama_wali,
                    'disahkan_pada' => $t->disahkan_pada, 'nama_kepsek' => $t->nama_kepsek,
                    'diterima_pada' => $t->diterima_pada, 'penerima' => $t->penerima ? ['name' => $t->penerima->name, 'role' => $t->penerima->role] : null,
                    'tanggapan_ortu' => $t->tanggapan_ortu,
                    'berubah' => $berubah($t),
                ] : null,
            ])->values(),
            'ringkas' => [
                'siswa' => $anggota->count(),
                'terbit' => $terbit->count(),
                'disahkan' => $terbit->whereNotNull('disahkan_pada')->count(),
                'diterima' => $terbit->whereNotNull('diterima_pada')->count(),
                'berubah' => $terbit->filter($berubah)->count(),
            ],
            'boleh_sahkan' => $request->user()->isAdmin() || $request->user()->isKepsek(),
        ]);
    }

    /**
     * Terbitkan rapor resmi untuk siswa yang dikirim. Cuplikan nilai per mapel dihitung di halaman Rapor (mode & bobot
     * yang dipilih) dan disimpan apa adanya; kehadiran, identitas, dan keputusan kenaikan diambil dari server.
     * Rapor yang isi dan datanya tidak berubah tidak dibuat versi baru.
     */
    public function terbitkan(Request $request)
    {
        $request->validate([
            'id_kelas' => 'required|exists:classes,id_kelas',
            'id_periode' => 'required|exists:master_periode,id_periode',
            'mode_kalkulasi' => ['required', Rule::in(['1', '2', '3'])],
            'bobot' => 'nullable|array',
            'bobot.*' => 'numeric|min:0|max:10',
            'tanggal_rapor' => 'required|date',
            'siswa' => 'required|array|min:1|max:80',
            'siswa.*.id_siswa' => 'required|string|max:50',
            'siswa.*.rata_umum' => 'nullable|numeric|min:0|max:100',
            'siswa.*.mapel' => 'present|array|max:40',
            'siswa.*.mapel.*.nama' => 'required|string|max:120',
            'siswa.*.mapel.*.kkm' => 'nullable|numeric|min:0|max:100',
            'siswa.*.mapel.*.nilai' => 'nullable|numeric|min:0|max:100',
        ]);
        $this->cekKelas($request);
        $this->cekKunci($request);

        $anggota = RiwayatRombel::anggota($request->id_kelas, $request->id_periode)->get(['id_siswa', 'nama_siswa', 'nisn'])->keyBy('id_siswa');
        $kiriman = collect($request->siswa)->keyBy('id_siswa');
        $asing = $kiriman->keys()->diff($anggota->keys());
        abort_if($asing->isNotEmpty(), 422, 'Ada siswa yang bukan anggota rombel ini pada semester tersebut.');

        $kelas = Classes::find($request->id_kelas);
        $periode = MasterPeriode::find($request->id_periode);
        $wali = RiwayatRombel::wali($request->id_kelas, $request->id_periode, ['id_guru', 'nama_guru'])?->nama_guru;
        $sidik = RaporTerbit::sidikKelas($request->id_kelas, $request->id_periode, $kiriman->keys()->all());
        $tambahan = RaporTerbit::ringkasanServer($request->id_kelas, $request->id_periode, $kiriman->keys()->all());
        $bobot = $request->mode_kalkulasi === '3' ? collect($request->bobot ?? [])->only(['S', 'T', 'N', 'K', 'M'])->map(fn($v) => (float) $v)->all() : null;
        $hitung = ['baru' => 0, 'ulang' => 0, 'tetap' => 0];

        DB::transaction(function () use ($kiriman, $anggota, $kelas, $periode, $wali, $sidik, $tambahan, $bobot, $request, &$hitung) {
            foreach ($kiriman as $id => $k) {
                $s = $anggota[$id];
                $ringkasan = [
                    'nama_siswa' => $s->nama_siswa, 'nisn' => $s->nisn, 'nama_kelas' => $kelas->nama_kelas,
                    'tahun_ajaran' => $periode->tahun_ajaran, 'semester' => $periode->semester,
                    'mapel' => collect($k['mapel'])->map(fn($m) => ['nama' => $m['nama'], 'kkm' => isset($m['kkm']) ? (float) $m['kkm'] : null,
                        'nilai' => isset($m['nilai']) ? (float) $m['nilai'] : null])->values()->all(),
                    'rata_umum' => isset($k['rata_umum']) ? (float) $k['rata_umum'] : null,
                ] + ($tambahan[$id] ?? []);
                $lama = TransRaporTerbit::berlaku()->where('id_siswa', $id)->where('id_periode', $periode->id_periode)->lockForUpdate()->first();
                if ($lama && $lama->sidik === $sidik[$id] && $lama->ringkasan == $ringkasan && $lama->mode_kalkulasi === $request->mode_kalkulasi
                    && $lama->bobot == $bobot && $lama->tanggal_rapor?->toDateString() === substr($request->tanggal_rapor, 0, 10)) {
                    $hitung['tetap']++;
                    continue;
                }
                $lama?->update(['status' => 'DIGANTI']);
                TransRaporTerbit::create([
                    'id_siswa' => $id, 'id_kelas' => $kelas->id_kelas, 'id_periode' => $periode->id_periode,
                    'versi' => ($lama?->versi ?? 0) + 1, 'kode_verifikasi' => TransRaporTerbit::kodeBaru(), 'status' => 'BERLAKU',
                    'mode_kalkulasi' => $request->mode_kalkulasi, 'bobot' => $bobot, 'tanggal_rapor' => $request->tanggal_rapor,
                    'ringkasan' => $ringkasan, 'sidik' => $sidik[$id],
                    'diterbitkan_oleh' => $request->user()->id, 'nama_wali' => $wali, 'diterbitkan_pada' => now(),
                ]);
                $hitung[$lama ? 'ulang' : 'baru']++;
            }
        });

        AuditTrail::catat([
            'aksi' => 'TERBIT_RAPOR', 'kategori' => 'OUTPUT', 'modul' => 'Rapor',
            'deskripsi' => "Menerbitkan rapor resmi {$kelas->nama_kelas} {$periode->tahun_ajaran} {$periode->semester}: {$hitung['baru']} baru, {$hitung['ulang']} terbit ulang",
            'meta' => ['id_kelas' => $kelas->id_kelas, 'id_periode' => $periode->id_periode] + $hitung,
        ]);
        return response()->json(['message' => 'Rapor resmi diterbitkan.', 'hasil' => $hitung]);
    }

    /** Kepala sekolah/admin mengesahkan (atau membatalkan pengesahan) rapor berlaku satu kelas. */
    public function sahkan(Request $request)
    {
        $request->validate(['id_kelas' => 'required|exists:classes,id_kelas', 'id_periode' => 'required|exists:master_periode,id_periode', 'batal' => 'boolean']);
        $u = $request->user();
        abort_unless($u->isAdmin() || $u->isKepsek(), 403, 'Pengesahan rapor hanya oleh kepala sekolah atau admin.');
        $this->cekKunci($request);
        $idSiswa = RiwayatRombel::anggota($request->id_kelas, $request->id_periode)->pluck('id_siswa');
        $q = TransRaporTerbit::berlaku()->where('id_periode', $request->id_periode)->whereIn('id_siswa', $idSiswa);
        abort_if(!$request->boolean('batal') && !(clone $q)->exists(), 422, 'Belum ada rapor yang diterbitkan untuk kelas ini.');
        $n = $request->boolean('batal')
            ? $q->update(['disahkan_oleh' => null, 'nama_kepsek' => null, 'disahkan_pada' => null])
            : $q->whereNull('disahkan_pada')->update(['disahkan_oleh' => $u->id, 'nama_kepsek' => SchoolSetting::first()?->nama_kepsek ?: $u->name, 'disahkan_pada' => now()]);
        AuditTrail::catat([
            'aksi' => $request->boolean('batal') ? 'BATAL_SAH_RAPOR' : 'SAHKAN_RAPOR', 'kategori' => 'UBAH', 'modul' => 'Rapor',
            'deskripsi' => ($request->boolean('batal') ? 'Membatalkan pengesahan' : 'Mengesahkan') . " {$n} rapor kelas " . Classes::whereKey($request->id_kelas)->value('nama_kelas'),
            'meta' => $request->only(['id_kelas', 'id_periode']),
        ]);
        return response()->json(['message' => $request->boolean('batal') ? 'Pengesahan dibatalkan.' : 'Rapor disahkan.', 'jumlah' => $n]);
    }

    /** Orang tua/siswa: sudah menerima & membaca rapor resmi, dengan tanggapan opsional. */
    public function terima(Request $request)
    {
        $request->validate(['id_siswa' => 'required|string|max:50', 'id_periode' => 'required|exists:master_periode,id_periode', 'tanggapan' => 'nullable|string|max:1000']);
        $u = $request->user();
        abort_unless($u->isPortal() && in_array($request->id_siswa, $u->siswaTerjangkau(), true), 403, 'Tanda terima rapor diisi oleh orang tua atau siswa sendiri.');
        $t = TransRaporTerbit::berlaku()->where('id_siswa', $request->id_siswa)->where('id_periode', $request->id_periode)->first();
        abort_unless($t, 404, 'Rapor resmi semester ini belum diterbitkan sekolah.');
        $t->update([
            'diterima_oleh' => $t->diterima_oleh ?? $u->id,
            'diterima_pada' => $t->diterima_pada ?? now(),
            'tanggapan_ortu' => $request->filled('tanggapan') ? trim($request->tanggapan) : $t->tanggapan_ortu,
        ]);
        return response()->json(['message' => 'Terima kasih, tanda terima rapor tercatat.', 'data' => $t->only(['diterima_pada', 'tanggapan_ortu'])]);
    }

    /**
     * Publik: periksa keaslian rapor dari kode QR. Hanya data yang memang tercetak di rapor.
     * Status, identitas, dan pengesahan langsung tampil; nilai & keputusan kenaikan baru dikirim bila
     * dua huruf awal nama siswa (?inisial=) cocok, agar pemegang kode saja tidak langsung membaca nilai.
     */
    public function verifikasi(Request $request, string $kode)
    {
        $t = TransRaporTerbit::where('kode_verifikasi', strtoupper($kode))->first();
        if (!$t) return response()->json(['message' => 'Kode rapor tidak ditemukan. Rapor ini tidak tercatat sebagai rapor resmi sekolah.'], 404);
        $berubah = $t->status === 'BERLAKU' && !hash_equals($t->sidik, RaporTerbit::sidikKelas($t->id_kelas, $t->id_periode, [$t->id_siswa])[$t->id_siswa] ?? '');
        $r = $t->ringkasan;
        $s = SchoolSetting::first();

        $hurufAwal = fn(?string $v) => mb_substr(preg_replace('/[^\p{L}]/u', '', mb_strtoupper((string) $v)), 0, 2);
        $inisial = $request->query('inisial');
        $cocok = is_string($inisial) && mb_strlen($hurufAwal($inisial)) === 2 && $hurufAwal($inisial) === $hurufAwal($r['nama_siswa'] ?? '');

        return response()->json(['data' => [
            'kode' => $t->kode_verifikasi,
            'status' => $t->status, 'versi' => $t->versi, 'berubah' => $berubah,
            'nama_siswa' => $r['nama_siswa'] ?? null, 'nisn' => $r['nisn'] ?? null, 'nama_kelas' => $r['nama_kelas'] ?? null,
            'tahun_ajaran' => $r['tahun_ajaran'] ?? null, 'semester' => $r['semester'] ?? null,
            'perlu_inisial' => !$cocok, 'inisial_salah' => is_string($inisial) && $inisial !== '' && !$cocok,
            'mapel' => $cocok ? ($r['mapel'] ?? []) : [], 'rata_umum' => $cocok ? ($r['rata_umum'] ?? null) : null,
            'kenaikan' => $cocok ? ($r['kenaikan'] ?? null) : null,
            'tanggal_rapor' => $t->tanggal_rapor?->toDateString(),
            'nama_wali' => $t->nama_wali, 'diterbitkan_pada' => $t->diterbitkan_pada?->toIso8601String(),
            'nama_kepsek' => $t->nama_kepsek, 'disahkan_pada' => $t->disahkan_pada?->toIso8601String(),
            // NIP hanya bila kepala sekolah yang mengesahkan masih tercatat di pengaturan
            'nip_kepsek' => $t->disahkan_pada && $s?->nip_kepsek && $s->nama_kepsek === $t->nama_kepsek ? $s->nip_kepsek : null,
            'sekolah' => $s?->nama_sekolah,
            'kop' => [
                'nama' => $s?->nama_sekolah, 'npsn' => $s?->npsn, 'alamat' => $s?->alamat_sekolah, 'kota' => $s?->kota,
                'ada_logo' => (bool) ($s?->logo_sekolah_url && \Illuminate\Support\Facades\Storage::disk('public')->exists('logo/' . basename($s->logo_sekolah_url))),
            ],
            'diperiksa_pada' => now()->toIso8601String(),
        ]], 200, ['Cache-Control' => 'no-store']);
    }
}

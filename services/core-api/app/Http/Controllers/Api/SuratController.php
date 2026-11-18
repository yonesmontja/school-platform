<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AdmPengaturan;
use App\Models\ArsipDokumen;
use App\Models\SchoolSetting;
use App\Models\Student;
use App\Models\SuratDisposisi;
use App\Models\SuratKeluar;
use App\Models\SuratMasuk;
use App\Models\SuratTemplat;
use App\Models\User;
use App\Support\BerkasPrivat;
use App\Support\HtmlAman;
use App\Support\Surat;
use Illuminate\Database\QueryException;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/**
 * Surat & Arsip (Administrasi Sekolah Tahap D): templat & penomoran otomatis, surat keluar dengan tanda tangan
 * kepala sekolah + kode verifikasi publik, surat masuk + disposisi, arsip digital dan dokumen legal bermasa berlaku.
 */
class SuratController extends Controller
{
    private static function tolak(string $kolom, string $pesan): never
    {
        throw ValidationException::withMessages([$kolom => $pesan]);
    }

    private function hariIni(): string
    {
        return now(config('app.zona_sekolah'))->toDateString();
    }

    // ===================== PILIHAN & PENGATURAN =====================

    public function pilihan()
    {
        $atur = Surat::pengaturan();
        return response()->json(['data' => [
            'status' => collect(Surat::STATUS)->map(fn($n, $k) => ['kode' => $k, 'nama' => $n])->values(),
            'sifat' => Surat::SIFAT,
            'isian' => collect(Surat::ISIAN)->map(fn($n, $k) => ['kunci' => $k, 'nama' => $n])->values(),
            'kategori_arsip' => Surat::KATEGORI_ARSIP,
            'kategori_legal' => Surat::KATEGORI_LEGAL,
            'pengaturan' => $atur,
            'contoh_nomor' => Surat::susunNomor(1, '421.2', $this->hariIni(), $atur),
            'templat' => SuratTemplat::orderByDesc('aktif')->orderBy('nama')->get(),
            // Penerima disposisi: akun staf aktif
            'staf' => User::where('aktif', true)->whereIn('role', ['admin', 'kepsek', 'guru', 'operator'])->orderBy('name')->get(['id', 'name', 'role']),
            'siswa' => Student::with('kelas:id_kelas,nama_kelas')->orderBy('nama_siswa')->get(['id_siswa', 'nama_siswa', 'id_kelas']),
            'hari_ini' => $this->hariIni(),
        ]]);
    }

    public function simpanPengaturan(Request $request)
    {
        $data = $request->validate([
            'format' => ['required', 'string', 'max:100', 'regex:/\{urut\}/'],
            'singkatan' => 'required|string|max:20',
            'digit' => 'required|integer|min:1|max:6',
        ], ['format.regex' => 'Format nomor wajib memuat {urut}.']);
        AdmPengaturan::simpan('surat_nomor', $data);
        return response()->json(['message' => 'Format nomor surat disimpan. Contoh: ' . Surat::susunNomor(1, '421.2', $this->hariIni(), $data)]);
    }

    // ===================== TEMPLAT =====================

    private function aturanTemplat(): array
    {
        return ['nama' => 'required|string|max:100', 'kode_klasifikasi' => 'nullable|string|max:20', 'perihal' => 'nullable|string|max:200', 'isi' => 'required|string|max:100000', 'aktif' => 'boolean'];
    }

    public function simpanTemplat(Request $request)
    {
        $data = $request->validate($this->aturanTemplat());
        $data['isi'] = HtmlAman::bersihkan($data['isi']) ?? self::tolak('isi', 'Isi templat masih kosong.');
        $t = SuratTemplat::create($data);
        return response()->json(['message' => "Templat {$t->nama} dibuat.", 'data' => $t], 201);
    }

    public function ubahTemplat(Request $request, int $id)
    {
        $t = SuratTemplat::findOrFail($id);
        $data = $request->validate($this->aturanTemplat());
        $data['isi'] = HtmlAman::bersihkan($data['isi']) ?? self::tolak('isi', 'Isi templat masih kosong.');
        $t->update($data);
        return response()->json(['message' => 'Templat diperbarui.', 'data' => $t]);
    }

    public function hapusTemplat(int $id)
    {
        $t = SuratTemplat::findOrFail($id);
        $t->delete();
        return response()->json(['message' => "Templat {$t->nama} dihapus. Surat yang sudah dibuat dari templat ini tidak berubah."]);
    }

    public function contohTemplat()
    {
        $ada = SuratTemplat::pluck('nama')->all();
        $baru = collect(Surat::contohTemplat())->reject(fn($t) => in_array($t['nama'], $ada, true));
        foreach ($baru as $t) SuratTemplat::create($t);
        return response()->json(['message' => $baru->count() ? "{$baru->count()} templat contoh ditambahkan." : 'Templat contoh sudah ada.'], $baru->count() ? 201 : 200);
    }

    /** Isi templat dengan data sekolah (dan siswa) untuk draf surat baru. */
    public function isiTemplat(Request $request, int $id)
    {
        $t = SuratTemplat::findOrFail($id);
        $request->validate(['id_siswa' => 'nullable|exists:students,id_siswa']);
        $siswa = $request->id_siswa ? Student::find($request->id_siswa) : null;
        return response()->json(['data' => [
            'isi' => Surat::isiTemplat($t->isi, $siswa),
            'perihal' => $t->perihal, 'kode_klasifikasi' => $t->kode_klasifikasi,
        ]]);
    }

    // ===================== SURAT KELUAR =====================

    public function keluar(Request $request)
    {
        $q = SuratKeluar::with(['pembuat:id,name,id_guru', 'penandatangan:id,name'])
            ->when($request->status, fn($q, $v) => $q->where('status', $v))
            ->when($request->tahun, fn($q, $v) => $q->whereYear('tanggal', $v))
            ->when($request->search, fn($q, $v) => $q->where(fn($w) => $w->where('perihal', 'ilike', "%{$v}%")->orWhere('nomor', 'ilike', "%{$v}%")->orWhere('tujuan', 'ilike', "%{$v}%")));
        return response()->json(['data' => $q->orderByRaw("status = 'DRAF' desc")->latest('tanggal')->latest('id')->limit(500)
            ->get()->makeHidden('isi')]);
    }

    public function detailKeluar(int $id)
    {
        return response()->json(['data' => SuratKeluar::with(['pembuat:id,name,id_guru', 'penerbit:id,name', 'penandatangan:id,name', 'templat:id,nama'])->findOrFail($id)]);
    }

    private function aturanKeluar(): array
    {
        return [
            'id_templat' => 'nullable|exists:surat_templat,id',
            'tanggal' => 'required|date',
            'kode_klasifikasi' => 'nullable|string|max:20',
            'perihal' => 'required|string|max:200',
            'tujuan' => 'required|string|max:1000',
            'sifat' => ['required', Rule::in(Surat::SIFAT)],
            'lampiran' => 'nullable|string|max:100',
            'isi' => 'required|string|max:200000',
        ];
    }

    public function simpanKeluar(Request $request)
    {
        $data = $request->validate($this->aturanKeluar());
        $data['isi'] = HtmlAman::bersihkan($data['isi']) ?? self::tolak('isi', 'Isi surat masih kosong.');
        $s = SuratKeluar::create($data + ['status' => 'DRAF', 'dibuat_oleh' => $request->user()->id]);
        return response()->json(['message' => 'Draf surat disimpan.', 'data' => $s], 201);
    }

    public function ubahKeluar(Request $request, int $id)
    {
        $s = SuratKeluar::findOrFail($id);
        if (!in_array($s->status, ['DRAF', 'DIAJUKAN'], true)) self::tolak('status', 'Surat yang sudah terbit tidak bisa diubah. Batalkan lalu buat surat baru.');
        $data = $request->validate($this->aturanKeluar());
        $data['isi'] = HtmlAman::bersihkan($data['isi']) ?? self::tolak('isi', 'Isi surat masih kosong.');
        $s->update($data + ['status' => 'DRAF']); // diubah → kembali ke draf, perlu diajukan lagi
        return response()->json(['message' => 'Draf surat diperbarui.', 'data' => $s]);
    }

    public function hapusKeluar(int $id)
    {
        $s = SuratKeluar::findOrFail($id);
        if (!in_array($s->status, ['DRAF', 'DIAJUKAN'], true)) self::tolak('status', 'Surat yang sudah terbit tidak bisa dihapus; gunakan Batalkan agar nomornya tetap tercatat.');
        $s->delete();
        return response()->json(['message' => 'Draf surat dihapus.']);
    }

    /** Ajukan draf ke kepala sekolah untuk ditandatangani secara digital. */
    public function ajukanKeluar(int $id)
    {
        $s = SuratKeluar::findOrFail($id);
        if ($s->status !== 'DRAF') self::tolak('status', 'Hanya draf yang bisa diajukan.');
        $s->update(['status' => 'DIAJUKAN']);
        return response()->json(['message' => 'Surat diajukan ke kepala sekolah untuk ditandatangani.']);
    }

    /**
     * Terbitkan: beri nomor urut tahun berjalan dan kode verifikasi. Kepala sekolah yang menerbitkan sekaligus
     * menandatangani secara digital; operator menerbitkan untuk ditandatangani basah (tanpa tanda tangan digital).
     */
    public function terbitkan(Request $request, int $id)
    {
        $s = SuratKeluar::findOrFail($id);
        if (!in_array($s->status, ['DRAF', 'DIAJUKAN'], true)) self::tolak('status', 'Surat ini sudah terbit atau dibatalkan.');
        $user = $request->user();
        $tandatangan = $user->isKepsek();
        $atur = Surat::pengaturan();
        $tahun = (int) substr($s->tanggal->toDateString(), 0, 4);

        for ($coba = 0; ; $coba++) {
            try {
                DB::transaction(function () use ($s, $user, $tandatangan, $atur, $tahun) {
                    $urut = (int) SuratKeluar::where('tahun', $tahun)->max('urut') + 1;
                    $s->update([
                        'urut' => $urut, 'tahun' => $tahun, 'nomor' => Surat::susunNomor($urut, $s->kode_klasifikasi, $s->tanggal->toDateString(), $atur),
                        'kode_verifikasi' => strtoupper(Str::random(10)), 'status' => 'TERBIT',
                        'diterbitkan_oleh' => $user->id, 'diterbitkan_at' => now(),
                        'ditandatangani_oleh' => $tandatangan ? $user->id : null, 'ditandatangani_at' => $tandatangan ? now() : null,
                    ]);
                });
                break;
            } catch (QueryException $e) {
                if ($coba >= 4) throw $e;
                $s->refresh();
            }
        }
        return response()->json(['message' => "Surat terbit dengan nomor {$s->nomor}." . ($tandatangan ? ' Ditandatangani secara digital.' : ''), 'data' => $s->fresh()]);
    }

    /** Kepala sekolah menandatangani surat yang sudah terbit tanpa tanda tangan digital. */
    public function tandatangani(Request $request, int $id)
    {
        abort_unless($request->user()->isKepsek(), 403, 'Hanya kepala sekolah yang dapat menandatangani surat.');
        $s = SuratKeluar::findOrFail($id);
        if (in_array($s->status, ['DRAF', 'DIAJUKAN'], true)) return $this->terbitkan($request, $id);
        if ($s->status !== 'TERBIT' || $s->ditandatangani_at) self::tolak('status', 'Surat ini sudah ditandatangani atau dibatalkan.');
        $s->update(['ditandatangani_oleh' => $request->user()->id, 'ditandatangani_at' => now()]);
        return response()->json(['message' => 'Surat ditandatangani secara digital.', 'data' => $s->fresh()]);
    }

    public function batalKeluar(Request $request, int $id)
    {
        $request->validate(['alasan' => 'required|string|max:255'], ['alasan.required' => 'Tulis alasan pembatalan.']);
        $s = SuratKeluar::findOrFail($id);
        if ($s->status !== 'TERBIT') self::tolak('status', 'Hanya surat terbit yang bisa dibatalkan; draf cukup dihapus.');
        $s->update(['status' => 'BATAL', 'alasan_batal' => $request->alasan]);
        return response()->json(['message' => "Surat {$s->nomor} dibatalkan. Nomornya tetap tercatat dan tidak dipakai ulang."]);
    }

    // ===================== SURAT MASUK & DISPOSISI =====================

    public function masuk(Request $request)
    {
        $q = SuratMasuk::with(['disposisi.kepada:id,name', 'disposisi.dari:id,name', 'pencatat:id,name,id_guru'])
            ->when($request->status, fn($q, $v) => $q->where('status', $v))
            ->when($request->tahun, fn($q, $v) => $q->where('tahun', $v))
            ->when($request->search, fn($q, $v) => $q->where(fn($w) => $w->where('perihal', 'ilike', "%{$v}%")->orWhere('pengirim', 'ilike', "%{$v}%")->orWhere('nomor_surat', 'ilike', "%{$v}%")));
        return response()->json(['data' => $q->latest('tanggal_terima')->latest('id')->limit(500)->get()]);
    }

    private function aturanMasuk(): array
    {
        return [
            'nomor_surat' => 'nullable|string|max:100',
            'tanggal_surat' => 'nullable|date',
            'tanggal_terima' => 'required|date',
            'pengirim' => 'required|string|max:150',
            'perihal' => 'required|string|max:200',
            'ringkasan' => 'nullable|string|max:5000',
            'sifat' => ['required', Rule::in(Surat::SIFAT)],
            'berkas' => 'nullable|file|max:' . BerkasPrivat::MAKS_KB,
        ];
    }

    public function simpanMasuk(Request $request)
    {
        $data = $request->validate($this->aturanMasuk(), ['berkas.max' => 'Ukuran berkas maksimal 10 MB.']);
        $tahun = (int) substr($data['tanggal_terima'], 0, 4);
        $berkas = $request->hasFile('berkas') ? BerkasPrivat::simpan($request->file('berkas'), "surat-masuk/{$tahun}") : null;
        unset($data['berkas']);
        for ($coba = 0; ; $coba++) {
            try {
                $s = DB::transaction(fn() => SuratMasuk::create($data + [
                    'tahun' => $tahun, 'nomor_agenda' => (int) SuratMasuk::where('tahun', $tahun)->max('nomor_agenda') + 1, 'status' => 'BARU',
                    'berkas_path' => $berkas['path'] ?? null, 'berkas_nama' => $berkas['nama'] ?? null, 'berkas_mime' => $berkas['mime'] ?? null,
                    'dicatat_oleh' => $request->user()->id,
                ]));
                break;
            } catch (QueryException $e) {
                if ($coba >= 4) { BerkasPrivat::hapus($berkas['path'] ?? null); throw $e; }
            }
        }
        return response()->json(['message' => "Surat masuk dicatat dengan nomor agenda {$s->nomor_agenda}/{$tahun}.", 'data' => $s], 201);
    }

    public function ubahMasuk(Request $request, int $id)
    {
        $s = SuratMasuk::findOrFail($id);
        $data = $request->validate($this->aturanMasuk(), ['berkas.max' => 'Ukuran berkas maksimal 10 MB.']);
        unset($data['berkas']);
        if ($request->hasFile('berkas')) {
            $b = BerkasPrivat::simpan($request->file('berkas'), "surat-masuk/{$s->tahun}");
            BerkasPrivat::hapus($s->berkas_path);
            $data += ['berkas_path' => $b['path'], 'berkas_nama' => $b['nama'], 'berkas_mime' => $b['mime']];
        }
        $s->update($data);
        return response()->json(['message' => 'Surat masuk diperbarui.', 'data' => $s]);
    }

    public function hapusMasuk(int $id)
    {
        $s = SuratMasuk::findOrFail($id);
        BerkasPrivat::hapus($s->berkas_path);
        $s->delete();
        return response()->json(['message' => 'Surat masuk dihapus.']);
    }

    public function berkasMasuk(int $id)
    {
        $s = SuratMasuk::findOrFail($id);
        return BerkasPrivat::respons($s->berkas_path, $s->berkas_nama, $s->berkas_mime);
    }

    public function disposisi(Request $request, int $id)
    {
        $s = SuratMasuk::findOrFail($id);
        $data = $request->validate([
            'kepada_user' => ['required', Rule::exists('users', 'id')->where('aktif', true)],
            'instruksi' => 'required|string|max:2000',
            'batas_waktu' => 'nullable|date',
        ], ['kepada_user.required' => 'Pilih penerima disposisi.']);
        $d = $s->disposisi()->create($data + ['dari_user' => $request->user()->id, 'status' => 'BARU']);
        if ($s->status === 'BARU') $s->update(['status' => 'DIDISPOSISI']);
        return response()->json(['message' => 'Disposisi dikirim ke ' . User::whereKey($data['kepada_user'])->value('name') . '.', 'data' => $d], 201);
    }

    public function selesaiMasuk(int $id)
    {
        SuratMasuk::findOrFail($id)->update(['status' => 'SELESAI']);
        return response()->json(['message' => 'Surat masuk ditandai selesai.']);
    }

    // ===================== DISPOSISI UNTUK PENERIMA (semua staf) =====================

    public function disposisiSaya(Request $request)
    {
        return response()->json(['data' => SuratDisposisi::with(['surat', 'dari:id,name'])
            ->where('kepada_user', $request->user()->id)->orderByRaw("status = 'SELESAI'")->latest('id')->limit(200)->get()]);
    }

    private function milikSaya(Request $request, int $id): SuratDisposisi
    {
        $d = SuratDisposisi::with('surat')->findOrFail($id);
        abort_unless($d->kepada_user === $request->user()->id, 403, 'Disposisi ini bukan untuk akun Anda.');
        return $d;
    }

    public function bacaDisposisi(Request $request, int $id)
    {
        $d = $this->milikSaya($request, $id);
        if ($d->status === 'BARU') $d->update(['status' => 'DIBACA', 'dibaca_at' => now()]);
        return response()->json(['message' => 'Disposisi ditandai dibaca.']);
    }

    public function selesaiDisposisi(Request $request, int $id)
    {
        $d = $this->milikSaya($request, $id);
        $request->validate(['tindak_lanjut' => 'required|string|max:2000'], ['tindak_lanjut.required' => 'Tulis tindak lanjut yang sudah dilakukan.']);
        $d->update(['status' => 'SELESAI', 'selesai_at' => now(), 'dibaca_at' => $d->dibaca_at ?? now(), 'tindak_lanjut' => $request->tindak_lanjut]);
        // Semua disposisi selesai → surat masuk selesai
        if (!$d->surat->disposisi()->where('status', '<>', 'SELESAI')->exists()) $d->surat->update(['status' => 'SELESAI']);
        return response()->json(['message' => 'Tindak lanjut disposisi dicatat.']);
    }

    public function berkasDisposisi(Request $request, int $id)
    {
        $d = $this->milikSaya($request, $id);
        return BerkasPrivat::respons($d->surat->berkas_path, $d->surat->berkas_nama, $d->surat->berkas_mime);
    }

    // ===================== ARSIP & DOKUMEN LEGAL =====================

    public function arsip(Request $request)
    {
        $hariIni = $this->hariIni();
        $q = ArsipDokumen::with('pencatat:id,name,id_guru')
            ->when($request->jenis, fn($q, $v) => $q->where('jenis', $v))
            ->when($request->kategori, fn($q, $v) => $q->where('kategori', $v))
            ->when($request->label, fn($q, $v) => $q->whereJsonContains('label', $v))
            ->when($request->search, fn($q, $v) => $q->where(fn($w) => $w->where('judul', 'ilike', "%{$v}%")->orWhere('nomor_dokumen', 'ilike', "%{$v}%")->orWhere('keterangan', 'ilike', "%{$v}%")));
        if ($request->masa === 'SEGERA') $q->whereNotNull('berlaku_sampai')->where('berlaku_sampai', '<=', now(config('app.zona_sekolah'))->addDays(Surat::HARI_PENGINGAT)->toDateString());
        $data = $q->orderByRaw('berlaku_sampai is null')->orderBy('berlaku_sampai')->latest('id')->limit(1000)->get();
        return response()->json([
            'data' => $data,
            'label' => ArsipDokumen::query()->pluck('label')->flatten()->filter()->unique()->sort()->values(),
            'hari_ini' => $hariIni,
        ]);
    }

    private function aturanArsip(): array
    {
        return [
            'jenis' => 'required|in:ARSIP,LEGAL',
            'judul' => 'required|string|max:200',
            'kategori' => 'required|string|max:60',
            'label' => 'nullable|array|max:10',
            'label.*' => 'string|max:30',
            'nomor_dokumen' => 'nullable|string|max:100',
            'tanggal_dokumen' => 'nullable|date',
            'berlaku_sampai' => 'nullable|date',
            'keterangan' => 'nullable|string|max:5000',
            'berkas' => 'nullable|file|max:' . BerkasPrivat::MAKS_KB,
        ];
    }

    private function rapikanLabel(array $data): array
    {
        $data['label'] = collect($data['label'] ?? [])->map(fn($l) => mb_strtolower(trim($l)))->filter()->unique()->values()->all();
        return $data;
    }

    public function simpanArsip(Request $request)
    {
        $data = $this->rapikanLabel($request->validate($this->aturanArsip(), ['berkas.max' => 'Ukuran berkas maksimal 10 MB.']));
        unset($data['berkas']);
        if ($request->hasFile('berkas')) {
            $b = BerkasPrivat::simpan($request->file('berkas'), 'arsip/' . now()->format('Y'));
            $data += ['berkas_path' => $b['path'], 'berkas_nama' => $b['nama'], 'berkas_mime' => $b['mime'], 'berkas_ukuran' => $b['ukuran']];
        }
        $a = ArsipDokumen::create($data + ['dicatat_oleh' => $request->user()->id]);
        return response()->json(['message' => ($a->jenis === 'LEGAL' ? 'Dokumen legal' : 'Arsip') . ' disimpan.', 'data' => $a], 201);
    }

    /** Ubah arsip (POST multipart agar berkas pengganti bisa ikut). */
    public function ubahArsip(Request $request, int $id)
    {
        $a = ArsipDokumen::findOrFail($id);
        $data = $this->rapikanLabel($request->validate($this->aturanArsip(), ['berkas.max' => 'Ukuran berkas maksimal 10 MB.']));
        unset($data['berkas']);
        if ($request->hasFile('berkas')) {
            $b = BerkasPrivat::simpan($request->file('berkas'), 'arsip/' . now()->format('Y'));
            BerkasPrivat::hapus($a->berkas_path);
            $data += ['berkas_path' => $b['path'], 'berkas_nama' => $b['nama'], 'berkas_mime' => $b['mime'], 'berkas_ukuran' => $b['ukuran']];
        }
        $a->update($data);
        return response()->json(['message' => 'Arsip diperbarui.', 'data' => $a]);
    }

    public function hapusArsip(int $id)
    {
        $a = ArsipDokumen::findOrFail($id);
        BerkasPrivat::hapus($a->berkas_path);
        $a->delete();
        return response()->json(['message' => 'Arsip dihapus.']);
    }

    public function berkasArsip(int $id)
    {
        $a = ArsipDokumen::findOrFail($id);
        return BerkasPrivat::respons($a->berkas_path, $a->berkas_nama, $a->berkas_mime);
    }

    // ===================== VERIFIKASI PUBLIK =====================

    /** Cek keaslian surat dari kode verifikasi yang tercetak di surat (tanpa login). */
    public function verifikasi(string $kode)
    {
        $s = SuratKeluar::with('penandatangan:id,name')->where('kode_verifikasi', strtoupper($kode))->first();
        if (!$s) return response()->json(['message' => 'Kode verifikasi tidak ditemukan. Surat ini tidak tercatat di sistem sekolah.'], 404);
        $sek = SchoolSetting::first();
        return response()->json(['data' => [
            'nomor' => $s->nomor, 'tanggal' => $s->tanggal->toDateString(), 'perihal' => $s->perihal, 'sifat' => $s->sifat,
            'status' => $s->status, 'alasan_batal' => $s->status === 'BATAL' ? $s->alasan_batal : null,
            // Tujuan surat bersifat rahasia tidak ditampilkan
            'tujuan' => $s->sifat === 'Rahasia' ? null : Str::limit($s->tujuan, 200),
            'ditandatangani' => (bool) $s->ditandatangani_at,
            'penandatangan' => $s->ditandatangani_at ? ($sek?->nama_kepsek ?: $s->penandatangan?->name) : null,
            'ditandatangani_at' => $s->ditandatangani_at?->toIso8601String(),
            'sekolah' => $sek?->nama_sekolah,
        ]]);
    }
}

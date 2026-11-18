<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Classes;
use App\Models\MasterAgama;
use App\Models\MasterOrtu;
use App\Models\MasterPekerjaan;
use App\Models\MasterSekolahAsal;
use App\Models\MasterSuku;
use App\Models\MasterWali;
use App\Models\SpmbBerkas;
use App\Models\SpmbGelombang;
use App\Models\SpmbPendaftar;
use App\Models\Student;
use App\Support\Spmb;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/**
 * SPMB sisi sekolah (Fase 26 Tahap B, submodul administrasi:SPMB): gelombang, verifikasi berkas, hasil seleksi,
 * pengumuman, dan penyelesaian daftar ulang yang otomatis membuat data siswa + orang tua/wali.
 * Peninjau hanya membaca (dijaga middleware role).
 */
class SpmbController extends Controller
{
    private const TERPAKAI_KUOTA = ['DITERIMA', 'DAFTAR_ULANG', 'SELESAI'];

    // GET /administrasi/spmb/pilihan
    public function pilihan()
    {
        return response()->json(['data' => [
            'status' => collect(Spmb::STATUS)->map(fn($nama, $kode) => compact('kode', 'nama'))->values(),
            'jenis_berkas' => collect(Spmb::BERKAS)->map(fn($nama, $kode) => compact('kode', 'nama'))->values(),
            'agama' => MasterAgama::orderBy('id_agama')->get(['id_agama', 'nama_agama']),
            'suku' => MasterSuku::orderBy('nama_suku')->get(['id_suku', 'nama_suku']),
            'pekerjaan' => MasterPekerjaan::orderBy('id_pekerjaan')->get(['id_pekerjaan', 'nama_pekerjaan']),
            'kelas' => Classes::orderBy('nama_kelas')->get(['id_kelas', 'nama_kelas']),
        ]]);
    }

    // ===== Gelombang =====

    // GET /administrasi/spmb/gelombang
    public function gelombang()
    {
        $hitung = SpmbPendaftar::select('id_gelombang', 'status', DB::raw('count(*) as n'))->groupBy('id_gelombang', 'status')->get()->groupBy('id_gelombang');
        $data = SpmbGelombang::orderByDesc('tgl_buka')->get()->map(fn($g) => $g->toArray() + [
            'buka' => $g->sedangBuka(),
            'jumlah' => $hitung->get($g->id)?->pluck('n', 'status')->map(fn($n) => (int) $n) ?? (object) [],
        ]);
        return response()->json(['data' => $data]);
    }

    // POST /administrasi/spmb/gelombang
    public function simpanGelombang(Request $request)
    {
        $g = SpmbGelombang::create($this->validasiGelombang($request) + ['dibuat_oleh' => $request->user()->id]);
        return response()->json(['message' => "Gelombang {$g->nama} dibuat.", 'data' => $g], 201);
    }

    // PUT /administrasi/spmb/gelombang/{id}
    public function ubahGelombang(Request $request, int $id)
    {
        $g = SpmbGelombang::findOrFail($id);
        $g->update($this->validasiGelombang($request));
        return response()->json(['message' => "Gelombang {$g->nama} diperbarui.", 'data' => $g]);
    }

    // DELETE /administrasi/spmb/gelombang/{id}
    public function hapusGelombang(int $id)
    {
        $g = SpmbGelombang::findOrFail($id);
        if ($g->pendaftar()->exists()) {
            throw ValidationException::withMessages(['gelombang' => 'Gelombang ini sudah punya pendaftar dan tidak bisa dihapus. Ubah tanggal tutupnya bila ingin menghentikan pendaftaran.']);
        }
        $g->delete();
        return response()->json(['message' => 'Gelombang dihapus.']);
    }

    // POST /administrasi/spmb/gelombang/{id}/umumkan  {umumkan: bool}
    public function umumkan(Request $request, int $id)
    {
        $g = SpmbGelombang::findOrFail($id);
        $umumkan = $request->validate(['umumkan' => 'required|boolean'])['umumkan'];
        if ($umumkan) {
            $menunggu = $g->pendaftar()->where('status', 'TERVERIFIKASI')->count();
            if ($menunggu) {
                throw ValidationException::withMessages(['umumkan' => "Masih ada {$menunggu} pendaftar terverifikasi yang belum diberi hasil seleksi."]);
            }
        }
        $g->update(['diumumkan_at' => $umumkan ? now() : null]);
        return response()->json(['message' => $umumkan ? "Hasil {$g->nama} diumumkan. Pendaftar dapat melihatnya lewat Cek Status." : "Pengumuman {$g->nama} ditarik."]);
    }

    // ===== Pendaftar =====

    // GET /administrasi/spmb/pendaftar?id_gelombang=&status=&cari=
    public function pendaftar(Request $request)
    {
        $q = SpmbPendaftar::with('gelombang:id,nama,diumumkan_at')->withCount('berkas')
            ->when($request->filled('id_gelombang'), fn($w) => $w->where('id_gelombang', $request->integer('id_gelombang')))
            ->when($request->filled('status'), fn($w) => $w->where('status', $request->status))
            ->when($request->filled('cari'), function ($w) use ($request) {
                $kata = '%' . mb_strtolower($request->cari) . '%';
                $w->where(fn($x) => $x->whereRaw('lower(nama_siswa) like ?', [$kata])->orWhereRaw('lower(nomor_daftar) like ?', [$kata])->orWhere('nisn', 'like', $kata));
            });
        return response()->json(['data' => $q->orderBy('created_at')->get()]);
    }

    // GET /administrasi/spmb/pendaftar/{id}
    public function detail(int $id)
    {
        $p = SpmbPendaftar::with(['gelombang', 'berkas', 'verifikator:id,name', 'siswa:id_siswa,nama_siswa,id_kelas'])->findOrFail($id);
        return response()->json(['data' => $p->toArray() + ['berkas_wajib' => $p->gelombang->berkas_wajib ?? []]]);
    }

    // PUT /administrasi/spmb/pendaftar/{id} — operator merapikan data (salah ketik dsb.)
    public function ubah(Request $request, int $id)
    {
        $p = SpmbPendaftar::findOrFail($id);
        $this->belumSelesai($p);
        $data = $request->validate(SpmbPublikController::aturanData(true), SpmbPublikController::PESAN);
        SpmbPublikController::cekKeluarga($data, $p);
        if (array_key_exists('nisn', $data)) SpmbPublikController::cekNisn($data['nisn'], $p->id_gelombang, $p->id);
        $p->update($data);
        return response()->json(['message' => 'Data pendaftar diperbarui.', 'data' => $p->fresh()]);
    }

    // POST /administrasi/spmb/pendaftar/{id}/verifikasi {keputusan, catatan, berkas: [{id, status, catatan}]}
    public function verifikasi(Request $request, int $id)
    {
        $p = SpmbPendaftar::with(['gelombang', 'berkas'])->findOrFail($id);
        if (!in_array($p->status, ['DIAJUKAN', 'PERLU_PERBAIKAN', 'TERVERIFIKASI'], true)) {
            throw ValidationException::withMessages(['status' => 'Pendaftar ini sudah diberi hasil seleksi. Batalkan hasilnya dulu untuk memverifikasi ulang.']);
        }
        $v = $request->validate([
            'keputusan' => ['required', Rule::in(['TERVERIFIKASI', 'PERLU_PERBAIKAN'])],
            'catatan' => 'nullable|string|max:1000|required_if:keputusan,PERLU_PERBAIKAN',
            'berkas' => 'array',
            'berkas.*.id' => 'required|integer',
            'berkas.*.status' => ['required', Rule::in(['MENUNGGU', 'SAH', 'DITOLAK'])],
            'berkas.*.catatan' => 'nullable|string|max:300',
        ], ['catatan.required_if' => 'Tulis apa yang perlu diperbaiki pendaftar.']);

        // Status per berkas disimpan dulu agar pemeriksaan operator tidak hilang meski keputusannya ditolak
        DB::transaction(function () use ($p, $v) {
            foreach ($v['berkas'] ?? [] as $b) {
                $p->berkas->firstWhere('id', $b['id'])?->update(['status' => $b['status'], 'catatan' => $b['catatan'] ?? null]);
            }
        });
        if ($v['keputusan'] === 'TERVERIFIKASI') {
            $p->load('berkas');
            $kurang = collect($p->gelombang->berkas_wajib ?? [])->reject(fn($j) => $p->berkas->firstWhere('jenis', $j)?->status === 'SAH');
            if ($kurang->isNotEmpty()) {
                throw ValidationException::withMessages(['keputusan' => 'Berkas wajib belum sah: ' . $kurang->map(fn($j) => Spmb::BERKAS[$j])->implode(', ') . '.']);
            }
        }
        $p->update([
            'status' => $v['keputusan'], 'catatan_verifikasi' => $v['catatan'] ?? null,
            'diverifikasi_oleh' => $request->user()->id, 'diverifikasi_at' => now(),
        ]);

        return response()->json(['message' => $v['keputusan'] === 'TERVERIFIKASI' ? "{$p->nama_siswa} terverifikasi." : "Permintaan perbaikan untuk {$p->nama_siswa} tersimpan."]);
    }

    // POST /administrasi/spmb/pendaftar/{id}/hasil {hasil: DITERIMA|CADANGAN|TIDAK_DITERIMA|null, skor?, catatan?}
    public function hasil(Request $request, int $id)
    {
        $p = SpmbPendaftar::with('gelombang')->findOrFail($id);
        if (!in_array($p->status, ['TERVERIFIKASI', ...Spmb::HASIL], true)) {
            throw ValidationException::withMessages(['hasil' => $p->status === 'DAFTAR_ULANG' || $p->status === 'SELESAI'
                ? 'Pendaftar ini sudah daftar ulang; hasilnya tidak bisa diubah.' : 'Verifikasi berkas pendaftar ini dulu.']);
        }
        $v = $request->validate([
            'hasil' => ['nullable', Rule::in(Spmb::HASIL)],
            'skor' => 'nullable|numeric|min:0|max:9999',
            'catatan' => 'nullable|string|max:1000',
        ]);
        $hasil = $v['hasil'] ?? null;

        if ($hasil === 'DITERIMA' && $p->status !== 'DITERIMA' && $p->gelombang->kuota) {
            $terpakai = SpmbPendaftar::where('id_gelombang', $p->id_gelombang)->whereIn('status', self::TERPAKAI_KUOTA)->count();
            if ($terpakai >= $p->gelombang->kuota) {
                throw ValidationException::withMessages(['hasil' => "Kuota {$p->gelombang->nama} ({$p->gelombang->kuota}) sudah penuh. Jadikan cadangan, atau naikkan kuotanya."]);
            }
        }

        $p->update(['status' => $hasil ?? 'TERVERIFIKASI', 'skor' => $v['skor'] ?? $p->skor]
            + (array_key_exists('catatan', $v) ? ['catatan_verifikasi' => $v['catatan']] : []));
        return response()->json(['message' => $hasil ? "{$p->nama_siswa}: " . Spmb::STATUS[$hasil] . '.' : "Hasil {$p->nama_siswa} dibatalkan."]);
    }

    // POST /administrasi/spmb/pendaftar/{id}/selesaikan {id_kelas?} — daftar ulang selesai → siswa + orang tua/wali
    public function selesaikan(Request $request, int $id)
    {
        $p = SpmbPendaftar::with('gelombang')->findOrFail($id);
        $diterima = $p->status === 'DAFTAR_ULANG' || ($p->status === 'DITERIMA' && $p->gelombang->diumumkan_at);
        if (!$diterima) {
            throw ValidationException::withMessages(['status' => 'Hanya pendaftar yang diterima (dan sudah diumumkan) yang dapat diselesaikan daftar ulangnya.']);
        }
        $v = $request->validate(['id_kelas' => 'nullable|exists:classes,id_kelas']);
        if (filled($p->nisn) && Student::where('nisn', $p->nisn)->exists()) {
            throw ValidationException::withMessages(['nisn' => 'NISN pendaftar ini sudah dipakai siswa lain. Perbaiki NISN-nya dulu.']);
        }

        $catatan = [];
        $siswa = DB::transaction(function () use ($p, $v, &$catatan) {
            $idOrtu = null;
            if (filled($p->nama_ayah) || filled($p->nama_ibu)) {
                $ortu = $this->cariKeluarga(MasterOrtu::query(), $p->no_wa, ['nama_ibu' => $p->nama_ibu, 'nama_ayah' => $p->nama_ayah]);
                if ($ortu) {
                    $catatan[] = 'dihubungkan ke data orang tua yang sudah ada';
                } else {
                    $ortu = MasterOrtu::create([
                        'id_ortu' => 'ORT-' . Str::upper(Str::random(8)), 'nama_ayah' => $p->nama_ayah, 'id_pekerjaan_ayah' => $p->id_pekerjaan_ayah,
                        'nama_ibu' => $p->nama_ibu, 'id_pekerjaan_ibu' => $p->id_pekerjaan_ibu, 'jalan_ortu' => Str::limit($p->alamat, 250, ''), 'no_wa' => $p->no_wa,
                    ]);
                }
                $idOrtu = $ortu->id_ortu;
            }
            $idWali = null;
            if (filled($p->nama_wali)) {
                $wali = $this->cariKeluarga(MasterWali::query(), $p->no_wa, ['nama_wali' => $p->nama_wali])
                    ?? MasterWali::create([
                        'id_wali' => 'WLI-' . Str::upper(Str::random(8)), 'nama_wali' => $p->nama_wali, 'id_pekerjaan_wali' => $p->id_pekerjaan_wali,
                        'jalan_wali' => Str::limit($p->alamat, 250, ''), 'no_wa' => $p->no_wa,
                    ]);
                $idWali = $wali->id_wali;
            }
            $idSekolahAsal = null;
            if (filled($p->sekolah_asal)) {
                $idSekolahAsal = MasterSekolahAsal::whereRaw('lower(nama_sekolah) = ?', [mb_strtolower(trim($p->sekolah_asal))])->value('id_sekolah_asal')
                    ?? MasterSekolahAsal::create(['id_sekolah_asal' => 'SKA-' . Str::upper(Str::random(8)), 'nama_sekolah' => trim($p->sekolah_asal)])->id_sekolah_asal;
            }

            $siswa = Student::create([
                'id_siswa' => 'SIS-' . now()->format('YmdHis') . Str::upper(Str::random(3)),
                'nisn' => $p->nisn ?: null, 'nama_siswa' => $p->nama_siswa, 'panggilan' => $p->panggilan, 'id_kelas' => $v['id_kelas'] ?? null,
                'jenis_kelamin' => $p->jenis_kelamin, 'tempat_lahir' => $p->tempat_lahir, 'tgl_lahir' => $p->tgl_lahir,
                'id_suku' => $p->id_suku, 'id_agama' => $p->id_agama, 'id_sekolah_asal' => $idSekolahAsal,
                'status_tempat_tinggal' => $idOrtu || !$idWali ? 'Bersama Orang Tua' : 'Bersama Wali',
                'jalan_siswa' => $p->alamat, 'id_ortu' => $idOrtu, 'id_wali' => $idWali, 'no_wa' => $p->no_wa,
            ]);
            $p->update(['status' => 'SELESAI', 'id_siswa' => $siswa->id_siswa, 'selesai_at' => now(), 'daftar_ulang_at' => $p->daftar_ulang_at ?? now()]);
            return $siswa;
        });

        return response()->json([
            'message' => "{$siswa->nama_siswa} kini tercatat sebagai siswa" . ($catatan ? ' (' . implode(', ', $catatan) . ')' : '') . '.',
            'data' => ['id_siswa' => $siswa->id_siswa],
        ]);
    }

    // POST /administrasi/spmb/pendaftar/{id}/kode-baru — pendaftar lupa kode akses (datang ke sekolah)
    public function kodeBaru(int $id)
    {
        $p = SpmbPendaftar::findOrFail($id);
        $kode = SpmbPublikController::buatKode();
        $p->update(['kode_akses' => \Illuminate\Support\Facades\Hash::make($kode)]);
        return response()->json(['message' => 'Kode akses baru dibuat. Kode lama tidak berlaku lagi.', 'data' => ['nomor_daftar' => $p->nomor_daftar, 'kode_akses' => $kode]]);
    }

    // DELETE /administrasi/spmb/pendaftar/{id} — mis. pendaftaran ganda/iseng
    public function hapus(int $id)
    {
        $p = SpmbPendaftar::with('berkas')->findOrFail($id);
        $this->belumSelesai($p);
        $path = $p->berkas->pluck('path')->all();
        $p->delete();
        Storage::disk('local')->delete($path);
        return response()->json(['message' => "Pendaftaran {$p->nomor_daftar} dihapus."]);
    }

    // GET /administrasi/spmb/berkas/{id} — tampilkan berkas dari disk privat
    public function berkas(int $id)
    {
        $b = SpmbBerkas::findOrFail($id);
        abort_unless(Storage::disk('local')->exists($b->path), 404, 'Berkas tidak ditemukan di server.');
        return Storage::disk('local')->response($b->path, $b->nama_asli ?: basename($b->path), ['Content-Type' => $b->mime, 'Cache-Control' => 'private, no-store']);
    }

    // ===== bantuan =====

    private function validasiGelombang(Request $request): array
    {
        $v = $request->validate([
            'nama' => 'required|string|max:100',
            'tahun_ajaran' => ['required', 'regex:/^\d{4}\/\d{4}$/'],
            'tgl_buka' => 'required|date',
            'tgl_tutup' => 'required|date|after_or_equal:tgl_buka',
            'tgl_pengumuman' => 'nullable|date|after_or_equal:tgl_buka',
            'kuota' => 'nullable|integer|min:1|max:10000',
            'berkas_wajib' => 'array',
            'berkas_wajib.*' => [Rule::in(array_keys(Spmb::BERKAS))],
            'info' => 'nullable|string|max:2000',
        ], ['tahun_ajaran.regex' => 'Tahun ajaran ditulis seperti 2027/2028.', 'tgl_tutup.after_or_equal' => 'Tanggal tutup tidak boleh sebelum tanggal buka.']);
        $v['berkas_wajib'] = array_values(array_intersect(array_keys(Spmb::BERKAS), $v['berkas_wajib'] ?? []));
        return $v;
    }

    private function belumSelesai(SpmbPendaftar $p): void
    {
        if ($p->status === 'SELESAI') {
            throw ValidationException::withMessages(['status' => 'Pendaftar ini sudah menjadi siswa. Ubah datanya di Master Siswa.']);
        }
    }

    /** Keluarga yang sama (mis. kakak sudah bersekolah): nomor WA sama dan salah satu nama cocok. */
    private function cariKeluarga($query, ?string $noWa, array $nama)
    {
        $nama = array_filter($nama, 'filled');
        if (!filled($noWa) || !$nama) return null;
        return $query->where('no_wa', $noWa)->where(function ($w) use ($nama) {
            foreach ($nama as $kolom => $isi) $w->orWhereRaw("lower({$kolom}) = ?", [mb_strtolower(trim($isi))]);
        })->first();
    }
}

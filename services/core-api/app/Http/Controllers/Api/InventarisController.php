<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\InvBarang;
use App\Models\InvPemeriksaan;
use App\Models\InvPeminjaman;
use App\Models\InvPengadaan;
use App\Models\InvStok;
use App\Models\InvStokMutasi;
use App\Models\KeuKas;
use App\Models\MasterRuangan;
use Illuminate\Database\QueryException;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/**
 * Inventaris (Administrasi Sekolah Tahap E): aset per ruang dengan kondisi & penyusutan, pemeriksaan berkala,
 * peminjaman, stok barang habis pakai, dan pengadaan (pengajuan → keputusan kepala sekolah → diterima).
 */
class InventarisController extends Controller
{
    public const KONDISI = ['BAIK' => 'Baik', 'RUSAK_RINGAN' => 'Rusak ringan', 'RUSAK_BERAT' => 'Rusak berat', 'HILANG' => 'Hilang'];
    public const KATEGORI = ['Mebel', 'Elektronik', 'Alat peraga', 'Buku', 'Olahraga', 'Kebersihan', 'Kendaraan', 'Lainnya'];
    public const SUMBER_DANA = ['BOS', 'Yayasan', 'Hibah', 'Swadaya', 'Lainnya'];

    private static function tolak(string $kolom, string $pesan): never
    {
        throw ValidationException::withMessages([$kolom => $pesan]);
    }

    private function hariIni(): string
    {
        return now(config('app.zona_sekolah'))->toDateString();
    }

    public function pilihan()
    {
        return response()->json(['data' => [
            'kondisi' => collect(self::KONDISI)->map(fn($n, $k) => ['kode' => $k, 'nama' => $n])->values(),
            'kategori' => self::KATEGORI, 'sumber_dana' => self::SUMBER_DANA,
            'ruangan' => MasterRuangan::orderBy('nama_ruangan')->get(['id_ruangan', 'nama_ruangan']),
            'hari_ini' => $this->hariIni(),
        ]]);
    }

    public function ringkasan()
    {
        $barang = InvBarang::whereNull('dihapus_at')->get();
        return response()->json(['data' => [
            'jenis_barang' => $barang->count(),
            'unit' => $barang->sum('jumlah'),
            'nilai_perolehan' => $barang->sum(fn($b) => $b->harga_perolehan * $b->jumlah),
            'nilai_buku' => $barang->sum(fn($b) => $b->nilaiBuku()),
            'per_kondisi' => $barang->groupBy('kondisi')->map->sum('jumlah'),
            'dipinjam' => InvPeminjaman::where('status', 'DIPINJAM')->count(),
            'terlambat' => InvPeminjaman::where('status', 'DIPINJAM')->whereNotNull('rencana_kembali')->where('rencana_kembali', '<', $this->hariIni())->count(),
            'stok_menipis' => InvStok::where('aktif', true)->whereColumn('stok', '<=', 'stok_minimum')->where('stok_minimum', '>', 0)->count(),
            'pengadaan_diajukan' => InvPengadaan::where('status', 'DIAJUKAN')->count(),
        ]]);
    }

    // ===================== ASET =====================

    public function barang(Request $request)
    {
        $dipinjam = InvPeminjaman::where('status', 'DIPINJAM')->groupBy('id_barang')->selectRaw('id_barang, sum(jumlah) as n')->pluck('n', 'id_barang');
        $q = InvBarang::with('ruangan:id_ruangan,nama_ruangan')
            ->when($request->boolean('dihapus'), fn($q) => $q->whereNotNull('dihapus_at'), fn($q) => $q->whereNull('dihapus_at'))
            ->when($request->id_ruangan, fn($q, $v) => $v === 'TANPA' ? $q->whereNull('id_ruangan') : $q->where('id_ruangan', $v))
            ->when($request->kategori, fn($q, $v) => $q->where('kategori', $v))
            ->when($request->kondisi, fn($q, $v) => $q->where('kondisi', $v))
            ->when($request->search, fn($q, $v) => $q->where(fn($w) => $w->where('nama', 'ilike', "%{$v}%")->orWhere('kode', 'ilike', "%{$v}%")->orWhere('merek', 'ilike', "%{$v}%")));
        $data = $q->orderBy('id_ruangan')->orderBy('nama')->limit(2000)->get()->map(fn($b) => $b->toArray() + [
            'nilai_buku' => $b->nilaiBuku(), 'dipinjam' => (int) ($dipinjam[$b->id] ?? 0),
        ]);
        return response()->json(['data' => $data]);
    }

    public function detailBarang(int $id)
    {
        $b = InvBarang::with(['ruangan:id_ruangan,nama_ruangan', 'pemeriksaan' => fn($q) => $q->with('pemeriksa:id,name,id_guru')->latest('tanggal')->latest('id'),
            'peminjaman' => fn($q) => $q->with('pencatat:id,name,id_guru')->latest('tgl_pinjam')->latest('id')])->findOrFail($id);
        return response()->json(['data' => $b->toArray() + ['nilai_buku' => $b->nilaiBuku()]]);
    }

    private function aturanBarang(): array
    {
        return [
            'nama' => 'required|string|max:150',
            'kategori' => 'required|string|max:60',
            'id_ruangan' => 'nullable|exists:master_ruangan,id_ruangan',
            'merek' => 'nullable|string|max:100',
            'jumlah' => 'required|integer|min:1|max:100000',
            'satuan' => 'required|string|max:20',
            'kondisi' => ['required', Rule::in(array_keys(self::KONDISI))],
            'tanggal_perolehan' => 'nullable|date',
            'harga_perolehan' => 'nullable|integer|min:0|max:10000000000',
            'umur_ekonomis' => 'nullable|integer|min:1|max:100',
            'sumber_dana' => 'nullable|string|max:60',
            'keterangan' => 'nullable|string|max:2000',
        ];
    }

    /** Kode INV-{tahun}-{0001}; dicoba ulang bila bentrok. */
    private function kodeBaru(): string
    {
        $tahun = substr($this->hariIni(), 0, 4);
        $akhir = InvBarang::where('kode', 'like', "INV-{$tahun}-%")->orderByDesc('kode')->value('kode');
        return sprintf('INV-%s-%04d', $tahun, ($akhir ? (int) substr($akhir, -4) : 0) + 1);
    }

    public function simpanBarang(Request $request)
    {
        $data = $request->validate($this->aturanBarang());
        $data['harga_perolehan'] ??= 0;
        for ($coba = 0; ; $coba++) {
            try {
                $b = DB::transaction(fn() => InvBarang::create($data + ['kode' => $this->kodeBaru()]));
                break;
            } catch (QueryException $e) {
                if ($coba >= 4 || !str_contains($e->getMessage(), 'kode')) throw $e;
            }
        }
        return response()->json(['message' => "Aset {$b->nama} dicatat dengan kode {$b->kode}.", 'data' => $b], 201);
    }

    public function ubahBarang(Request $request, int $id)
    {
        $b = InvBarang::findOrFail($id);
        $data = $request->validate($this->aturanBarang());
        $data['harga_perolehan'] ??= 0;
        $dipinjam = (int) $b->peminjaman()->where('status', 'DIPINJAM')->sum('jumlah');
        if ($data['jumlah'] < $dipinjam) self::tolak('jumlah', "Jumlah tidak boleh kurang dari yang sedang dipinjam ({$dipinjam}).");
        $kondisiLama = $b->kondisi;
        $b->update($data);
        if ($kondisiLama !== $b->kondisi) {
            InvPemeriksaan::create(['id_barang' => $b->id, 'tanggal' => $this->hariIni(), 'kondisi' => $b->kondisi, 'catatan' => 'Kondisi diubah dari data aset', 'oleh' => $request->user()->id]);
        }
        return response()->json(['message' => 'Aset diperbarui.', 'data' => $b]);
    }

    /** Hapus dari buku inventaris (aset rusak berat/hilang/dihibahkan); riwayat tetap tersimpan. */
    public function hapusBarang(Request $request, int $id)
    {
        $b = InvBarang::findOrFail($id);
        $request->validate(['alasan' => 'required|string|max:255'], ['alasan.required' => 'Tulis alasan penghapusan.']);
        if ($b->peminjaman()->where('status', 'DIPINJAM')->exists()) self::tolak('alasan', 'Aset ini masih dipinjam. Catat pengembaliannya dulu.');
        $b->update(['dihapus_at' => now(), 'alasan_hapus' => $request->alasan]);
        return response()->json(['message' => "Aset {$b->nama} dihapus dari buku inventaris."]);
    }

    public function periksa(Request $request, int $id)
    {
        $b = InvBarang::findOrFail($id);
        $data = $request->validate([
            'tanggal' => 'required|date|before_or_equal:' . $this->hariIni(),
            'kondisi' => ['required', Rule::in(array_keys(self::KONDISI))],
            'catatan' => 'nullable|string|max:1000',
        ]);
        $p = InvPemeriksaan::create($data + ['id_barang' => $b->id, 'oleh' => $request->user()->id]);
        $b->update(['kondisi' => $data['kondisi']]);
        return response()->json(['message' => 'Hasil pemeriksaan dicatat.', 'data' => $p], 201);
    }

    // ===================== PEMINJAMAN =====================

    public function peminjaman(Request $request)
    {
        $q = InvPeminjaman::with(['barang:id,kode,nama,satuan,id_ruangan', 'barang.ruangan:id_ruangan,nama_ruangan', 'pencatat:id,name,id_guru'])
            ->when($request->status, fn($q, $v) => $q->where('status', $v));
        return response()->json(['data' => $q->orderByRaw("status = 'DIPINJAM' desc")->latest('tgl_pinjam')->latest('id')->limit(500)->get(), 'hari_ini' => $this->hariIni()]);
    }

    public function pinjam(Request $request)
    {
        $data = $request->validate([
            'id_barang' => 'required|exists:inv_barang,id',
            'jumlah' => 'required|integer|min:1',
            'peminjam' => 'required|string|max:100',
            'keperluan' => 'nullable|string|max:255',
            'tgl_pinjam' => 'required|date|before_or_equal:' . $this->hariIni(),
            'rencana_kembali' => 'nullable|date|after_or_equal:tgl_pinjam',
        ], ['tgl_pinjam.before_or_equal' => 'Tanggal pinjam tidak boleh setelah hari ini.']);
        $p = DB::transaction(function () use ($data, $request) {
            $b = InvBarang::lockForUpdate()->findOrFail($data['id_barang']);
            if ($b->dihapus_at) self::tolak('id_barang', 'Aset ini sudah dihapus dari buku inventaris.');
            if (in_array($b->kondisi, ['RUSAK_BERAT', 'HILANG'], true)) self::tolak('id_barang', 'Aset dalam kondisi ' . strtolower(self::KONDISI[$b->kondisi]) . ' tidak bisa dipinjam.');
            $tersedia = $b->jumlah - (int) $b->peminjaman()->where('status', 'DIPINJAM')->sum('jumlah');
            if ($data['jumlah'] > $tersedia) self::tolak('jumlah', "Hanya {$tersedia} {$b->satuan} yang tersedia.");
            return InvPeminjaman::create($data + ['status' => 'DIPINJAM', 'dicatat_oleh' => $request->user()->id]);
        });
        return response()->json(['message' => 'Peminjaman dicatat.', 'data' => $p], 201);
    }

    public function kembali(Request $request, int $id)
    {
        $p = InvPeminjaman::with('barang')->findOrFail($id);
        if ($p->status !== 'DIPINJAM') self::tolak('status', 'Peminjaman ini sudah dikembalikan.');
        $data = $request->validate([
            'tgl_kembali' => 'required|date|before_or_equal:' . $this->hariIni(),
            'kondisi_kembali' => ['required', Rule::in(array_keys(self::KONDISI))],
            'catatan_kembali' => 'nullable|string|max:1000',
        ]);
        if ($data['tgl_kembali'] < $p->tgl_pinjam->toDateString()) self::tolak('tgl_kembali', 'Tanggal kembali tidak boleh sebelum tanggal pinjam.');
        DB::transaction(function () use ($p, $data, $request) {
            $p->update($data + ['status' => 'KEMBALI']);
            // Kembali tidak dalam kondisi baik → kondisi aset ikut diperbarui dan tercatat di riwayat pemeriksaan
            if ($data['kondisi_kembali'] !== 'BAIK' && $data['kondisi_kembali'] !== $p->barang->kondisi) {
                $p->barang->update(['kondisi' => $data['kondisi_kembali']]);
                InvPemeriksaan::create(['id_barang' => $p->id_barang, 'tanggal' => $data['tgl_kembali'], 'kondisi' => $data['kondisi_kembali'],
                    'catatan' => "Dikembalikan oleh {$p->peminjam}" . ($data['catatan_kembali'] ? ": {$data['catatan_kembali']}" : ''), 'oleh' => $request->user()->id]);
            }
        });
        return response()->json(['message' => 'Pengembalian dicatat.']);
    }

    // ===================== STOK HABIS PAKAI =====================

    public function stok()
    {
        return response()->json(['data' => InvStok::orderByDesc('aktif')->orderBy('nama')->get()]);
    }

    public function detailStok(int $id)
    {
        return response()->json(['data' => InvStok::with(['mutasi' => fn($q) => $q->with('pencatat:id,name,id_guru')->latest('tanggal')->latest('id')->limit(200)])->findOrFail($id)]);
    }

    private function aturanStok(): array
    {
        return ['nama' => 'required|string|max:150', 'kategori' => 'nullable|string|max:60', 'satuan' => 'required|string|max:20',
            'stok_minimum' => 'required|integer|min:0|max:1000000', 'keterangan' => 'nullable|string|max:1000', 'aktif' => 'boolean'];
    }

    public function simpanStok(Request $request)
    {
        $data = $request->validate($this->aturanStok() + ['stok_awal' => 'nullable|integer|min:0|max:1000000']);
        $s = DB::transaction(function () use ($data, $request) {
            $awal = (int) ($data['stok_awal'] ?? 0);
            unset($data['stok_awal']);
            $s = InvStok::create($data + ['stok' => $awal]);
            if ($awal > 0) $s->mutasi()->create(['tanggal' => $this->hariIni(), 'arah' => 'MASUK', 'jumlah' => $awal, 'keterangan' => 'Stok awal', 'dicatat_oleh' => $request->user()->id]);
            return $s;
        });
        return response()->json(['message' => "Barang {$s->nama} ditambahkan.", 'data' => $s], 201);
    }

    public function ubahStok(Request $request, int $id)
    {
        $s = InvStok::findOrFail($id);
        $s->update($request->validate($this->aturanStok()));
        return response()->json(['message' => 'Barang habis pakai diperbarui.', 'data' => $s]);
    }

    public function mutasi(Request $request, int $id)
    {
        $data = $request->validate([
            'tanggal' => 'required|date|before_or_equal:' . $this->hariIni(),
            'arah' => 'required|in:MASUK,KELUAR',
            'jumlah' => 'required|integer|min:1|max:1000000',
            'keterangan' => 'nullable|string|max:255',
        ]);
        $s = DB::transaction(function () use ($id, $data, $request) {
            $s = InvStok::lockForUpdate()->findOrFail($id);
            if ($data['arah'] === 'KELUAR' && $data['jumlah'] > $s->stok) self::tolak('jumlah', "Stok {$s->nama} tinggal {$s->stok} {$s->satuan}.");
            $s->mutasi()->create($data + ['dicatat_oleh' => $request->user()->id]);
            $s->update(['stok' => $s->stok + ($data['arah'] === 'MASUK' ? $data['jumlah'] : -$data['jumlah'])]);
            return $s;
        });
        $pesan = ($data['arah'] === 'MASUK' ? 'Barang masuk' : 'Barang keluar') . " dicatat. Stok {$s->nama} sekarang {$s->stok} {$s->satuan}.";
        if ($s->stok_minimum > 0 && $s->stok <= $s->stok_minimum) $pesan .= ' Stok sudah di batas minimum.';
        return response()->json(['message' => $pesan, 'data' => $s]);
    }

    // ===================== PENGADAAN =====================

    public function pengadaan(Request $request)
    {
        $q = InvPengadaan::with(['pengaju:id,name,id_guru', 'pemutus:id,name'])->when($request->status, fn($q, $v) => $q->where('status', $v));
        return response()->json(['data' => $q->orderByRaw("status = 'DIAJUKAN' desc")->latest('tanggal')->latest('id')->limit(500)->get()]);
    }

    private function dataPengadaan(Request $request): array
    {
        $data = $request->validate([
            'judul' => 'required|string|max:200',
            'tanggal' => 'required|date',
            'alasan' => 'nullable|string|max:2000',
            'rincian' => 'required|array|min:1|max:100',
            'rincian.*.nama' => 'required|string|max:150',
            'rincian.*.jumlah' => 'required|integer|min:1|max:100000',
            'rincian.*.satuan' => 'required|string|max:20',
            'rincian.*.harga' => 'required|integer|min:0|max:10000000000',
        ], ['rincian.required' => 'Isi minimal satu barang.']);
        $data['rincian'] = collect($data['rincian'])->map(fn($r) => ['nama' => $r['nama'], 'jumlah' => (int) $r['jumlah'], 'satuan' => $r['satuan'], 'harga' => (int) $r['harga']])->all();
        $data['total'] = collect($data['rincian'])->sum(fn($r) => $r['jumlah'] * $r['harga']);
        return $data;
    }

    public function simpanPengadaan(Request $request)
    {
        $p = InvPengadaan::create($this->dataPengadaan($request) + ['status' => 'DIAJUKAN', 'diajukan_oleh' => $request->user()->id]);
        return response()->json(['message' => 'Pengadaan diajukan ke kepala sekolah.', 'data' => $p], 201);
    }

    public function ubahPengadaan(Request $request, int $id)
    {
        $p = InvPengadaan::findOrFail($id);
        if ($p->status !== 'DIAJUKAN') self::tolak('status', 'Pengadaan yang sudah diputuskan tidak bisa diubah.');
        $p->update($this->dataPengadaan($request));
        return response()->json(['message' => 'Pengajuan pengadaan diperbarui.', 'data' => $p]);
    }

    /** Keputusan kepala sekolah: setujui atau tolak. */
    public function putuskan(Request $request, int $id)
    {
        abort_unless($request->user()->isKepsek(), 403, 'Hanya kepala sekolah yang dapat memutuskan pengadaan.');
        $data = $request->validate(['keputusan' => 'required|in:DISETUJUI,DITOLAK', 'catatan' => 'nullable|string|max:1000']);
        $p = InvPengadaan::findOrFail($id);
        if ($p->status !== 'DIAJUKAN') self::tolak('keputusan', 'Pengadaan ini sudah diputuskan.');
        if ($data['keputusan'] === 'DITOLAK' && !filled($data['catatan'] ?? null)) self::tolak('catatan', 'Tulis alasan penolakan.');
        $p->update(['status' => $data['keputusan'], 'catatan_keputusan' => $data['catatan'] ?? null, 'diputuskan_oleh' => $request->user()->id, 'diputuskan_at' => now()]);
        return response()->json(['message' => $data['keputusan'] === 'DISETUJUI' ? 'Pengadaan disetujui.' : 'Pengadaan ditolak.']);
    }

    /**
     * Barang pengadaan sudah diterima. Opsional: catat pengeluaran di kas Keuangan, dan masukkan barangnya
     * ke aset (dengan ruangan) atau ke stok habis pakai.
     */
    public function selesaikan(Request $request, int $id)
    {
        $p = InvPengadaan::findOrFail($id);
        if ($p->status !== 'DISETUJUI') self::tolak('status', 'Hanya pengadaan yang disetujui yang bisa diselesaikan.');
        $data = $request->validate([
            'tanggal' => 'required|date|before_or_equal:' . $this->hariIni(),
            'catat_kas' => 'boolean',
            'masuk' => 'nullable|array',
            'masuk.*.indeks' => 'required|integer|min:0',
            'masuk.*.ke' => 'required|in:ASET,STOK,TIDAK',
            'masuk.*.kategori' => 'nullable|string|max:60',
            'masuk.*.id_ruangan' => 'nullable|exists:master_ruangan,id_ruangan',
            'masuk.*.id_stok' => 'nullable|exists:inv_stok,id',
        ]);
        $hasil = DB::transaction(function () use ($p, $data, $request) {
            $hasil = ['aset' => 0, 'stok' => 0];
            if ($data['catat_kas'] ?? false) {
                $kas = KeuKas::create(['tanggal' => $data['tanggal'], 'arah' => 'KELUAR', 'kategori' => 'Pengadaan barang', 'jumlah' => $p->total,
                    'keterangan' => "Pengadaan: {$p->judul}", 'dicatat_oleh' => $request->user()->id]);
                $p->id_kas = $kas->id;
            }
            foreach ($data['masuk'] ?? [] as $m) {
                $r = $p->rincian[$m['indeks']] ?? null;
                if (!$r || $m['ke'] === 'TIDAK') continue;
                if ($m['ke'] === 'ASET') {
                    for ($coba = 0; ; $coba++) {
                        try {
                            DB::transaction(fn() => InvBarang::create([
                                'kode' => $this->kodeBaru(), 'nama' => $r['nama'], 'kategori' => $m['kategori'] ?: 'Lainnya', 'id_ruangan' => $m['id_ruangan'] ?? null,
                                'jumlah' => $r['jumlah'], 'satuan' => $r['satuan'], 'kondisi' => 'BAIK', 'tanggal_perolehan' => $data['tanggal'],
                                'harga_perolehan' => $r['harga'], 'keterangan' => "Dari pengadaan: {$p->judul}",
                            ]));
                            break;
                        } catch (QueryException $e) {
                            if ($coba >= 4) throw $e;
                        }
                    }
                    $hasil['aset']++;
                } else {
                    $s = isset($m['id_stok']) ? InvStok::lockForUpdate()->find($m['id_stok'])
                        : InvStok::create(['nama' => $r['nama'], 'kategori' => $m['kategori'] ?? null, 'satuan' => $r['satuan'], 'stok' => 0]);
                    $s->mutasi()->create(['tanggal' => $data['tanggal'], 'arah' => 'MASUK', 'jumlah' => $r['jumlah'], 'keterangan' => "Pengadaan: {$p->judul}", 'dicatat_oleh' => $request->user()->id]);
                    $s->update(['stok' => $s->stok + $r['jumlah']]);
                    $hasil['stok']++;
                }
            }
            $p->status = 'SELESAI';
            $p->selesai_at = now();
            $p->save();
            return $hasil;
        });
        $pesan = 'Pengadaan selesai.';
        if ($hasil['aset']) $pesan .= " {$hasil['aset']} barang masuk ke aset.";
        if ($hasil['stok']) $pesan .= " {$hasil['stok']} barang masuk ke stok.";
        if ($data['catat_kas'] ?? false) $pesan .= ' Pengeluaran dicatat di kas.';
        return response()->json(['message' => $pesan]);
    }

    public function hapusPengadaan(int $id)
    {
        $p = InvPengadaan::findOrFail($id);
        if (!in_array($p->status, ['DIAJUKAN', 'DITOLAK'], true)) self::tolak('status', 'Pengadaan yang disetujui atau selesai tidak bisa dihapus.');
        $p->delete();
        return response()->json(['message' => 'Pengajuan pengadaan dihapus.']);
    }
}

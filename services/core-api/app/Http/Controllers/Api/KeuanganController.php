<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Classes;
use App\Models\KeuBeasiswa;
use App\Models\KeuJenisBiaya;
use App\Models\KeuKas;
use App\Models\KeuPembayaran;
use App\Models\KeuPembayaranRincian;
use App\Models\KeuPengingat;
use App\Models\KeuTagihan;
use App\Models\KeuTujuanBayar;
use App\Models\MasterPeriode;
use App\Models\SchoolSetting;
use App\Models\Student;
use App\Services\WhatsAppService;
use App\Support\Keuangan;
use Carbon\Carbon;
use Illuminate\Database\QueryException;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/**
 * Keuangan & Pembayaran (Administrasi Sekolah Tahap C): jenis biaya, beasiswa/potongan, tagihan per siswa,
 * pembayaran + kuitansi, tunggakan + pengingat WhatsApp, dan laporan kas. Pembayaran dicatat operator
 * (tunai/transfer); pembayaran daring lewat payment gateway belum termasuk.
 */
class KeuanganController extends Controller
{
    private function hariIni(): string
    {
        return now(config('app.zona_sekolah'))->toDateString();
    }

    private static function tolak(string $kolom, string $pesan): never
    {
        throw ValidationException::withMessages([$kolom => $pesan]);
    }

    // ===================== PILIHAN & RINGKASAN =====================

    public function pilihan()
    {
        $s = SchoolSetting::first();
        return response()->json(['data' => [
            'periode' => collect(Keuangan::PERIODE)->map(fn($n, $k) => ['kode' => $k, 'nama' => $n])->values(),
            'status' => collect(Keuangan::STATUS)->map(fn($n, $k) => ['kode' => $k, 'nama' => $n])->values(),
            'metode' => collect(Keuangan::METODE)->map(fn($n, $k) => ['kode' => $k, 'nama' => $n])->values(),
            'kategori_kas' => Keuangan::KATEGORI_KAS,
            'jenis_biaya' => KeuJenisBiaya::orderByDesc('aktif')->orderBy('nama')->get(),
            'kelas' => Classes::orderBy('nama_kelas')->get(['id_kelas', 'nama_kelas']),
            'tahun_ajaran' => MasterPeriode::where('status_aktif', 'AKTIF')->value('tahun_ajaran'),
            'hari_ini' => $this->hariIni(),
            'wa_otomatis' => (bool) ($s?->status_wa_api && $s?->wa_api_token),
            'jenis_tujuan' => collect(Keuangan::JENIS_TUJUAN)->map(fn($n, $k) => ['kode' => $k, 'nama' => $n])->values(),
            'tujuan_bayar' => KeuTujuanBayar::orderByDesc('aktif')->orderBy('urutan')->orderBy('id')->get(),
        ]]);
    }

    public function ringkasan()
    {
        $hariIni = $this->hariIni();
        $aktif = KeuTagihan::whereIn('status', ['BELUM', 'SEBAGIAN']);
        $sisa = 'nominal - potongan - terbayar';
        $bulan = substr($hariIni, 0, 7);
        $masuk = fn($q) => $q->whereNull('dibatalkan_at');
        return response()->json(['data' => [
            'tagihan_aktif' => (clone $aktif)->count(),
            'sisa_tagihan' => (int) (clone $aktif)->sum(DB::raw($sisa)),
            'tunggakan' => (int) (clone $aktif)->where('jatuh_tempo', '<', $hariIni)->sum(DB::raw($sisa)),
            'siswa_menunggak' => (clone $aktif)->where('jatuh_tempo', '<', $hariIni)->distinct()->count('id_siswa'),
            'penerimaan_hari_ini' => (int) $masuk(KeuPembayaran::query())->where('tanggal', $hariIni)->sum('jumlah'),
            'penerimaan_bulan_ini' => (int) $masuk(KeuPembayaran::query())->where('tanggal', '>=', "{$bulan}-01")->where('tanggal', '<=', $hariIni)->sum('jumlah'),
            'pembayaran_terakhir' => KeuPembayaran::with('siswa:id_siswa,nama_siswa')->whereNull('dibatalkan_at')->latest('id')->limit(5)
                ->get(['id', 'nomor_kuitansi', 'id_siswa', 'tanggal', 'jumlah', 'metode']),
        ]]);
    }

    // ===================== JENIS BIAYA =====================

    private function aturanJenis(): array
    {
        return [
            'nama' => 'required|string|max:100',
            'periode' => ['required', Rule::in(array_keys(Keuangan::PERIODE))],
            'nominal' => 'required|integer|min:0|max:1000000000',
            'keterangan' => 'nullable|string|max:1000',
            'aktif' => 'boolean',
        ];
    }

    public function simpanJenis(Request $request)
    {
        $data = $request->validate($this->aturanJenis());
        $j = KeuJenisBiaya::create($data);
        return response()->json(['message' => "Jenis biaya {$j->nama} dibuat.", 'data' => $j], 201);
    }

    public function ubahJenis(Request $request, int $id)
    {
        $j = KeuJenisBiaya::findOrFail($id);
        $data = $request->validate($this->aturanJenis());
        // Periode tidak bisa diganti bila sudah ada tagihan, karena kode periode tagihan bergantung padanya
        if ($data['periode'] !== $j->periode && $j->tagihan()->exists()) {
            self::tolak('periode', 'Jenis biaya ini sudah punya tagihan, jadi periodenya tidak bisa diganti. Buat jenis biaya baru.');
        }
        $j->update($data);
        return response()->json(['message' => 'Jenis biaya diperbarui. Tagihan yang sudah dibuat tidak berubah.', 'data' => $j]);
    }

    public function hapusJenis(int $id)
    {
        $j = KeuJenisBiaya::findOrFail($id);
        if ($j->tagihan()->exists()) {
            return response()->json(['message' => 'Jenis biaya ini sudah dipakai di tagihan. Nonaktifkan saja agar tidak muncul saat membuat tagihan baru.'], 422);
        }
        $j->delete();
        return response()->json(['message' => "Jenis biaya {$j->nama} dihapus."]);
    }

    // ===================== TUJUAN PEMBAYARAN =====================

    private function aturanTujuan(): array
    {
        return [
            'jenis' => ['required', Rule::in(array_keys(Keuangan::JENIS_TUJUAN))],
            'penyedia' => 'required|string|max:50',
            'nomor' => 'required|string|max:50',
            'atas_nama' => 'nullable|string|max:100',
            'catatan' => 'nullable|string|max:255',
            'aktif' => 'boolean',
            'urutan' => 'nullable|integer|min:0|max:1000',
        ];
    }

    public function simpanTujuan(Request $request)
    {
        $t = KeuTujuanBayar::create($request->validate($this->aturanTujuan()));
        return response()->json(['message' => "Tujuan pembayaran {$t->penyedia} disimpan.", 'data' => $t], 201);
    }

    public function ubahTujuan(Request $request, int $id)
    {
        $t = KeuTujuanBayar::findOrFail($id);
        $t->update($request->validate($this->aturanTujuan()));
        return response()->json(['message' => 'Tujuan pembayaran diperbarui.', 'data' => $t]);
    }

    public function hapusTujuan(int $id)
    {
        $t = KeuTujuanBayar::findOrFail($id);
        $t->delete();
        return response()->json(['message' => "Tujuan pembayaran {$t->penyedia} dihapus."]);
    }

    /** Tujuan pembayaran aktif untuk ditampilkan ke orang tua. */
    private static function tujuanAktif(): Collection
    {
        return KeuTujuanBayar::where('aktif', true)->orderBy('urutan')->orderBy('id')->get(['jenis', 'penyedia', 'nomor', 'atas_nama', 'catatan']);
    }

    // ===================== BEASISWA / POTONGAN =====================

    public function beasiswa()
    {
        return response()->json(['data' => KeuBeasiswa::with(['siswa:id_siswa,nama_siswa,id_kelas', 'siswa.kelas:id_kelas,nama_kelas', 'jenisBiaya:id,nama'])
            ->orderByDesc('aktif')->latest('id')->get()]);
    }

    private function aturanBeasiswa(): array
    {
        return [
            'id_siswa' => 'required|exists:students,id_siswa',
            'id_jenis_biaya' => 'nullable|exists:keu_jenis_biaya,id',
            'nama' => 'required|string|max:100',
            'bentuk' => 'required|in:PERSEN,NOMINAL',
            'nilai' => 'required|integer|min:1|max:1000000000',
            'aktif' => 'boolean',
        ];
    }

    public function simpanBeasiswa(Request $request)
    {
        $data = $request->validate($this->aturanBeasiswa());
        if ($data['bentuk'] === 'PERSEN' && $data['nilai'] > 100) self::tolak('nilai', 'Potongan persen paling besar 100.');
        $b = KeuBeasiswa::create($data);
        return response()->json(['message' => 'Beasiswa/potongan disimpan. Berlaku untuk tagihan yang dibuat sesudah ini.', 'data' => $b], 201);
    }

    public function ubahBeasiswa(Request $request, int $id)
    {
        $b = KeuBeasiswa::findOrFail($id);
        $data = $request->validate($this->aturanBeasiswa());
        if ($data['bentuk'] === 'PERSEN' && $data['nilai'] > 100) self::tolak('nilai', 'Potongan persen paling besar 100.');
        $b->update($data);
        return response()->json(['message' => 'Beasiswa/potongan diperbarui. Tagihan yang sudah dibuat tidak berubah.', 'data' => $b]);
    }

    public function hapusBeasiswa(int $id)
    {
        KeuBeasiswa::findOrFail($id)->delete();
        return response()->json(['message' => 'Beasiswa/potongan dihapus.']);
    }

    // ===================== TAGIHAN =====================

    /**
     * Buat tagihan massal: satu jenis biaya untuk beberapa bulan (bulanan) atau satu label (sekali bayar),
     * bagi semua siswa / kelas tertentu / siswa tertentu. Beasiswa aktif langsung dipotongkan; tagihan yang
     * sudah ada untuk periode yang sama dilewati.
     */
    public function buatTagihan(Request $request)
    {
        $data = $request->validate([
            'id_jenis_biaya' => 'required|exists:keu_jenis_biaya,id',
            'bulan' => 'array|max:12',
            'bulan.*' => ['string', 'regex:/^\d{4}-(0[1-9]|1[0-2])$/'],
            'label' => 'nullable|string|max:20',
            'hari_jatuh_tempo' => 'nullable|integer|min:1|max:28',
            'jatuh_tempo' => 'nullable|date',
            'nominal' => 'nullable|integer|min:1|max:1000000000',
            'sasaran' => 'required|in:SEMUA,KELAS,SISWA',
            'id_kelas' => 'required_if:sasaran,KELAS|array',
            'id_kelas.*' => 'string',
            'id_siswa' => 'required_if:sasaran,SISWA|array',
            'id_siswa.*' => 'string',
        ], ['id_kelas.required_if' => 'Pilih minimal satu kelas.', 'id_siswa.required_if' => 'Pilih minimal satu siswa.']);

        $jenis = KeuJenisBiaya::findOrFail($data['id_jenis_biaya']);
        $nominal = $data['nominal'] ?? $jenis->nominal;
        if ($nominal < 1) self::tolak('nominal', 'Isi nominal tagihan.');

        // Daftar periode: [kode, judul, jatuh tempo]
        if ($jenis->periode === 'BULANAN') {
            if (empty($data['bulan'])) self::tolak('bulan', 'Pilih minimal satu bulan.');
            $hari = $data['hari_jatuh_tempo'] ?? 10;
            $periode = collect($data['bulan'])->unique()->sort()->map(fn($b) => [
                $b, "{$jenis->nama} " . Keuangan::namaBulan($b), sprintf('%s-%02d', $b, $hari),
            ]);
        } else {
            $label = trim((string) ($data['label'] ?? '')) ?: MasterPeriode::where('status_aktif', 'AKTIF')->value('tahun_ajaran');
            if (!$label) self::tolak('label', 'Isi label tagihan, misalnya tahun ajaran 2027/2028.');
            if (empty($data['jatuh_tempo'])) self::tolak('jatuh_tempo', 'Isi tanggal jatuh tempo.');
            $periode = collect([[$label, "{$jenis->nama} {$label}", $data['jatuh_tempo']]]);
        }

        $siswa = Student::query()
            ->when($data['sasaran'] === 'KELAS', fn($q) => $q->whereIn('id_kelas', $data['id_kelas']))
            ->when($data['sasaran'] === 'SISWA', fn($q) => $q->whereIn('id_siswa', $data['id_siswa']))
            ->when($data['sasaran'] === 'SEMUA', fn($q) => $q->whereNotNull('id_kelas'))
            ->pluck('id_siswa');
        if ($siswa->isEmpty()) self::tolak('sasaran', 'Tidak ada siswa pada sasaran yang dipilih.');

        $beasiswa = KeuBeasiswa::where('aktif', true)->whereIn('id_siswa', $siswa)
            ->where(fn($q) => $q->whereNull('id_jenis_biaya')->orWhere('id_jenis_biaya', $jenis->id))
            ->get()->groupBy('id_siswa');
        $ada = KeuTagihan::where('id_jenis_biaya', $jenis->id)->where('status', '<>', 'BATAL')
            ->whereIn('periode_kode', $periode->pluck(0))->whereIn('id_siswa', $siswa)
            ->get(['id_siswa', 'periode_kode'])->map(fn($t) => "{$t->id_siswa}|{$t->periode_kode}")->flip();

        $dibuat = 0;
        $dilewati = 0;
        DB::transaction(function () use ($siswa, $periode, $ada, $beasiswa, $jenis, $nominal, $request, &$dibuat, &$dilewati) {
            foreach ($siswa as $id) {
                foreach ($periode as [$kode, $judul, $tempo]) {
                    if (isset($ada["{$id}|{$kode}"])) { $dilewati++; continue; }
                    $potong = ($beasiswa[$id] ?? collect());
                    $potongan = min($nominal, (int) $potong->sum(fn($b) => $b->potonganUntuk($nominal)));
                    KeuTagihan::create([
                        'id_siswa' => $id, 'id_jenis_biaya' => $jenis->id, 'periode_kode' => $kode, 'judul' => $judul,
                        'nominal' => $nominal, 'potongan' => $potongan,
                        'keterangan_potongan' => $potongan ? $potong->pluck('nama')->join(', ') : null,
                        'jatuh_tempo' => $tempo, 'status' => $potongan >= $nominal ? 'LUNAS' : 'BELUM',
                        'dibuat_oleh' => $request->user()->id,
                    ]);
                    $dibuat++;
                }
            }
        });

        $pesan = $dibuat ? "{$dibuat} tagihan dibuat." : 'Tidak ada tagihan baru.';
        if ($dilewati) $pesan .= " {$dilewati} dilewati karena sudah ada.";
        return response()->json(['message' => $pesan, 'dibuat' => $dibuat, 'dilewati' => $dilewati], $dibuat ? 201 : 200);
    }

    public function tagihan(Request $request)
    {
        $hariIni = $this->hariIni();
        $q = KeuTagihan::with(['siswa:id_siswa,nama_siswa,id_kelas', 'siswa.kelas:id_kelas,nama_kelas', 'jenisBiaya:id,nama'])
            ->when($request->id_jenis_biaya, fn($q, $v) => $q->where('id_jenis_biaya', $v))
            ->when($request->periode_kode, fn($q, $v) => $q->where('periode_kode', $v))
            ->when($request->id_kelas, fn($q, $v) => $q->whereHas('siswa', fn($s) => $s->where('id_kelas', $v)))
            ->when($request->search, fn($q, $v) => $q->whereHas('siswa', fn($s) => $s->where(fn($w) => $w->where('nama_siswa', 'ilike', "%{$v}%")->orWhere('nisn', 'like', "%{$v}%"))));
        match ($request->status) {
            'TERTUNGGAK' => $q->whereIn('status', ['BELUM', 'SEBAGIAN'])->where('jatuh_tempo', '<', $hariIni),
            'AKTIF' => $q->whereIn('status', ['BELUM', 'SEBAGIAN']),
            null, '' => $q->where('status', '<>', 'BATAL'),
            default => $q->where('status', $request->status),
        };
        $data = $q->orderByDesc('jatuh_tempo')->orderBy('id_siswa')->limit(1000)->get();
        return response()->json([
            'data' => $data,
            'total' => ['nominal' => $data->sum(fn($t) => $t->nominal - $t->potongan), 'terbayar' => $data->sum('terbayar'), 'sisa' => $data->sum('sisa')],
        ]);
    }

    public function ubahTagihan(Request $request, int $id)
    {
        $t = KeuTagihan::findOrFail($id);
        if ($t->status === 'BATAL') self::tolak('status', 'Tagihan yang dibatalkan tidak bisa diubah.');
        $data = $request->validate([
            'judul' => 'required|string|max:150',
            'nominal' => 'required|integer|min:1|max:1000000000',
            'potongan' => 'required|integer|min:0',
            'keterangan_potongan' => 'nullable|string|max:255',
            'jatuh_tempo' => 'required|date',
        ]);
        if ($data['potongan'] > $data['nominal']) self::tolak('potongan', 'Potongan tidak boleh melebihi nominal.');
        if ($data['nominal'] - $data['potongan'] < $t->terbayar) {
            self::tolak('nominal', 'Nominal setelah potongan tidak boleh lebih kecil dari yang sudah dibayar (' . Keuangan::rupiah($t->terbayar) . ').');
        }
        $t->fill($data);
        $t->hitungUlang();
        return response()->json(['message' => 'Tagihan diperbarui.', 'data' => $t->fresh()]);
    }

    public function batalTagihan(Request $request, int $id)
    {
        $t = KeuTagihan::findOrFail($id);
        $request->validate(['alasan' => 'required|string|max:255'], ['alasan.required' => 'Tulis alasan pembatalan.']);
        if ($t->status === 'BATAL') self::tolak('status', 'Tagihan ini sudah dibatalkan.');
        if ($t->terbayar > 0) self::tolak('status', 'Tagihan ini sudah dibayar. Batalkan dulu pembayarannya bila memang keliru.');
        $t->update(['status' => 'BATAL', 'alasan_batal' => $request->alasan]);
        return response()->json(['message' => 'Tagihan dibatalkan.']);
    }

    // ===================== SISWA =====================

    /** Daftar siswa beserta sisa tagihan dan tunggakannya. */
    public function siswa(Request $request)
    {
        $hariIni = $this->hariIni();
        $sisa = 'coalesce(sum(nominal - potongan - terbayar), 0)';
        $agregat = KeuTagihan::whereIn('status', ['BELUM', 'SEBAGIAN'])->groupBy('id_siswa')
            ->selectRaw("id_siswa, {$sisa} as total_sisa, coalesce(sum(case when jatuh_tempo < ? then nominal - potongan - terbayar else 0 end), 0) as tunggakan, count(*) as jumlah", [$hariIni])
            ->get()->keyBy('id_siswa');
        $data = Student::with('kelas:id_kelas,nama_kelas')
            ->when($request->id_kelas, fn($q, $v) => $q->where('id_kelas', $v))
            ->when($request->search, fn($q, $v) => $q->where(fn($s) => $s->where('nama_siswa', 'ilike', "%{$v}%")->orWhere('nisn', 'like', "%{$v}%")))
            ->orderBy('nama_siswa')->get(['id_siswa', 'nisn', 'nama_siswa', 'id_kelas'])
            ->map(fn($s) => $s->toArray() + [
                'sisa' => (int) ($agregat[$s->id_siswa]->total_sisa ?? 0),
                'tunggakan' => (int) ($agregat[$s->id_siswa]->tunggakan ?? 0),
                'tagihan_aktif' => (int) ($agregat[$s->id_siswa]->jumlah ?? 0),
            ]);
        return response()->json(['data' => $data]);
    }

    public function detailSiswa(string $id)
    {
        $s = Student::with(['kelas:id_kelas,nama_kelas', 'ortu', 'wali'])->findOrFail($id);
        return response()->json(['data' => [
            'siswa' => $s->only(['id_siswa', 'nisn', 'nama_siswa', 'id_kelas']) + ['kelas' => $s->kelas],
            'kontak' => self::kontak($s),
            'tagihan' => KeuTagihan::with('jenisBiaya:id,nama')->where('id_siswa', $id)->orderByRaw("status = 'BATAL'")->orderByDesc('jatuh_tempo')->get(),
            'pembayaran' => KeuPembayaran::with(['rincian.tagihan:id,judul', 'pencatat:id,name,id_guru'])->where('id_siswa', $id)->latest('tanggal')->latest('id')->get(),
            'beasiswa' => KeuBeasiswa::with('jenisBiaya:id,nama')->where('id_siswa', $id)->get(),
            'pengingat' => KeuPengingat::with('pengirim:id,name')->where('id_siswa', $id)->latest('id')->limit(5)->get(),
        ]]);
    }

    /** Nomor WA yang dihubungi: orang tua, lalu wali, lalu nomor siswa. */
    private static function kontak(Student $s): array
    {
        $ortu = $s->ortu;
        $wali = $s->wali;
        if ($ortu?->no_wa) return ['nama' => $ortu->nama_ibu ?: $ortu->nama_ayah, 'no_wa' => $ortu->no_wa, 'hubungan' => 'Orang tua'];
        if ($wali?->no_wa) return ['nama' => $wali->nama_wali, 'no_wa' => $wali->no_wa, 'hubungan' => 'Wali'];
        return ['nama' => $ortu?->nama_ibu ?: ($ortu?->nama_ayah ?: $wali?->nama_wali), 'no_wa' => $s->no_wa, 'hubungan' => $s->no_wa ? 'Siswa' : null];
    }

    // ===================== PEMBAYARAN =====================

    public function simpanPembayaran(Request $request)
    {
        $data = $request->validate([
            'id_siswa' => 'required|exists:students,id_siswa',
            'tanggal' => 'required|date|before_or_equal:' . $this->hariIni(),
            'metode' => ['required', Rule::in(array_keys(Keuangan::METODE))],
            'penyetor' => 'nullable|string|max:100',
            'keterangan' => 'nullable|string|max:1000',
            'rincian' => 'required|array|min:1|max:50',
            'rincian.*.id_tagihan' => 'required|integer|distinct',
            'rincian.*.jumlah' => 'required|integer|min:1',
        ], [
            'rincian.required' => 'Pilih tagihan yang dibayar.',
            'tanggal.before_or_equal' => 'Tanggal pembayaran tidak boleh setelah hari ini.',
        ]);

        $p = DB::transaction(function () use ($data, $request) {
            $tagihan = KeuTagihan::whereIn('id', collect($data['rincian'])->pluck('id_tagihan'))->lockForUpdate()->get()->keyBy('id');
            foreach ($data['rincian'] as $i => $r) {
                $t = $tagihan[$r['id_tagihan']] ?? null;
                if (!$t || $t->id_siswa !== $data['id_siswa']) self::tolak("rincian.{$i}.id_tagihan", 'Tagihan tidak ditemukan untuk siswa ini.');
                if (!in_array($t->status, ['BELUM', 'SEBAGIAN'], true)) self::tolak("rincian.{$i}.id_tagihan", "Tagihan {$t->judul} sudah lunas atau dibatalkan.");
                if ($r['jumlah'] > $t->sisa) self::tolak("rincian.{$i}.jumlah", "Pembayaran {$t->judul} melebihi sisa tagihan (" . Keuangan::rupiah($t->sisa) . ').');
            }
            $p = $this->buatDenganNomor(fn($nomor) => KeuPembayaran::create([
                'nomor_kuitansi' => $nomor, 'id_siswa' => $data['id_siswa'], 'tanggal' => $data['tanggal'],
                'metode' => $data['metode'], 'jumlah' => collect($data['rincian'])->sum('jumlah'),
                'penyetor' => $data['penyetor'] ?? null, 'keterangan' => $data['keterangan'] ?? null,
                'dicatat_oleh' => $request->user()->id,
            ]), substr($data['tanggal'], 0, 4));
            foreach ($data['rincian'] as $r) {
                $p->rincian()->create($r);
                $tagihan[$r['id_tagihan']]->hitungUlang();
            }
            return $p;
        });

        return response()->json(['message' => "Pembayaran dicatat. Kuitansi {$p->nomor_kuitansi}.", 'data' => $p->load('rincian')], 201);
    }

    /** Nomor kuitansi KW-{tahun}-{00001}; dicoba ulang bila bentrok dengan pencatatan bersamaan. */
    private function buatDenganNomor(callable $buat, string $tahun): KeuPembayaran
    {
        for ($coba = 0; ; $coba++) {
            $akhir = KeuPembayaran::where('nomor_kuitansi', 'like', "KW-{$tahun}-%")->orderByDesc('nomor_kuitansi')->value('nomor_kuitansi');
            $nomor = sprintf('KW-%s-%05d', $tahun, ($akhir ? (int) substr($akhir, -5) : 0) + 1 + $coba);
            try {
                return DB::transaction(fn() => $buat($nomor));
            } catch (QueryException $e) {
                if ($coba >= 4 || !str_contains($e->getMessage(), 'nomor_kuitansi')) throw $e;
            }
        }
    }

    public function pembayaran(Request $request)
    {
        $request->validate(['dari' => 'nullable|date', 'sampai' => 'nullable|date']);
        $q = KeuPembayaran::with(['siswa:id_siswa,nama_siswa,id_kelas', 'siswa.kelas:id_kelas,nama_kelas', 'pencatat:id,name,id_guru', 'rincian.tagihan:id,judul'])
            ->when($request->dari, fn($q, $v) => $q->where('tanggal', '>=', $v))
            ->when($request->sampai, fn($q, $v) => $q->where('tanggal', '<=', $v))
            ->when($request->metode, fn($q, $v) => $q->where('metode', $v))
            ->when($request->search, fn($q, $v) => $q->where(fn($w) => $w->where('nomor_kuitansi', 'ilike', "%{$v}%")
                ->orWhereHas('siswa', fn($s) => $s->where('nama_siswa', 'ilike', "%{$v}%"))));
        $data = $q->latest('tanggal')->latest('id')->limit(500)->get();
        return response()->json(['data' => $data, 'total' => (int) $data->whereNull('dibatalkan_at')->sum('jumlah')]);
    }

    /** Data kuitansi untuk dicetak. */
    public function kuitansi(int $id)
    {
        $p = KeuPembayaran::with(['siswa:id_siswa,nisn,nama_siswa,id_kelas', 'siswa.kelas:id_kelas,nama_kelas', 'rincian.tagihan:id,judul,nominal,potongan,terbayar,status',
            'pencatat:id,name,id_guru', 'pembatal:id,name'])->findOrFail($id);
        $s = SchoolSetting::first();
        return response()->json(['data' => $p, 'sekolah' => $s?->only(['nama_sekolah', 'alamat_sekolah', 'kota', 'npsn', 'logo_sekolah_url'])]);
    }

    public function batalPembayaran(Request $request, int $id)
    {
        $request->validate(['alasan' => 'required|string|max:255'], ['alasan.required' => 'Tulis alasan pembatalan.']);
        $p = KeuPembayaran::with('rincian.tagihan')->findOrFail($id);
        if ($p->dibatalkan_at) self::tolak('status', 'Pembayaran ini sudah dibatalkan.');
        DB::transaction(function () use ($p, $request) {
            $p->update(['dibatalkan_at' => now(), 'dibatalkan_oleh' => $request->user()->id, 'alasan_batal' => $request->alasan]);
            foreach ($p->rincian as $r) $r->tagihan->hitungUlang();
        });
        return response()->json(['message' => "Pembayaran {$p->nomor_kuitansi} dibatalkan; tagihannya kembali terbuka."]);
    }

    // ===================== TUNGGAKAN & PENGINGAT =====================

    /** Tagihan lewat jatuh tempo yang belum lunas, per siswa. */
    private function tagihanTertunggak(?array $idSiswa = null): Collection
    {
        return KeuTagihan::whereIn('status', ['BELUM', 'SEBAGIAN'])->where('jatuh_tempo', '<', $this->hariIni())
            ->when($idSiswa, fn($q) => $q->whereIn('id_siswa', $idSiswa))
            ->orderBy('jatuh_tempo')->get()->groupBy('id_siswa');
    }

    public function tunggakan()
    {
        $grup = $this->tagihanTertunggak();
        $siswa = Student::with(['kelas:id_kelas,nama_kelas', 'ortu', 'wali'])->whereIn('id_siswa', $grup->keys())->get()->keyBy('id_siswa');
        $terakhir = KeuPengingat::whereIn('id_siswa', $grup->keys())->selectRaw('id_siswa, max(created_at) as waktu')->groupBy('id_siswa')->pluck('waktu', 'id_siswa');
        $data = $grup->map(fn($t, $id) => [
            'id_siswa' => $id,
            'nama_siswa' => $siswa->get($id)?->nama_siswa ?? $id,
            'kelas' => $siswa->get($id)?->kelas?->nama_kelas,
            'total' => $t->sum('sisa'),
            'jumlah' => $t->count(),
            'tertua' => $t->first()->jatuh_tempo->toDateString(),
            'tagihan' => $t->map(fn($x) => ['judul' => $x->judul, 'sisa' => $x->sisa, 'jatuh_tempo' => $x->jatuh_tempo->toDateString()])->values(),
            'kontak' => $siswa->has($id) ? self::kontak($siswa[$id]) : null,
            'pengingat_terakhir' => isset($terakhir[$id]) ? Carbon::parse($terakhir[$id])->toIso8601String() : null,
        ])->sortByDesc('total')->values();
        return response()->json(['data' => $data, 'total' => $data->sum('total')]);
    }

    /**
     * Susun pesan pengingat tunggakan. mode=kirim → dikirim otomatis lewat Fonnte (bila aktif) dan dicatat;
     * mode=siapkan → pesan + tautan chat WA dikembalikan, dicatat lewat /pengingat/{id}/catat setelah dibuka.
     */
    public function pengingat(Request $request, WhatsAppService $wa)
    {
        $data = $request->validate([
            'id_siswa' => 'required|array|min:1|max:50',
            'id_siswa.*' => 'string',
            'mode' => 'required|in:kirim,siapkan',
        ]);
        $grup = $this->tagihanTertunggak($data['id_siswa']);
        if ($grup->isEmpty()) self::tolak('id_siswa', 'Siswa yang dipilih tidak punya tunggakan.');
        $siswa = Student::with(['ortu', 'wali'])->whereIn('id_siswa', $grup->keys())->get()->keyBy('id_siswa');
        $sekolah = SchoolSetting::first()?->nama_sekolah ?: 'sekolah';
        $tujuan = self::tujuanAktif();
        $daftarTujuan = $tujuan->map(fn($x) => "• {$x->penyedia} {$x->nomor}" . ($x->atas_nama ? " a.n. {$x->atas_nama}" : ''))->join("
");

        $pesan = $grup->map(function ($t, $id) use ($siswa, $sekolah, $tujuan, $daftarTujuan) {
            $s = $siswa[$id];
            $kontak = self::kontak($s);
            $baris = $t->map(fn($x) => "• {$x->judul}: " . Keuangan::rupiah($x->sisa) . ' (jatuh tempo ' . Keuangan::tanggal($x->jatuh_tempo->toDateString()) . ')')->join("\n");
            $teks = "Yth. Bapak/Ibu " . ($kontak['nama'] ?: 'orang tua/wali') . ",\n\n"
                . "Kami dari {$sekolah} menyampaikan bahwa ananda {$s->nama_siswa} masih memiliki tagihan yang telah lewat jatuh tempo:\n{$baris}\n\n"
                . 'Total: ' . Keuangan::rupiah($t->sum('sisa')) . "\n\n"
                . ($tujuan->isEmpty() ? "Mohon dapat diselesaikan di bagian keuangan sekolah." : "Pembayaran dapat dilakukan di bagian keuangan sekolah atau ke:
{$daftarTujuan}
Mohon kirim bukti pembayaran kepada kami.")
                . " Bila sudah membayar, abaikan pesan ini. Terima kasih.";
            $nomor = WhatsAppService::formatNomor($kontak['no_wa']);
            return [
                'id_siswa' => $id, 'nama_siswa' => $s->nama_siswa, 'no_wa' => $kontak['no_wa'], 'total' => $t->sum('sisa'), 'pesan' => $teks,
                'tautan' => $nomor ? "https://wa.me/{$nomor}?text=" . rawurlencode($teks) : null,
            ];
        })->values();

        if ($data['mode'] === 'siapkan') return response()->json(['data' => $pesan]);

        $tujuan = $pesan->filter(fn($p) => $p['no_wa']);
        if ($tujuan->isEmpty()) self::tolak('id_siswa', 'Tidak ada nomor WhatsApp orang tua/wali untuk siswa yang dipilih.');
        $hasil = $wa->kirim($tujuan->map(fn($p) => ['target' => $p['no_wa'], 'message' => $p['pesan']])->values()->all());
        if (!$hasil['sent']) return response()->json(['message' => $hasil['reason'] ?? 'Pesan gagal dikirim.', 'data' => $pesan], 422);
        foreach ($tujuan as $p) {
            KeuPengingat::create(['id_siswa' => $p['id_siswa'], 'total_tunggakan' => $p['total'], 'cara' => 'OTOMATIS', 'dikirim_oleh' => $request->user()->id]);
        }
        $tanpa = $pesan->count() - $tujuan->count();
        return response()->json(['message' => "{$tujuan->count()} pengingat dikirim lewat WhatsApp." . ($tanpa ? " {$tanpa} siswa tidak punya nomor WA." : ''), 'data' => $pesan]);
    }

    /** Catat pengingat yang dikirim manual lewat chat WA. */
    public function catatPengingat(Request $request, string $id)
    {
        $total = (int) $this->tagihanTertunggak([$id])->flatten()->sum('sisa');
        if (!$total) self::tolak('id_siswa', 'Siswa ini tidak punya tunggakan.');
        KeuPengingat::create(['id_siswa' => $id, 'total_tunggakan' => $total, 'cara' => 'MANUAL', 'dikirim_oleh' => $request->user()->id]);
        return response()->json(['message' => 'Pengingat dicatat.'], 201);
    }

    // ===================== KAS =====================

    /** Laporan kas: pembayaran siswa + kas lain dalam rentang tanggal, saldo awal/akhir, rekap per jenis biaya. */
    public function kas(Request $request)
    {
        $hariIni = $this->hariIni();
        $request->validate(['dari' => 'nullable|date', 'sampai' => 'nullable|date|after_or_equal:dari']);
        $dari = $request->dari ?: substr($hariIni, 0, 7) . '-01';
        $sampai = $request->sampai ?: $hariIni;

        $bayar = fn() => KeuPembayaran::whereNull('dibatalkan_at');
        $saldoAwal = (int) $bayar()->where('tanggal', '<', $dari)->sum('jumlah')
            + (int) KeuKas::where('tanggal', '<', $dari)->sum(DB::raw("case when arah = 'MASUK' then jumlah else -jumlah end"));

        $baris = $bayar()->with('siswa:id_siswa,nama_siswa')->whereBetween('tanggal', [$dari, $sampai])->get()
            ->map(fn($p) => [
                'sumber' => 'PEMBAYARAN', 'id' => $p->id, 'tanggal' => $p->tanggal->toDateString(), 'arah' => 'MASUK',
                'kategori' => 'Pembayaran siswa', 'uraian' => "{$p->nomor_kuitansi} · " . ($p->siswa->nama_siswa ?? $p->id_siswa),
                'jumlah' => $p->jumlah,
            ])
            ->concat(KeuKas::with('pencatat:id,name,id_guru')->whereBetween('tanggal', [$dari, $sampai])->get()->map(fn($k) => [
                'sumber' => 'KAS', 'id' => $k->id, 'tanggal' => $k->tanggal->toDateString(), 'arah' => $k->arah,
                'kategori' => $k->kategori, 'uraian' => $k->keterangan, 'jumlah' => $k->jumlah, 'pencatat' => $k->pencatat,
            ]))
            ->sortBy([['tanggal', 'asc'], ['sumber', 'desc'], ['id', 'asc']])->values();

        $saldo = $saldoAwal;
        $baris = $baris->map(function ($b) use (&$saldo) {
            $saldo += $b['arah'] === 'MASUK' ? $b['jumlah'] : -$b['jumlah'];
            return $b + ['saldo' => $saldo];
        });

        $perJenis = KeuPembayaranRincian::query()
            ->join('keu_pembayaran as p', 'p.id', '=', 'keu_pembayaran_rincian.id_pembayaran')
            ->join('keu_tagihan as t', 't.id', '=', 'keu_pembayaran_rincian.id_tagihan')
            ->join('keu_jenis_biaya as j', 'j.id', '=', 't.id_jenis_biaya')
            ->whereNull('p.dibatalkan_at')->whereBetween('p.tanggal', [$dari, $sampai])
            ->groupBy('j.nama')->selectRaw('j.nama, sum(keu_pembayaran_rincian.jumlah) as jumlah')->orderBy('j.nama')->get()
            ->map(fn($r) => ['nama' => $r->nama, 'jumlah' => (int) $r->jumlah]);

        $masuk = $baris->where('arah', 'MASUK')->sum('jumlah');
        $keluar = $baris->where('arah', 'KELUAR')->sum('jumlah');
        return response()->json(['data' => [
            'dari' => $dari, 'sampai' => $sampai, 'saldo_awal' => $saldoAwal, 'masuk' => $masuk, 'keluar' => $keluar,
            'saldo_akhir' => $saldoAwal + $masuk - $keluar, 'baris' => $baris, 'per_jenis' => $perJenis,
            'kategori_kas' => KeuKas::whereBetween('tanggal', [$dari, $sampai])->groupBy('arah', 'kategori')
                ->selectRaw('arah, kategori, sum(jumlah) as jumlah')->orderBy('arah')->orderBy('kategori')->get(),
        ]]);
    }

    public function simpanKas(Request $request)
    {
        $data = $request->validate([
            'tanggal' => 'required|date|before_or_equal:' . $this->hariIni(),
            'arah' => 'required|in:MASUK,KELUAR',
            'kategori' => 'required|string|max:60',
            'jumlah' => 'required|integer|min:1|max:10000000000',
            'keterangan' => 'nullable|string|max:1000',
        ], ['tanggal.before_or_equal' => 'Tanggal tidak boleh setelah hari ini.']);
        $k = KeuKas::create($data + ['dicatat_oleh' => $request->user()->id]);
        return response()->json(['message' => ($k->arah === 'MASUK' ? 'Pemasukan' : 'Pengeluaran') . ' dicatat.', 'data' => $k], 201);
    }

    public function hapusKas(int $id)
    {
        KeuKas::findOrFail($id)->delete();
        return response()->json(['message' => 'Catatan kas dihapus.']);
    }

    // ===================== PORTAL ORANG TUA / SISWA =====================

    /** Tagihan & riwayat pembayaran anak, dibaca dari Portal (hanya siswa yang terkait akun). */
    public function portal(Request $request)
    {
        $request->validate(['id_siswa' => 'required|string']);
        abort_unless(in_array($request->id_siswa, $request->user()->siswaTerjangkau(), true), 403, 'Data siswa ini tidak dapat diakses dari akun Anda.');
        return response()->json(['data' => [
            'tagihan' => KeuTagihan::where('id_siswa', $request->id_siswa)->where('status', '<>', 'BATAL')->orderByDesc('jatuh_tempo')
                ->get(['id', 'judul', 'nominal', 'potongan', 'keterangan_potongan', 'terbayar', 'jatuh_tempo', 'status']),
            'pembayaran' => KeuPembayaran::where('id_siswa', $request->id_siswa)->whereNull('dibatalkan_at')->latest('tanggal')->limit(20)
                ->get(['id', 'nomor_kuitansi', 'tanggal', 'metode', 'jumlah']),
            'hari_ini' => $this->hariIni(),
            'tujuan_bayar' => self::tujuanAktif(),
        ]]);
    }
}

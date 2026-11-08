<?php

namespace App\Http\Controllers\Api;

use App\Rules\BukanHariMinggu;
use App\Http\Controllers\Controller;
use App\Models\BankSoal;
use App\Models\KisiKisi;
use App\Models\MasterPeriode;
use App\Models\PaketSoal;
use App\Models\PaketSoalButir;
use App\Models\PaketSoalJawaban;
use App\Models\SchoolSetting;
use App\Models\Student;
use App\Models\Subject;
use App\Services\PaketSoalService;
use App\Services\StatistikSoalService;
use App\Services\SoalAIService;
use App\Services\UjianService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/**
 * Paket soal (Fase 16 Tahap B): susun naskah dari soal yang sudah disetujui kepala sekolah, cetak,
 * koreksi jawaban siswa (input cepat atau dibaca AI dari foto), kirim nilai per TP ke Input Nilai,
 * dan analisis butir. Guru mengelola paket miliknya untuk mapel yang diampu; admin & kepala sekolah semuanya.
 */
class PaketSoalController extends Controller
{
    private const RELASI = ['mapel:id_mapel,nama_mapel,kkm', 'kelas:id_kelas,nama_kelas', 'periode:id_periode,tahun_ajaran,semester',
        'jenis:id_jenis,kategori_penilaian,keterangan', 'kisi:id_kisi,judul', 'pembuat:id,name'];
    private const FOTO_MIME = ['image/png' => 'png', 'image/jpeg' => 'jpg', 'image/webp' => 'webp', 'application/pdf' => 'pdf'];
    private const MAKS_BUTIR = 100;
    private const MAKS_FOTO = 4;

    public function index(Request $request)
    {
        $user = $request->user();
        $data = PaketSoal::with(self::RELASI)
            ->withCount(['butir', 'jawaban', 'jawaban as jawaban_lengkap_count' => fn($q) => $q->where('lengkap', true)])
            ->when(!$user->isPengelola(), fn($q) => $q->where('dibuat_oleh', $user->id))
            ->when($request->filled('id_mapel'), fn($q) => $q->where('id_mapel', $request->id_mapel))
            ->orderByDesc('updated_at')->get();
        return response()->json(['data' => $data]);
    }

    public function show(Request $request, string $id)
    {
        $paket = PaketSoal::with([...self::RELASI, 'butir'])->findOrFail($id);
        $this->cekAkses($request, $paket);
        $paket->setAttribute('sekolah', SchoolSetting::first()?->only(['nama_sekolah', 'kota']));
        return response()->json(['data' => $paket]);
    }

    public function store(Request $request)
    {
        $data = $this->validasi($request);
        $paket = DB::transaction(function () use ($request, $data) {
            $paket = PaketSoal::create($data + ['id_paket' => 'PKT-' . Str::uuid(), 'dibuat_oleh' => $request->user()->id]);
            if ($paket->id_kisi && $request->boolean('isi_dari_kisi', true)) $this->isiKisi($paket);
            return $paket;
        });
        return response()->json(['success' => true, 'message' => 'Paket soal dibuat.', 'data' => $paket->fresh([...self::RELASI, 'butir'])], 201);
    }

    public function update(Request $request, string $id)
    {
        $paket = PaketSoal::findOrFail($id);
        $this->cekAkses($request, $paket);
        $data = $this->validasi($request);
        if ($data['id_mapel'] !== $paket->id_mapel && $paket->butir()->exists()) {
            return response()->json(['message' => 'Mapel tidak bisa diganti karena paket sudah berisi soal.'], 422);
        }
        if (($data['id_kelas'] ?? null) !== $paket->id_kelas && $paket->jawaban()->exists()) {
            return response()->json(['message' => 'Kelas tidak bisa diganti karena sudah ada jawaban siswa.'], 422);
        }
        $paket->update($data);
        return response()->json(['success' => true, 'message' => 'Paket soal diperbarui.', 'data' => $paket->fresh([...self::RELASI, 'butir'])]);
    }

    public function destroy(Request $request, string $id)
    {
        $paket = PaketSoal::with('jawaban')->findOrFail($id);
        $this->cekAkses($request, $paket);
        $foto = $paket->jawaban->flatMap(fn($j) => array_merge($j->foto ?? [], self::rekaman($j)));
        $paket->delete();
        $this->hapusFotoBerkas($foto);
        return response()->json(['success' => true, 'message' => 'Paket soal dihapus. Nilai yang sudah dikirim ke Input Nilai tetap tersimpan.']);
    }

    /** Tambahkan soal bank (hanya yang sudah disetujui, mapel yang sama) ke paket. */
    public function tambahButir(Request $request, string $id)
    {
        $paket = PaketSoal::findOrFail($id);
        $this->cekAkses($request, $paket);
        $request->validate(['id_soal' => 'required|array|min:1|max:' . self::MAKS_BUTIR, 'id_soal.*' => 'string']);

        $ada = $paket->butir()->pluck('id_soal')->filter()->all();
        $soal = BankSoal::with(['materi:id_materi,nama_materi', 'indikator:id_indikator,deskripsi'])
            ->whereIn('id_soal', $request->id_soal)->whereNotIn('id_soal', $ada)
            ->where('status', 'DISETUJUI')->where('id_mapel', $paket->id_mapel)->get()
            ->sortBy(fn($s) => array_search($s->id_soal, $request->id_soal, true));
        if ($paket->butir()->count() + $soal->count() > self::MAKS_BUTIR) {
            return response()->json(['message' => 'Satu paket maksimal ' . self::MAKS_BUTIR . ' butir.'], 422);
        }
        $this->simpanButir($paket, $soal);
        $lewat = count(array_unique($request->id_soal)) - $soal->count();
        return response()->json([
            'success' => true,
            'message' => "{$soal->count()} soal ditambahkan." . ($lewat ? " {$lewat} dilewati (sudah ada, belum disetujui, atau beda mapel)." : ''),
            'data' => $paket->fresh([...self::RELASI, 'butir']),
        ]);
    }

    /** Isi paket dari kisi-kisinya: soal disetujui per baris (yang dibuat untuk baris itu dulu, lalu TP & bentuk sama). */
    public function isiDariKisi(Request $request, string $id)
    {
        $paket = PaketSoal::findOrFail($id);
        $this->cekAkses($request, $paket);
        if (!$paket->id_kisi) return response()->json(['message' => 'Pilih kisi-kisi untuk paket ini dulu.'], 422);
        [$tambah, $kurang] = $this->isiKisi($paket);
        return response()->json([
            'success' => true,
            'message' => "{$tambah} soal ditambahkan dari kisi-kisi." . ($kurang ? " Masih kurang {$kurang} soal disetujui; buat atau ajukan soalnya di Bank Soal." : ''),
            'kurang' => $kurang,
            'data' => $paket->fresh([...self::RELASI, 'butir']),
        ]);
    }

    /** Urutan dan skor maksimal butir: kirim seluruh butir dalam urutan barunya. */
    public function aturButir(Request $request, string $id)
    {
        $paket = PaketSoal::findOrFail($id);
        $this->cekAkses($request, $paket);
        $request->validate(['butir' => 'required|array', 'butir.*.id' => 'required|integer', 'butir.*.skor_maks' => 'required|integer|min:1|max:100']);
        $butir = $paket->butir()->get()->keyBy('id');
        DB::transaction(function () use ($request, $butir) {
            foreach (array_values($request->butir) as $i => $b) {
                $butir->get($b['id'])?->update(['urutan' => $i + 1, 'skor_maks' => $b['skor_maks']]);
            }
        });
        $this->hitungUlang($paket);
        return response()->json(['success' => true, 'message' => 'Susunan butir disimpan.', 'data' => $paket->fresh([...self::RELASI, 'butir'])]);
    }

    public function hapusButir(Request $request, string $id, int $idButir)
    {
        $paket = PaketSoal::findOrFail($id);
        $this->cekAkses($request, $paket);
        $paket->butir()->whereKey($idButir)->delete();
        $this->hitungUlang($paket);
        return response()->json(['success' => true, 'message' => 'Butir dihapus dari paket.', 'data' => $paket->fresh([...self::RELASI, 'butir'])]);
    }

    /** Lembar koreksi: siswa kelas paket beserta jawabannya. */
    public function jawaban(Request $request, string $id)
    {
        $paket = PaketSoal::findOrFail($id);
        $this->cekAkses($request, $paket);
        UjianService::tutupKedaluwarsa($paket);
        $siswa = $paket->id_kelas ? Student::where('id_kelas', $paket->id_kelas)->orderBy('nama_siswa')->get(['id_siswa', 'nisn', 'nama_siswa']) : collect();
        return response()->json(['siswa' => $siswa, 'jawaban' => $paket->jawaban()->get()->keyBy('id_siswa')]);
    }

    /**
     * Simpan jawaban beberapa siswa sekaligus: {records: [{id_siswa, jawaban: {id_butir: ...}, skor_manual: {id_butir: skor|null}}]}.
     * Bentuk otomatis langsung dinilai (kosong = 0); uraian, menjodohkan, mengurutkan menunggu skor guru.
     */
    public function simpanJawaban(Request $request, string $id)
    {
        $paket = PaketSoal::with('butir')->findOrFail($id);
        $this->cekAkses($request, $paket);
        $request->validate([
            'records' => 'required|array|min:1|max:200',
            'records.*.id_siswa' => 'required|string',
            'records.*.jawaban' => 'nullable|array',
            'records.*.skor_manual' => 'nullable|array',
        ]);
        $this->cekSiswa($paket, collect($request->records)->pluck('id_siswa'));

        $sedang = PaketSoalJawaban::where('id_paket', $paket->id_paket)->whereIn('id_siswa', collect($request->records)->pluck('id_siswa'))
            ->where('sumber', 'ONLINE')->whereNull('selesai_pada')->with('siswa:id_siswa,nama_siswa')->get();
        if ($sedang->isNotEmpty()) {
            return response()->json(['message' => $sedang->pluck('siswa.nama_siswa')->implode(', ') . ' masih mengerjakan tes online. Tunggu selesai atau akhiri sesinya di bagian Tes Online.'], 422);
        }

        $butir = $paket->butir->keyBy(fn($b) => (string) $b->id);
        $hasil = DB::transaction(function () use ($request, $paket, $butir) {
            $hasil = [];
            foreach ($request->records as $r) {
                $jwb = PaketSoalJawaban::firstOrNew(['id_paket' => $paket->id_paket, 'id_siswa' => $r['id_siswa']]);
                $jawaban = [];
                foreach ($butir as $idB => $b) {
                    $jawaban[$idB] = PaketSoalService::normalisasiJawaban($b->soal, $r['jawaban'][$idB] ?? null);
                }
                $manual = [];
                foreach ((array) ($r['skor_manual'] ?? []) as $idB => $s) {
                    if (isset($butir[(string) $idB]) && is_numeric($s)) $manual[(string) $idB] = min(max((float) $s, 0), $butir[(string) $idB]->skor_maks);
                }
                $jwb->fill(['jawaban' => $jawaban, 'skor_manual' => $manual, 'dikoreksi_oleh' => $request->user()->id]);
                PaketSoalService::hitung($jwb, $paket->butir);
                $jwb->save();
                $hasil[] = $jwb;
            }
            return $hasil;
        });
        $paket->touch();
        return response()->json(['success' => true, 'message' => count($hasil) . ' jawaban disimpan.', 'data' => collect($hasil)->keyBy('id_siswa')]);
    }

    public function hapusJawaban(Request $request, string $id, string $idSiswa)
    {
        $paket = PaketSoal::findOrFail($id);
        $this->cekAkses($request, $paket);
        $jwb = PaketSoalJawaban::where('id_paket', $id)->where('id_siswa', $idSiswa)->firstOrFail();
        $foto = array_merge($jwb->foto ?? [], self::rekaman($jwb));
        $jwb->delete();
        $this->hapusFotoBerkas($foto);
        return response()->json(['success' => true, 'message' => 'Jawaban siswa dihapus.']);
    }

    /** Unggah foto/PDF lembar jawaban satu siswa (maks. 4 berkas, masing-masing 8MB). */
    public function unggahFoto(Request $request, string $id, string $idSiswa)
    {
        $paket = PaketSoal::with('butir')->findOrFail($id);
        $this->cekAkses($request, $paket);
        $this->cekSiswa($paket, collect([$idSiswa]));
        $request->validate(['foto_base64' => 'required|string']);
        $data = base64_decode(preg_replace('/^data:[^;]*;base64,/', '', $request->foto_base64), true);
        if (!$data) throw ValidationException::withMessages(['foto_base64' => 'Berkas tidak valid.']);
        if (strlen($data) > 8 * 1024 * 1024) throw ValidationException::withMessages(['foto_base64' => 'Ukuran berkas maksimal 8MB.']);
        $mime = (new \finfo(FILEINFO_MIME_TYPE))->buffer($data);
        if (!isset(self::FOTO_MIME[$mime])) throw ValidationException::withMessages(['foto_base64' => 'Format harus foto (PNG/JPG/WEBP) atau PDF.']);

        $jwb = PaketSoalJawaban::firstOrNew(['id_paket' => $paket->id_paket, 'id_siswa' => $idSiswa]);
        if (count($jwb->foto ?? []) >= self::MAKS_FOTO) return response()->json(['message' => 'Maksimal ' . self::MAKS_FOTO . ' foto per siswa. Hapus salah satu dulu.'], 422);

        $file = 'lembar/lembar_' . Str::random(20) . '.' . self::FOTO_MIME[$mime];
        Storage::disk('public')->put($file, $data);
        $jwb->foto = [...($jwb->foto ?? []), '/storage/' . $file];
        if (!$jwb->exists) PaketSoalService::hitung($jwb, $paket->butir);
        $jwb->save();
        return response()->json(['success' => true, 'message' => 'Foto lembar jawaban diunggah.', 'data' => $jwb]);
    }

    public function hapusFoto(Request $request, string $id, string $idSiswa)
    {
        $paket = PaketSoal::findOrFail($id);
        $this->cekAkses($request, $paket);
        $request->validate(['url' => 'required|string']);
        $jwb = PaketSoalJawaban::where('id_paket', $id)->where('id_siswa', $idSiswa)->firstOrFail();
        $jwb->update(['foto' => array_values(array_filter($jwb->foto ?? [], fn($u) => $u !== $request->url))]);
        $this->hapusFotoBerkas([$request->url]);
        return response()->json(['success' => true, 'message' => 'Foto dihapus.', 'data' => $jwb]);
    }

    /**
     * AI membaca jawaban dari foto lembar jawaban yang sudah diunggah. Hasilnya TIDAK disimpan:
     * dikembalikan sebagai usulan untuk diperiksa guru lalu disimpan lewat simpanJawaban.
     */
    public function bacaFoto(Request $request, string $id, string $idSiswa, SoalAIService $ai)
    {
        $paket = PaketSoal::with('butir')->findOrFail($id);
        $this->cekAkses($request, $paket);
        $request->validate(['url' => 'required|string', 'ai_mode' => ['required', Rule::in(SoalAIService::MODES_BERKAS)]]);
        $jwb = PaketSoalJawaban::where('id_paket', $id)->where('id_siswa', $idSiswa)->firstOrFail();
        abort_unless(in_array($request->url, $jwb->foto ?? [], true), 404, 'Foto tidak ditemukan.');
        $path = Str::after($request->url, '/storage/');
        abort_unless(Storage::disk('public')->exists($path), 404, 'Berkas foto tidak ditemukan.');
        $data = Storage::disk('public')->get($path);
        $berkas = ['mime' => (new \finfo(FILEINFO_MIME_TYPE))->buffer($data), 'data' => base64_encode($data)];

        $daftar = $paket->butir->values()->map(fn($b, $i) => array_filter([
            'nomor' => $i + 1, 'bentuk' => $b->soal['bentuk'],
            'jumlah_pilihan' => isset($b->soal['isi']['pilihan']) ? count($b->soal['isi']['pilihan']) : null,
            'jumlah_pernyataan' => isset($b->soal['isi']['pernyataan']) ? count($b->soal['isi']['pernyataan']) : null,
        ], fn($v) => $v !== null))->all();
        $hasil = $ai->bacaLembarJawaban($berkas, $daftar, $request->ai_mode);
        if ($hasil === null) return response()->json(['message' => $ai->galat()], 422);

        $perNomor = collect($hasil['jawaban'])->filter(fn($j) => is_array($j) && isset($j['nomor']))->keyBy(fn($j) => (int) $j['nomor']);
        $jawaban = [];
        $terbaca = 0;
        foreach ($paket->butir->values() as $i => $b) {
            $teks = $perNomor->get($i + 1)['jawaban'] ?? null;
            if ($teks !== null && $teks !== '') $terbaca++;
            $jawaban[(string) $b->id] = PaketSoalService::dariTeks($b->soal, $teks);
        }
        return response()->json([
            'success' => true,
            'message' => "{$terbaca} dari {$paket->butir->count()} jawaban terbaca. Periksa sebelum menyimpan.",
            'jawaban' => $jawaban,
            'nama_siswa' => is_string($hasil['nama_siswa'] ?? null) ? mb_substr($hasil['nama_siswa'], 0, 100) : null,
        ]);
    }

    /**
     * Kirim nilai siswa yang sudah lengkap dikoreksi ke Input Nilai, per materi (dan per TP bila semua
     * butir materi itu ber-TP), memakai aturan simpan Input Nilai yang sama (STNKM otomatis, deteksi remedial).
     * Mengirim ulang memperbarui nilai pada tanggal yang sama.
     */
    public function kirimNilai(Request $request, string $id)
    {
        $paket = PaketSoal::with(['butir', 'jawaban'])->findOrFail($id);
        $this->cekAkses($request, $paket);
        $kurang = collect(['id_kelas' => 'kelas', 'id_periode' => 'periode', 'id_jenis' => 'jenis penilaian', 'tanggal' => 'tanggal'])
            ->filter(fn($label, $k) => !$paket->$k)->values();
        if ($kurang->isNotEmpty()) return response()->json(['message' => 'Lengkapi dulu ' . $kurang->implode(', ') . ' pada pengaturan paket.'], 422);

        UjianService::tutupKedaluwarsa($paket);
        $paket->load('jawaban');
        $lengkap = $paket->jawaban->filter(fn($j) => $j->lengkap && !$j->sedangDikerjakan())->values();
        if ($lengkap->isEmpty()) return response()->json(['message' => 'Belum ada siswa yang selesai dikoreksi.'], 422);
        $perMateri = PaketSoalService::nilaiPerMateri($paket->butir, $lengkap);
        if (!$perMateri) return response()->json(['message' => 'Butir paket ini belum berlabel materi/TP, jadi nilainya tidak bisa dikirim.'], 422);

        // Hasil analisis butir ikut disimpan agar bank soal & draf AI belajar dari ulangan ini
        $paket->load('jawaban.siswa:id_siswa,nama_siswa');
        StatistikSoalService::simpan($paket, PaketSoalService::analisis($paket, 75));

        $nilai = app(NilaiController::class);
        $pesan = [];
        $tindakLanjut = 0;
        DB::transaction(function () use ($request, $paket, $perMateri, $nilai, &$pesan, &$tindakLanjut) {
            foreach ($perMateri as $idMateri => $perSiswa) {
                $sub = Request::create('/', 'POST', [
                    'id_kelas' => $paket->id_kelas, 'id_mapel' => $paket->id_mapel, 'id_periode' => $paket->id_periode,
                    'id_jenis' => $paket->id_jenis, 'id_materi' => $idMateri, 'tanggal' => $paket->tanggal->format('Y-m-d'),
                    'records' => collect($perSiswa)->map(fn($r, $idSiswa) => ['id_siswa' => $idSiswa] + $r)->values()->all(),
                ]);
                $sub->setUserResolver(fn() => $request->user());
                $res = $nilai->saveBatch($sub);
                $isi = $res->getData(true);
                if ($res->getStatusCode() >= 400) throw ValidationException::withMessages(['nilai' => $isi['message'] ?? 'Gagal menyimpan nilai.']);
                $pesan[] = $isi['message'];
                $tindakLanjut += $isi['perlu_tindak_lanjut'] ?? 0;
            }
            $paket->update(['terkirim_pada' => now()]);
        });

        $belum = $paket->jawaban->filter(fn($j) => !$j->lengkap || $j->sedangDikerjakan())->count();
        return response()->json([
            'success' => true,
            'message' => "Nilai {$lengkap->count()} siswa dikirim ke Input Nilai untuk " . count($perMateri) . ' materi.'
                . ($belum ? " {$belum} siswa belum selesai dikoreksi dan belum dikirim." : '')
                . ($tindakLanjut ? " {$tindakLanjut} nilai di bawah KKM perlu tindak lanjut." : ''),
            'perlu_tindak_lanjut' => $tindakLanjut,
        ]);
    }

    public function analisis(Request $request, string $id)
    {
        $paket = PaketSoal::with(['butir', 'mapel:id_mapel,kkm'])->findOrFail($id);
        $this->cekAkses($request, $paket);
        UjianService::tutupKedaluwarsa($paket);
        $paket->load('jawaban.siswa:id_siswa,nama_siswa');
        $hasil = PaketSoalService::analisis($paket, (float) ($paket->mapel?->kkm ?? 75));
        StatistikSoalService::simpan($paket, $hasil);
        return response()->json(['data' => $hasil]);
    }

    /**
     * Usulan skor uraian dari AI untuk satu siswa: jawaban yang diketik (tes online / catatan guru) dan foto
     * lembar jawaban (Gemini/Claude). Tidak disimpan; guru memeriksa lalu menyimpan lewat simpanJawaban.
     */
    public function nilaiUraianAI(Request $request, string $id, string $idSiswa, SoalAIService $ai)
    {
        $paket = PaketSoal::with('butir')->findOrFail($id);
        $this->cekAkses($request, $paket);
        $request->validate([
            'ai_mode' => ['required', Rule::in(SoalAIService::MODES)],
            'jawaban' => 'nullable|array',
            'jawaban.*' => 'nullable|string|max:5000',
        ]);
        $this->cekSiswa($paket, collect([$idSiswa]));
        $uraian = $paket->butir->values()->map(fn($b, $i) => ['b' => $b, 'nomor' => $i + 1])->filter(fn($x) => $x['b']->soal['bentuk'] === 'URAIAN')->values();
        if ($uraian->isEmpty()) return response()->json(['message' => 'Paket ini tidak berisi soal uraian.'], 422);

        $jwb = PaketSoalJawaban::where('id_paket', $id)->where('id_siswa', $idSiswa)->first();
        if ($jwb?->sedangDikerjakan()) return response()->json(['message' => 'Siswa ini masih mengerjakan tes online.'], 422);

        $teks = fn($b) => trim((string) ($request->input('jawaban.' . $b->id) ?? (is_string($jwb?->jawaban[(string) $b->id] ?? null) ? $jwb->jawaban[(string) $b->id] : '')));
        $adaTeks = $uraian->contains(fn($x) => $teks($x['b']) !== '');
        $berkas = [];
        if (in_array($request->ai_mode, SoalAIService::MODES_BERKAS, true)) {
            foreach (array_slice($jwb?->foto ?? [], 0, 4) as $url) {
                $path = Str::after($url, '/storage/');
                if (!Storage::disk('public')->exists($path)) continue;
                $data = Storage::disk('public')->get($path);
                $berkas[] = ['mime' => (new \finfo(FILEINFO_MIME_TYPE))->buffer($data), 'data' => base64_encode($data)];
            }
        }
        if (!$adaTeks && !$berkas) {
            return response()->json(['message' => ($jwb?->foto ? 'Foto lembar jawaban hanya bisa dibaca dengan Gemini atau Claude.' : 'Belum ada jawaban uraian atau foto lembar jawaban untuk siswa ini.')], 422);
        }

        // Tanpa foto, hanya butir yang ada jawabannya yang dinilai
        $dinilai = $berkas ? $uraian : $uraian->filter(fn($x) => $teks($x['b']) !== '')->values();
        $daftar = $dinilai->map(fn($x) => array_filter([
            'nomor' => $x['nomor'],
            'pertanyaan' => $x['b']->soal['pertanyaan'] ?? '',
            'skor_maks' => $x['b']->skor_maks,
            'rubrik' => $x['b']->soal['rubrik'] ?? null,
            'contoh_jawaban' => $x['b']->soal['kunci']['jawaban'] ?? null,
            'jawaban_siswa' => $teks($x['b']) ?: null,
        ], fn($v) => $v !== null && $v !== ''))->all();

        $hasil = $ai->nilaiUraian($daftar, $berkas, $request->ai_mode);
        if ($hasil === null) return response()->json(['message' => $ai->galat()], 422);

        $perNomor = $dinilai->keyBy('nomor');
        $saran = [];
        foreach ($hasil as $h) {
            $x = $perNomor->get((int) $h['nomor']);
            if (!$x) continue;
            $maks = $x['b']->skor_maks;
            $skor = is_numeric($h['skor'] ?? null) ? min(max(round((float) $h['skor'] * 2) / 2, 0), $maks) : null;
            $saran[(string) $x['b']->id] = [
                'skor' => $skor,
                'alasan' => mb_substr(trim((string) ($h['alasan'] ?? '')), 0, 500),
                'transkrip' => is_string($h['transkrip'] ?? null) && trim($h['transkrip']) !== '' ? mb_substr(trim($h['transkrip']), 0, 5000) : null,
            ];
        }
        $diberi = collect($saran)->whereNotNull('skor')->count();
        return response()->json([
            'success' => true,
            'message' => "AI mengusulkan skor untuk {$diberi} dari {$uraian->count()} soal uraian. Periksa sebelum menyimpan.",
            'saran' => $saran,
        ]);
    }

    /** Pengaturan tes online: jadwal buka-tutup, acak, token, dan apakah siswa melihat nilainya. */
    public function aturOnline(Request $request, string $id)
    {
        $paket = PaketSoal::withCount('butir')->findOrFail($id);
        $this->cekAkses($request, $paket);
        $request->validate([
            'online' => 'required|boolean',
            'online_mulai' => 'nullable|date',
            'online_selesai' => 'nullable|date|after:online_mulai',
            'durasi_menit' => 'nullable|integer|min:5|max:600',
            'acak_soal' => 'boolean', 'acak_pilihan' => 'boolean', 'tampilkan_nilai' => 'boolean',
            'token' => ['nullable', 'string', 'max:12', 'regex:/^[A-Za-z0-9]+$/'],
        ], ['online_selesai.after' => 'Waktu tutup harus setelah waktu buka.', 'token.regex' => 'Token hanya huruf dan angka.']);
        if ($request->boolean('online') && !$paket->butir_count) return response()->json(['message' => 'Tambahkan soal dulu sebelum membuka tes online.'], 422);
        if ($request->boolean('online') && !$paket->id_kelas) return response()->json(['message' => 'Pilih kelas paket dulu.'], 422);

        $paket->update($request->only(['online', 'online_mulai', 'online_selesai', 'durasi_menit', 'acak_soal', 'acak_pilihan', 'tampilkan_nilai'])
            + ['token' => $request->filled('token') ? mb_strtoupper($request->token) : null]);
        return response()->json(['success' => true, 'message' => $paket->online ? 'Tes online dibuka untuk siswa kelas ini.' : 'Tes online ditutup.', 'data' => $paket->fresh([...self::RELASI, 'butir'])]);
    }

    /** Pantau tes online: status tiap siswa, jumlah terjawab, sisa waktu, dan berapa kali keluar dari halaman tes. */
    public function pantau(Request $request, string $id)
    {
        $paket = PaketSoal::with('butir')->findOrFail($id);
        $this->cekAkses($request, $paket);
        UjianService::tutupKedaluwarsa($paket);
        $siswa = Student::where('id_kelas', $paket->id_kelas)->orderBy('nama_siswa')->get(['id_siswa', 'nama_siswa']);
        $jawaban = $paket->jawaban()->get()->keyBy('id_siswa');
        $terjawab = fn($j) => collect($j->jawaban ?? [])->filter(fn($v) => $v !== null && $v !== [] && (!is_array($v) || array_filter($v, fn($x) => $x !== null)))->count();

        return response()->json(['data' => $siswa->map(function ($s) use ($paket, $jawaban, $terjawab) {
            $j = $jawaban->get($s->id_siswa);
            $batas = $j && $j->sedangDikerjakan() ? UjianService::batas($paket, $j) : null;
            return [
                'id_siswa' => $s->id_siswa, 'nama_siswa' => $s->nama_siswa,
                'status' => !$j ? 'BELUM' : ($j->sumber === 'KERTAS' ? 'KERTAS' : ($j->selesai_pada ? 'SELESAI' : 'MENGERJAKAN')),
                'terjawab' => $j ? $terjawab($j) : 0, 'jumlah_soal' => $paket->butir->count(),
                'mulai_pada' => $j?->mulai_pada, 'selesai_pada' => $j?->selesai_pada, 'terakhir_aktif' => $j?->terakhir_aktif,
                'sisa_detik' => $batas ? max(0, (int) floor(now()->diffInSeconds($batas, false))) : null,
                'pelanggaran' => $j?->pelanggaran ?? 0, 'nilai' => $j && !$j->sedangDikerjakan() ? $j->nilai : null, 'lengkap' => (bool) $j?->lengkap,
            ];
        }), 'server' => now()->toIso8601String()]);
    }

    /** Akhiri sesi online seorang siswa (mis. waktu habis tetapi HP-nya mati). */
    public function akhiriSesi(Request $request, string $id, string $idSiswa)
    {
        $paket = PaketSoal::with('butir')->findOrFail($id);
        $this->cekAkses($request, $paket);
        $j = PaketSoalJawaban::where('id_paket', $id)->where('id_siswa', $idSiswa)->where('sumber', 'ONLINE')->whereNull('selesai_pada')->firstOrFail();
        UjianService::selesaikan($paket, $j);
        return response()->json(['success' => true, 'message' => 'Sesi siswa diakhiri; jawaban yang tersimpan dikumpulkan.']);
    }

    // ===== bantu =====

    private function validasi(Request $request): array
    {
        $request->validate([
            'judul' => 'required|string|max:200',
            'id_mapel' => 'required|exists:subjects,id_mapel',
            'id_kelas' => 'required|exists:classes,id_kelas',
            'id_periode' => 'nullable|exists:master_periode,id_periode',
            'id_kisi' => 'nullable|exists:kisi_kisi,id_kisi',
            'id_jenis' => 'nullable|exists:master_mbk,id_jenis',
            'tanggal' => ['nullable', 'date', new BukanHariMinggu],
            'durasi_menit' => 'nullable|integer|min:5|max:600',
            'petunjuk' => 'nullable|string|max:3000',
        ], ['judul.required' => 'Tulis judul paket, mis. Penilaian Harian Pecahan.', 'id_kelas.required' => 'Pilih kelas yang mengerjakan.']);
        abort_unless($request->user()->bolehNilaiMapel($request->id_mapel), 403, 'Anda hanya dapat menyusun paket untuk mata pelajaran yang Anda ampu.');
        if ($request->id_kisi && KisiKisi::find($request->id_kisi)?->id_mapel !== $request->id_mapel) {
            throw ValidationException::withMessages(['id_kisi' => 'Kisi-kisi harus untuk mapel yang sama.']);
        }
        $data = $request->only(['judul', 'id_mapel', 'id_kelas', 'id_periode', 'id_kisi', 'id_jenis', 'tanggal', 'durasi_menit', 'petunjuk']);
        $data['id_periode'] ??= MasterPeriode::where('status_aktif', 'AKTIF')->value('id_periode');
        return $data;
    }

    /** @return array [jumlah ditambahkan, jumlah kekurangan] */
    private function isiKisi(PaketSoal $paket): array
    {
        $kisi = KisiKisi::with('baris')->find($paket->id_kisi);
        if (!$kisi) return [0, 0];
        $sudah = $paket->butir()->pluck('id_soal')->filter()->all();
        $pilih = collect();
        $kurang = 0;
        foreach ($kisi->baris as $baris) {
            // Soal yang cocok untuk baris ini: dibuat untuk baris itu, atau bentuk & TP (materi) sama
            $cocok = fn($q) => $q->where(fn($w) => $w->where('id_kisi_baris', $baris->id)->orWhere(fn($v) => $v->where('bentuk', $baris->bentuk)
                ->when($baris->id_indikator, fn($x) => $x->where('id_indikator', $baris->id_indikator), fn($x) => $x->where('id_materi', $baris->id_materi))));
            // Yang sudah ada di paket ikut dihitung
            $perlu = max(0, $baris->jumlah - BankSoal::whereIn('id_soal', $sudah)->where($cocok)->count());
            if (!$perlu) continue;
            $ambil = BankSoal::with(['materi:id_materi,nama_materi', 'indikator:id_indikator,deskripsi'])
                ->where('status', 'DISETUJUI')->where('id_mapel', $paket->id_mapel)
                ->whereNotIn('id_soal', [...$sudah, ...$pilih->pluck('id_soal')->all()])
                ->where($cocok)
                ->orderByRaw('CASE WHEN id_kisi_baris = ? THEN 0 ELSE 1 END', [$baris->id])->orderBy('disetujui_pada')
                ->limit($perlu)->get();
            $kurang += $perlu - $ambil->count();
            $pilih = $pilih->concat($ambil);
        }
        $pilih = $pilih->take(self::MAKS_BUTIR - $paket->butir()->count());
        $this->simpanButir($paket, $pilih);
        return [$pilih->count(), $kurang];
    }

    private function simpanButir(PaketSoal $paket, $soal): void
    {
        $urutan = (int) $paket->butir()->max('urutan');
        foreach ($soal as $s) {
            PaketSoalButir::create([
                'id_paket' => $paket->id_paket, 'id_soal' => $s->id_soal, 'urutan' => ++$urutan,
                'skor_maks' => $s->skor_maks ?: 1, 'versi' => $s->versi, 'soal' => self::salinan($s),
            ]);
        }
        if (count($soal)) $this->hitungUlang($paket);
    }

    /** Salinan soal untuk butir paket (termasuk nama materi & TP untuk cetak dan analisis). */
    private static function salinan(BankSoal $s): array
    {
        return $s->only(['id_soal', 'bentuk', 'level_kognitif', 'tingkat_kesulitan', 'dim_S', 'dim_T', 'dim_N', 'dim_K', 'dim_M',
            'pertanyaan', 'gambar_svg', 'gambar_url', 'isi', 'kunci', 'rubrik', 'pembahasan', 'id_materi', 'id_indikator', 'id_video'])
            + ['materi' => $s->materi?->only(['nama_materi']), 'indikator' => $s->indikator?->only(['deskripsi']), 'video' => $s->video?->ringkas()];
    }

    /** Setelah butir berubah, skor semua jawaban dihitung ulang. */
    private function hitungUlang(PaketSoal $paket): void
    {
        $butir = $paket->butir()->get();
        $paket->jawaban()->get()->each(function ($j) use ($butir) {
            PaketSoalService::hitung($j, $butir);
            $j->save();
        });
        $paket->touch();
    }

    private function cekAkses(Request $request, PaketSoal $paket): void
    {
        $user = $request->user();
        abort_unless($user->isPengelola() || ($paket->dibuat_oleh === $user->id && $user->bolehNilaiMapel($paket->id_mapel)), 403, 'Paket soal ini milik guru lain.');
    }

    private function cekSiswa(PaketSoal $paket, $idSiswa): void
    {
        $idSiswa = $idSiswa->unique();
        $anggota = Student::where('id_kelas', $paket->id_kelas)->whereIn('id_siswa', $idSiswa)->count();
        if (!$paket->id_kelas || $anggota !== $idSiswa->count()) {
            throw ValidationException::withMessages(['records' => 'Ada siswa yang bukan anggota kelas paket ini.']);
        }
    }

    private function hapusFotoBerkas(iterable $urls): void
    {
        foreach ($urls as $url) {
            if (Str::startsWith($url, ['/storage/lembar/', '/storage/rekaman/'])) Storage::disk('public')->delete(Str::after($url, '/storage/'));
        }
    }

    /** Url rekaman membaca nyaring dalam jawaban siswa. */
    private static function rekaman(PaketSoalJawaban $j): array
    {
        return array_values(array_filter($j->jawaban ?? [], fn($v) => is_string($v) && Str::startsWith($v, '/storage/rekaman/')));
    }
}

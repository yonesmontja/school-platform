<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\BankSoal;
use App\Models\CapaianPembelajaran;
use App\Models\Classes;
use App\Models\ModulAjar;
use App\Models\Student;
use App\Models\TransJadwal;
use App\Models\VideoBelajar;
use App\Models\VideoTautan;
use App\Models\SchoolSetting;
use App\Models\TemplatVideo;
use App\Models\VideoAset;
use App\Models\User;
use App\Services\NaskahVideo;
use App\Services\PustakaDokumenService;
use App\Services\SoalAIService;
use App\Services\StudioAIService;
use App\Services\SuaraService;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/**
 * Pustaka Video Belajar (Fase 19 Tahap A). Video (motion graphic dari Remotion atau unggahan guru) disimpan sekali
 * lalu ditautkan ke modul ajar per pertemuan, sesi jadwal, stimulus soal, dan tampil di Portal Siswa. Video baru
 * terlihat oleh siswa setelah disetujui kepala sekolah.
 */
class VideoBelajarController extends Controller
{
    private const RELASI = ['mapel:id_mapel,nama_mapel', 'kelas:id_kelas,nama_kelas', 'materi:id_materi,nama_materi', 'pembuat:id,name'];
    private const MAKS_KB = 20 * 1024;
    private const MIME_VIDEO = ['video/mp4' => 'mp4', 'video/webm' => 'webm'];
    private const MIME_POSTER = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp'];

    public function index(Request $request)
    {
        $request->validate(['status' => ['nullable', Rule::in(['DRAF', 'DIAJUKAN', 'DISETUJUI', 'REVISI'])]]);
        $data = $this->terjangkau($request)->with(self::RELASI)->withCount('tautan')
            ->when($request->status, fn($q) => $q->where('status', $request->status))
            ->when($request->id_mapel, fn($q) => $q->where('id_mapel', $request->id_mapel))
            ->when($request->id_kelas, fn($q) => $q->where(fn($w) => $w->where('id_kelas', $request->id_kelas)->orWhereNull('id_kelas')))
            ->when($request->filled('cari'), fn($q) => $q->whereRaw('LOWER(judul) LIKE ?', ['%' . mb_strtolower($request->cari) . '%']))
            ->when($request->boolean('disetujui'), fn($q) => $q->where('status', 'DISETUJUI'))
            ->orderByRaw("CASE status WHEN 'DIAJUKAN' THEN 0 WHEN 'REVISI' THEN 1 WHEN 'DRAF' THEN 2 ELSE 3 END")
            ->orderByDesc('updated_at')->get();
        $soal = BankSoal::whereIn('id_video', $data->pluck('id_video'))->selectRaw('id_video, COUNT(*) as n')->groupBy('id_video')->pluck('n', 'id_video');
        $data->each(fn($v) => $v->setAttribute('dipakai', $v->tautan_count + (int) ($soal[$v->id_video] ?? 0)));
        return response()->json(['data' => $data]);
    }

    public function show(Request $request, string $id)
    {
        $video = $this->terjangkau($request)->with(self::RELASI)->findOrFail($id);
        return response()->json(['data' => $video->toArray() + ['tempat' => $this->tempat($video)]]);
    }

    /** Unggah video baru (multipart): berkas MP4/WebM maks. 20MB, sampul (data URL) dan durasi dibaca di browser. */
    public function store(Request $request)
    {
        $data = $this->validasi($request, true);
        [$fileUrl, $kb] = $this->simpanBerkas($request);
        $video = VideoBelajar::create($data + [
            'id_video' => 'VID-' . Str::upper(Str::random(10)), 'file_url' => $fileUrl, 'ukuran_kb' => $kb,
            'poster_url' => $this->simpanPoster($request), 'status' => 'DRAF', 'dibuat_oleh' => $request->user()->id,
        ]);
        return response()->json(['success' => true, 'message' => 'Video disimpan sebagai draf. Ajukan ke kepala sekolah agar bisa dilihat siswa.', 'data' => $video->fresh(self::RELASI)], 201);
    }

    public function update(Request $request, string $id)
    {
        $video = VideoBelajar::findOrFail($id);
        $this->cekPengubah($request, $video);
        $data = $this->validasi($request, false);
        $lama = [];
        if ($request->hasFile('video')) {
            [$data['file_url'], $data['ukuran_kb']] = $this->simpanBerkas($request);
            $lama[] = $video->file_url;
        }
        if ($request->filled('poster')) {
            $data['poster_url'] = $this->simpanPoster($request);
            $lama[] = $video->poster_url;
        }
        // Mengubah video yang sudah disetujui/diajukan membuatnya kembali menjadi draf
        if (in_array($video->status, ['DISETUJUI', 'DIAJUKAN'], true)) $data += ['status' => 'DRAF', 'disetujui_oleh' => null, 'disetujui_pada' => null];
        $video->update($data);
        $this->hapusBerkas($lama);
        return response()->json(['success' => true, 'message' => 'Video diperbarui.', 'data' => $video->fresh(self::RELASI)]);
    }

    public function destroy(Request $request, string $id)
    {
        $video = VideoBelajar::findOrFail($id);
        $this->cekPengubah($request, $video);
        $berkas = [$video->file_url, $video->poster_url];
        $video->delete();
        $this->hapusBerkas($berkas);
        return response()->json(['success' => true, 'message' => 'Video dihapus dari pustaka dan semua tautannya.']);
    }

    public function ajukan(Request $request, string $id)
    {
        $video = VideoBelajar::findOrFail($id);
        $this->cekPengubah($request, $video);
        abort_unless(in_array($video->status, ['DRAF', 'REVISI'], true), 422, 'Video ini sudah diajukan atau disetujui.');
        abort_if(!$video->file_url || in_array($video->render_status, ['ANTRE', 'PROSES', 'GAGAL'], true), 422, 'Video belum selesai dirender.');
        $video->update(['status' => 'DIAJUKAN']);
        return response()->json(['success' => true, 'message' => 'Video diajukan ke kepala sekolah.']);
    }

    public function setujui(Request $request, string $id)
    {
        abort_unless($request->user()->isKepsek(), 403, 'Persetujuan video hanya oleh kepala sekolah.');
        $video = VideoBelajar::findOrFail($id);
        abort_unless($video->status === 'DIAJUKAN', 422, 'Video ini tidak sedang diajukan.');
        $video->update(['status' => 'DISETUJUI', 'catatan_revisi' => null, 'disetujui_oleh' => $request->user()->id, 'disetujui_pada' => now()]);
        return response()->json(['success' => true, 'message' => 'Video disetujui dan kini bisa dilihat siswa.']);
    }

    public function revisi(Request $request, string $id)
    {
        abort_unless($request->user()->isKepsek(), 403, 'Persetujuan video hanya oleh kepala sekolah.');
        $request->validate(['catatan' => 'required|string|max:2000']);
        $video = VideoBelajar::findOrFail($id);
        abort_unless($video->status === 'DIAJUKAN', 422, 'Video ini tidak sedang diajukan.');
        $video->update(['status' => 'REVISI', 'catatan_revisi' => $request->catatan]);
        return response()->json(['success' => true, 'message' => 'Video dikembalikan ke guru dengan catatan.']);
    }

    // ===== Jalur B: video dari templat, dirender di server dengan narasi suara =====

    public const TEMPLAT = ['KartuGambar', 'Berhitung', 'Urutan', 'Pecahan', 'Rakitan'];
    private const MIME_ASET = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp'];
    private const MIME_AUDIO = ['audio/mpeg' => 'mp3', 'audio/mp3' => 'mp3', 'audio/mp4' => 'm4a', 'audio/x-m4a' => 'm4a', 'audio/ogg' => 'ogg', 'audio/wav' => 'wav', 'audio/x-wav' => 'wav'];

    /** Pilihan suara narasi beserta ketersediaannya. */
    public function suara()
    {
        return response()->json(['data' => SuaraService::tersedia()]);
    }

    /** Buat video dari templat: disimpan sebagai draf dan masuk antrean render. */
    public function dariTemplat(Request $request)
    {
        $data = $this->validasiTemplat($request, true);
        $tambahan = [];
        if ($data['templat'] === 'Rakitan') {
            $data['mesin'] = self::pengaturanStudio()['mesin'];
            // Satu naskah dirender ke beberapa rasio sekaligus (mis. 9:16 untuk Reels dan 16:9 untuk YouTube)
            $request->validate(['rasio_tambahan' => 'nullable|array|max:3', 'rasio_tambahan.*' => [Rule::in(VideoBelajar::RASIO)]]);
            $tambahan = array_values(array_diff(array_unique((array) $request->input('rasio_tambahan', [])), [$data['rasio']]));
        }
        $buat = function (array $d) use ($request) {
            return VideoBelajar::create($d + [
                'id_video' => 'VID-' . Str::upper(Str::random(10)), 'file_url' => '', 'sumber' => 'RENDER', 'status' => 'DRAF',
                'render_status' => 'ANTRE', 'dibuat_oleh' => $request->user()->id,
            ]);
        };
        $judul = $data['judul'];
        $video = $buat($tambahan ? ['judul' => mb_substr("{$judul} ({$data['rasio']})", 0, 200)] + $data : $data);
        $lain = collect($tambahan)->map(fn($r) => $buat(['judul' => mb_substr("{$judul} ({$r})", 0, 200), 'rasio' => $r, 'props' => ['rasio' => $r] + $data['props']] + $data));
        return response()->json(['success' => true,
            'message' => ($lain->isNotEmpty() ? ($lain->count() + 1) . ' video (' . collect([$data['rasio'], ...$tambahan])->implode(', ') . ') masuk antrean render.' : 'Video masuk antrean render.')
                . ' Biasanya selesai dalam beberapa menit; Anda bisa meninggalkan halaman ini.',
            'data' => $video->fresh(self::RELASI), 'tambahan' => $lain->map->only(['id_video', 'judul', 'rasio'])->values()], 201);
    }

    /** Ubah isian templat lalu render ulang. */
    public function renderUlang(Request $request, string $id)
    {
        $video = VideoBelajar::findOrFail($id);
        $this->cekPengubah($request, $video);
        abort_unless($video->sumber === 'RENDER', 422, 'Hanya video dari templat yang bisa dirender ulang.');
        abort_if($video->render_status === 'PROSES', 422, 'Video sedang dirender. Tunggu sampai selesai.');
        $data = $this->validasiTemplat($request, false, $video->templat);
        $video->update($data + ['render_status' => 'ANTRE', 'render_pesan' => null, 'status' => 'DRAF', 'disetujui_oleh' => null, 'disetujui_pada' => null]);
        return response()->json(['success' => true, 'message' => 'Video masuk antrean render ulang.', 'data' => $video->fresh(self::RELASI)]);
    }

    private function validasiTemplat(Request $request, bool $baru, ?string $templatLama = null): array
    {
        if (($request->input('templat') ?? $templatLama) === 'Rakitan') return $this->validasiRakitan($request, $baru);
        $data = $request->validate([
            'templat' => [$baru ? 'required' : 'sometimes', Rule::in(self::TEMPLAT)],
            'judul' => [$baru ? 'required' : 'sometimes', 'string', 'max:200'],
            'deskripsi' => 'nullable|string|max:3000',
            'id_mapel' => 'nullable|exists:subjects,id_mapel',
            'id_kelas' => 'nullable|exists:classes,id_kelas',
            'id_materi' => 'nullable|exists:master_materi,id_materi',
            'suara' => ['required', Rule::in(SuaraService::PILIHAN)],
            'props' => 'required|array',
            'props.adegan' => 'required|array|min:1|max:15',
            'props.adegan.*' => 'array',
            'props.adegan.*.narasi' => 'nullable|string|max:600',
        ], ['props.adegan.required' => 'Tambahkan minimal satu adegan.', 'props.adegan.max' => 'Maksimal 15 adegan (sekitar 2 menit).']);
        if (!empty($data['id_mapel']) && !$request->user()->bolehNilaiMapel($data['id_mapel'])) {
            abort(403, 'Anda hanya dapat membuat video untuk mata pelajaran yang Anda ampu.');
        }
        $pilihan = collect(SuaraService::tersedia())->keyBy('kode');
        abort_unless($pilihan[$data['suara']]['aktif'] ?? false, 422, $pilihan[$data['suara']]['catatan'] ?? 'Suara ini belum tersedia.');
        if (array_key_exists('id_kelas', $data)) {
            $data['fase'] = $data['id_kelas'] ? CapaianPembelajaran::faseKelas(Classes::find($data['id_kelas'])?->nama_kelas) : null;
        }
        // Isian adegan dibatasi panjangnya; props dirender apa adanya oleh templat. Ambil utuh dari permintaan
        // (hasil validate() hanya memuat kolom yang punya aturan, sehingga kata, gambar, warna, dsb. akan hilang).
        $props = (array) $request->input('props');
        $props['judul'] = mb_substr((string) (($props['judul'] ?? '') ?: ($data['judul'] ?? '')), 0, 120);
        if (isset($props['penutup']) && is_array($props['penutup'])) $props['penutup'] = ['teks' => mb_substr((string) ($props['penutup']['teks'] ?? ''), 0, 120)];
        if (isset($props['warna']) && !preg_match('/^#[0-9a-fA-F]{6}$/', (string) $props['warna'])) unset($props['warna']);
        $props['adegan'] = array_map(fn($a) => array_map(fn($v) => is_string($v) ? mb_substr($v, 0, 600) : $v, array_filter($a, fn($v) => is_scalar($v) || $v === null)), array_values($props['adegan']));
        $props['rasio'] = in_array($props['rasio'] ?? null, VideoBelajar::RASIO, true) ? $props['rasio'] : '16:9';
        $data['props'] = array_intersect_key($props, array_flip(['rasio', 'judul', 'emoji', 'warna', 'adegan', 'penutup']));
        $data['rasio'] = $props['rasio'];
        if (isset($data['templat'])) $data['komposisi'] = $data['templat'];
        return $data;
    }

    // ===== Studio Rakit Video (D1) =====

    /** Pengaturan Studio: pembuat video (1 pengguna), mesin render, merek sekolah. */
    public static function pengaturanStudio(): array
    {
        $s = SchoolSetting::query()->first();
        return [
            'id_pembuat' => $s?->id_pembuat_video,
            'mesin' => in_array($s?->mesin_video, NaskahVideo::MESIN, true) ? $s->mesin_video : 'REMOTION',
            'merek' => NaskahVideo::rapikan(['merek' => $s?->merek_video ?? []])['merek'],
            'nama_sekolah' => $s?->nama_sekolah,
        ];
    }

    private function cekStudio(Request $request): void
    {
        abort_unless($request->user()->id === self::pengaturanStudio()['id_pembuat'], 403,
            'Studio Rakit Video hanya untuk pembuat video yang ditunjuk admin.');
    }

    public function studio(Request $request)
    {
        $p = self::pengaturanStudio();
        $u = $request->user();
        return response()->json(['data' => $p + [
            'boleh' => $u->id === $p['id_pembuat'],
            'atur' => $u->isAdmin(),
            'pembuat' => $p['id_pembuat'] ? User::find($p['id_pembuat'])?->only(['id', 'name', 'role']) : null,
            'kandidat' => $u->isAdmin() ? User::whereIn('role', ['admin', 'kepsek', 'guru'])->where('aktif', true)->orderBy('name')->get(['id', 'name', 'role']) : [],
            'mesin_tersedia' => [['kode' => 'REMOTION', 'nama' => 'Remotion', 'aktif' => true], ['kode' => 'REVIDEO', 'nama' => 'Revideo (MIT)', 'aktif' => false,
                'catatan' => 'Penulis render Revideo belum dipasang; video ber-mesin Revideo menunggu di antrean sampai layanannya tersedia.']],
        ]]);
    }

    /** Admin: tunjuk pembuat video & mesin; pembuat/admin: merek sekolah. */
    public function aturStudio(Request $request)
    {
        $u = $request->user();
        $data = $request->validate([
            'id_pembuat' => 'sometimes|nullable|exists:users,id',
            'mesin' => ['sometimes', Rule::in(NaskahVideo::MESIN)],
            'merek' => 'sometimes|array',
        ]);
        $bolehMerek = $u->isAdmin() || $u->id === self::pengaturanStudio()['id_pembuat'];
        abort_if((array_key_exists('id_pembuat', $data) || isset($data['mesin'])) && !$u->isAdmin(), 403, 'Hanya admin yang menunjuk pembuat video dan mesin render.');
        abort_if(isset($data['merek']) && !$bolehMerek, 403);
        if (!empty($data['id_pembuat'])) {
            abort_unless(in_array(User::find($data['id_pembuat'])?->role, ['admin', 'kepsek', 'guru'], true), 422, 'Pembuat video harus akun staf.');
        }
        $s = SchoolSetting::query()->first() ?? new SchoolSetting(['nama_sekolah' => config('app.name', 'Sekolah')]);
        if (array_key_exists('id_pembuat', $data)) $s->id_pembuat_video = $data['id_pembuat'];
        if (isset($data['mesin'])) $s->mesin_video = $data['mesin'];
        if (isset($data['merek'])) $s->merek_video = NaskahVideo::rapikan(['merek' => $request->input('merek')])['merek'];
        $s->save();
        return response()->json(['success' => true, 'message' => 'Pengaturan Studio disimpan.', 'data' => self::pengaturanStudio()]);
    }

    private function cekPembuatAtauAdmin(Request $request): void
    {
        $u = $request->user();
        abort_unless($u->id === self::pengaturanStudio()['id_pembuat'] || $u->isAdmin(), 403, 'Studio Rakit Video hanya untuk pembuat video yang ditunjuk admin.');
    }

    /**
     * Unggah aset naskah: gambar (PNG/JPG/WebP ≤ 5 MB, untuk elemen, latar, logo) atau musik (MP3/M4A/OGG/WAV ≤ 10 MB).
     * Gambar ditandai memuat foto siswa atau tidak, dan apakah orang tua sudah memberi izin.
     */
    public function aset(Request $request)
    {
        $this->cekPembuatAtauAdmin($request);
        $request->validate([
            'gambar' => 'required_without:audio|file|max:5120|mimetypes:' . implode(',', array_keys(self::MIME_ASET)),
            'audio' => 'required_without:gambar|file|max:10240|mimetypes:' . implode(',', array_keys(self::MIME_AUDIO)),
            'foto_siswa' => 'nullable|boolean',
            'izin_ortu' => 'nullable|boolean',
        ]);
        $audio = $request->hasFile('audio');
        $f = $request->file($audio ? 'audio' : 'gambar');
        $ext = ($audio ? self::MIME_AUDIO : self::MIME_ASET)[$f->getMimeType()];
        $path = '/storage/' . $f->storeAs('video-aset', 'aset_' . Str::lower(Str::random(20)) . ".{$ext}", 'public');
        $aset = VideoAset::create(['path' => $path, 'jenis' => $audio ? 'AUDIO' : 'GAMBAR', 'nama_asli' => mb_substr($f->getClientOriginalName(), 0, 250),
            'foto_siswa' => !$audio && $request->boolean('foto_siswa'), 'izin_ortu' => !$audio && $request->boolean('izin_ortu'), 'diunggah_oleh' => $request->user()->id]);
        return response()->json(['success' => true, 'url' => $path, 'data' => $aset], 201);
    }

    public function daftarAset(Request $request)
    {
        $this->cekPembuatAtauAdmin($request);
        return response()->json(['data' => VideoAset::orderByDesc('created_at')->limit(300)->get()]);
    }

    /** Perbarui penanda foto siswa / izin orang tua (mis. setelah surat izin diterima). */
    public function ubahAset(Request $request, int $id)
    {
        $this->cekPembuatAtauAdmin($request);
        $a = VideoAset::findOrFail($id);
        $a->update($request->validate(['foto_siswa' => 'sometimes|boolean', 'izin_ortu' => 'sometimes|boolean']));
        return response()->json(['success' => true, 'message' => 'Penanda gambar disimpan.', 'data' => $a]);
    }

    /** Papan cerita AI (D3): satu kalimat permintaan → naskah berisi adegan, teks, emoji, dan narasi untuk disunting. */
    public function papanCerita(Request $request, StudioAIService $ai, PustakaDokumenService $pustaka)
    {
        $this->cekStudio($request);
        $d = $request->validate([
            'permintaan' => 'required|string|min:10|max:1000',
            'tujuan' => ['required', Rule::in(NaskahVideo::TUJUAN)],
            'rasio' => ['required', Rule::in(VideoBelajar::RASIO)],
            'jumlah_adegan' => 'required|integer|min:3|max:8',
            'id_mapel' => 'nullable|exists:subjects,id_mapel',
            'ai_mode' => ['required', Rule::in(SoalAIService::MODES)],
        ]);
        $atur = self::pengaturanStudio();
        // Video pembelajaran membaca Pustaka Dokumen agar isinya sesuai CP & panduan resmi
        $sumber = $d['tujuan'] === 'PEMBELAJARAN' ? $pustaka->pasang($ai, $d['permintaan'], $d['id_mapel'] ?? null) : [];
        $papan = $ai->papanCerita($d + ['sekolah' => $atur['nama_sekolah'], 'warna' => $atur['merek']['warna'] ?? []], $d['ai_mode']);
        if ($papan === null) return response()->json(['message' => $ai->galat()], 422);
        $naskah = NaskahVideo::dariPapanCerita($papan, $d['rasio'], $atur['merek']);
        return response()->json(['success' => true, 'message' => 'Papan cerita ' . count($naskah['adegan']) . ' adegan tersusun. Periksa teks, narasi, dan tata letaknya.'
            . PustakaDokumenService::catatanSumber($sumber), 'naskah' => $naskah, 'rujukan' => $sumber]);
    }

    // ===== Templat naskah sekolah =====

    public function daftarTemplatStudio(Request $request)
    {
        $this->cekStudio($request);
        return response()->json(['data' => TemplatVideo::orderBy('kategori')->orderByDesc('updated_at')->get()]);
    }

    public function simpanTemplatStudio(Request $request, ?string $id = null)
    {
        $this->cekStudio($request);
        $t = $id ? TemplatVideo::findOrFail($id) : new TemplatVideo(['id_templat' => 'TPV-' . Str::upper(Str::random(10)), 'dibuat_oleh' => $request->user()->id]);
        $data = $request->validate([
            'judul' => [$id ? 'sometimes' : 'required', 'string', 'max:120'],
            'kategori' => [$id ? 'sometimes' : 'required', Rule::in(TemplatVideo::KATEGORI)],
            'deskripsi' => 'nullable|string|max:1000',
            'naskah' => [$id ? 'sometimes' : 'required', 'array'],
            'naskah.adegan' => [$id ? 'sometimes' : 'required', 'array', 'min:1', 'max:' . NaskahVideo::MAKS_ADEGAN],
        ]);
        if (isset($data['naskah'])) {
            $naskah = NaskahVideo::rapikan((array) $request->input('naskah'));
            $data['naskah'] = $naskah;
            $data['rasio'] = $naskah['rasio'];
        }
        $t->fill($data)->save();
        return response()->json(['success' => true, 'message' => 'Templat disimpan.', 'data' => $t], $id ? 200 : 201);
    }

    public function hapusTemplatStudio(Request $request, string $id)
    {
        $this->cekStudio($request);
        TemplatVideo::findOrFail($id)->delete();
        return response()->json(['success' => true, 'message' => 'Templat dihapus.']);
    }

    private function validasiRakitan(Request $request, bool $baru): array
    {
        $this->cekStudio($request);
        $data = $request->validate([
            'templat' => [$baru ? 'required' : 'sometimes', Rule::in(['Rakitan'])],
            'judul' => [$baru ? 'required' : 'sometimes', 'string', 'max:200'],
            'deskripsi' => 'nullable|string|max:3000',
            'id_mapel' => 'nullable|exists:subjects,id_mapel',
            'id_kelas' => 'nullable|exists:classes,id_kelas',
            'id_materi' => 'nullable|exists:master_materi,id_materi',
            'suara' => ['required', Rule::in(SuaraService::PILIHAN)],
            'props' => 'required|array',
            'props.adegan' => 'required|array|min:1|max:' . NaskahVideo::MAKS_ADEGAN,
            'tujuan' => ['nullable', Rule::in(NaskahVideo::TUJUAN)],
        ], ['props.adegan.required' => 'Tambahkan minimal satu adegan.', 'props.adegan.max' => 'Maksimal ' . NaskahVideo::MAKS_ADEGAN . ' adegan.']);
        $pilihan = collect(SuaraService::tersedia())->keyBy('kode');
        abort_unless($pilihan[$data['suara']]['aktif'] ?? false, 422, $pilihan[$data['suara']]['catatan'] ?? 'Suara ini belum tersedia.');
        if (array_key_exists('id_kelas', $data)) {
            $data['fase'] = $data['id_kelas'] ? CapaianPembelajaran::faseKelas(Classes::find($data['id_kelas'])?->nama_kelas) : null;
        }
        $props = NaskahVideo::rapikan((array) $request->input('props'));
        $props['judul'] = $props['judul'] ?: mb_substr((string) ($data['judul'] ?? ''), 0, 120);
        $data['props'] = $props;
        $data['rasio'] = $props['rasio'];
        $data['komposisi'] = 'Rakitan';
        $data['tujuan'] ??= 'PEMBELAJARAN';
        // Video di luar pembelajaran (promosi, pengumuman, acara) dibagikan ke publik: foto siswa wajib berizin orang tua
        if ($data['tujuan'] !== 'PEMBELAJARAN') {
            $tanpaIzin = VideoAset::whereIn('path', NaskahVideo::asetGambar($props))->where('foto_siswa', true)->where('izin_ortu', false)->pluck('nama_asli');
            abort_if($tanpaIzin->isNotEmpty(), 422, 'Video ' . strtolower($data['tujuan']) . ' memakai foto siswa yang belum berizin orang tua ('
                . $tanpaIzin->filter()->take(3)->implode(', ') . '). Ganti gambarnya, atau tandai izinnya setelah orang tua setuju.');
        }
        return $data;
    }

    // ===== Tautan ke modul ajar & sesi jadwal =====

    /** Video yang ditautkan ke satu modul (semua pertemuan) atau satu sesi jadwal. */
    public function tautan(Request $request)
    {
        $request->validate(['jenis' => ['required', Rule::in(VideoTautan::JENIS)], 'id_target' => 'required|string|max:50']);
        $data = VideoTautan::with('video')->where('jenis', $request->jenis)->where('id_target', $request->id_target)
            ->orderBy('pertemuan_ke')->orderBy('urutan')->get()
            ->filter(fn($t) => $t->video)->map(fn($t) => ['id' => $t->id, 'pertemuan_ke' => $t->pertemuan_ke] + $t->video->ringkas())->values();
        return response()->json(['data' => $data]);
    }

    public function tautkan(Request $request)
    {
        $data = $request->validate([
            'id_video' => 'required|exists:video_belajar,id_video',
            'jenis' => ['required', Rule::in(VideoTautan::JENIS)],
            'id_target' => 'required|string|max:50',
            'pertemuan_ke' => 'nullable|integer|min:1|max:12',
        ]);
        $this->cekTarget($request, $data['jenis'], $data['id_target']);
        abort_unless($this->terjangkau($request)->whereKey($data['id_video'])->exists(), 404, 'Video tidak ditemukan.');
        $t = VideoTautan::firstOrCreate(
            ['id_video' => $data['id_video'], 'jenis' => $data['jenis'], 'id_target' => $data['id_target'], 'pertemuan_ke' => $data['pertemuan_ke'] ?? null],
            ['urutan' => (int) VideoTautan::where('jenis', $data['jenis'])->where('id_target', $data['id_target'])->max('urutan') + 1]
        );
        return response()->json(['success' => true, 'message' => 'Video ditautkan.', 'data' => ['id' => $t->id, 'pertemuan_ke' => $t->pertemuan_ke] + $t->video->ringkas()], 201);
    }

    public function lepas(Request $request, int $id)
    {
        $t = VideoTautan::findOrFail($id);
        $this->cekTarget($request, $t->jenis, $t->id_target);
        $t->delete();
        return response()->json(['success' => true, 'message' => 'Tautan video dilepas.']);
    }

    // ===== Portal siswa & orang tua =====

    /** Video belajar yang disetujui untuk kelas anak (kelas yang sama, atau tanpa kelas dengan fase yang sama/umum). */
    public function portal(Request $request)
    {
        $kelas = Student::whereIn('id_siswa', $request->user()->siswaTerjangkau())->with('kelas:id_kelas,nama_kelas')->get()->pluck('kelas')->filter()->unique('id_kelas');
        $idKelas = $kelas->pluck('id_kelas')->all();
        $fase = $kelas->map(fn($k) => CapaianPembelajaran::faseKelas($k->nama_kelas))->filter()->unique()->values()->all();
        $data = VideoBelajar::with(['mapel:id_mapel,nama_mapel', 'materi:id_materi,nama_materi'])->where('status', 'DISETUJUI')->where('tujuan', 'PEMBELAJARAN')
            ->where(fn($q) => $q->whereIn('id_kelas', $idKelas)->orWhere(fn($w) => $w->whereNull('id_kelas')->where(fn($f) => $f->whereNull('fase')->orWhereIn('fase', $fase))))
            ->orderByDesc('disetujui_pada')->get(['id_video', 'judul', 'deskripsi', 'id_mapel', 'id_materi', 'file_url', 'poster_url', 'durasi_detik', 'ukuran_kb', 'rasio', 'disetujui_pada']);
        return response()->json(['data' => $data]);
    }

    // ===== bantu =====

    private function validasi(Request $request, bool $baru): array
    {
        $data = $request->validate([
            'judul' => [$baru ? 'required' : 'sometimes', 'string', 'max:200'],
            'deskripsi' => 'nullable|string|max:3000',
            'id_mapel' => 'nullable|exists:subjects,id_mapel',
            'id_kelas' => 'nullable|exists:classes,id_kelas',
            'id_materi' => 'nullable|exists:master_materi,id_materi',
            'tp' => 'nullable|array|max:20',
            'tp.*' => 'exists:master_indikator,id_indikator',
            'durasi_detik' => 'nullable|integer|min:1|max:3600',
            'sumber' => ['nullable', Rule::in(VideoBelajar::SUMBER)],
            'tujuan' => ['nullable', Rule::in(NaskahVideo::TUJUAN)],
            'rasio' => ['nullable', Rule::in(VideoBelajar::RASIO)],
            'komposisi' => 'nullable|string|max:100',
            'props' => 'nullable|array',
            'video' => [$baru ? 'required' : 'nullable', 'file', 'max:' . self::MAKS_KB],
            'poster' => 'nullable|string',
        ], ['video.max' => 'Ukuran video maksimal 20MB. Perkecil resolusi atau durasinya.']);
        if (!empty($data['id_mapel']) && !$request->user()->bolehNilaiMapel($data['id_mapel'])) {
            abort(403, 'Anda hanya dapat menambahkan video untuk mata pelajaran yang Anda ampu.');
        }
        if (array_key_exists('id_kelas', $data)) {
            $data['fase'] = $data['id_kelas'] ? CapaianPembelajaran::faseKelas(Classes::find($data['id_kelas'])?->nama_kelas) : null;
        }
        return collect($data)->except(['video', 'poster'])->filter(fn($v, $k) => $k !== 'tujuan' || $v)->all();
    }

    private function simpanBerkas(Request $request): array
    {
        $file = $request->file('video');
        $mime = (new \finfo(FILEINFO_MIME_TYPE))->file($file->getRealPath());
        $ext = self::MIME_VIDEO[$mime] ?? null;
        if (!$ext) throw ValidationException::withMessages(['video' => "Format video harus MP4 atau WebM (terbaca: {$mime})."]);
        $path = $file->storeAs('video', 'vid_' . Str::random(20) . ".{$ext}", 'public');
        return ['/storage/' . $path, (int) ceil($file->getSize() / 1024)];
    }

    private function simpanPoster(Request $request): ?string
    {
        if (!$request->filled('poster')) return null;
        $data = base64_decode(preg_replace('/^data:[^,]*,/', '', $request->poster), true);
        if (!$data || strlen($data) > 2 * 1024 * 1024) return null;
        $ext = self::MIME_POSTER[(new \finfo(FILEINFO_MIME_TYPE))->buffer($data)] ?? null;
        if (!$ext) return null;
        $path = 'video/poster_' . Str::random(20) . ".{$ext}";
        Storage::disk('public')->put($path, $data);
        return '/storage/' . $path;
    }

    private function hapusBerkas(array $urls): void
    {
        foreach (array_filter($urls) as $url) {
            if (Str::startsWith($url, '/storage/video/')) Storage::disk('public')->delete(Str::after($url, '/storage/'));
        }
    }

    /** Di mana saja video ini dipakai. */
    private function tempat(VideoBelajar $video): array
    {
        $tautan = $video->tautan()->get();
        $modul = ModulAjar::whereIn('id_modul', $tautan->where('jenis', 'MODUL')->pluck('id_target'))->pluck('judul', 'id_modul');
        $jadwal = TransJadwal::with('mapel:id_mapel,nama_mapel')->whereIn('id_jadwal', $tautan->where('jenis', 'JADWAL')->pluck('id_target'))->get()->keyBy('id_jadwal');
        $hasil = $tautan->map(fn($t) => $t->jenis === 'MODUL'
            ? ['jenis' => 'Modul ajar', 'judul' => ($modul[$t->id_target] ?? 'Modul') . ($t->pertemuan_ke ? " · pertemuan {$t->pertemuan_ke}" : '')]
            : ['jenis' => 'Jadwal', 'judul' => trim(($jadwal[$t->id_target]?->mapel?->nama_mapel ?? $jadwal[$t->id_target]?->judul ?? 'Sesi') . ' · ' . ($jadwal[$t->id_target]?->mulai?->translatedFormat('d M Y H:i') ?? ''))])->all();
        foreach (BankSoal::where('id_video', $video->id_video)->get(['pertanyaan']) as $s) $hasil[] = ['jenis' => 'Soal', 'judul' => Str::limit($s->pertanyaan, 80)];
        return $hasil;
    }

    private function terjangkau(Request $request): Builder
    {
        $user = $request->user();
        return VideoBelajar::query()->when(!$user->isPengelola(), fn($q) => $q->where(fn($w) => $w->where('dibuat_oleh', $user->id)
            ->orWhere(fn($x) => $x->where('status', 'DISETUJUI')->where(fn($m) => $m->whereNull('id_mapel')->orWhereIn('id_mapel', $user->mapelDiampu())))));
    }

    private function cekPengubah(Request $request, VideoBelajar $video): void
    {
        $user = $request->user();
        abort_unless($user->isPengelola() || $video->dibuat_oleh === $user->id, 403, 'Video ini milik guru lain.');
    }

    /** Hanya pemilik modul/jadwal (atau admin & kepsek) yang boleh menautkan video. */
    private function cekTarget(Request $request, string $jenis, string $id): void
    {
        $user = $request->user();
        if ($user->isPengelola()) return;
        $boleh = $jenis === 'MODUL'
            ? ModulAjar::whereKey($id)->where('dibuat_oleh', $user->id)->exists()
            : TransJadwal::whereKey($id)->where('id_guru', $user->id_guru)->exists();
        abort_unless($boleh, 403, $jenis === 'MODUL' ? 'Modul ini milik guru lain.' : 'Sesi jadwal ini milik guru lain.');
    }
}

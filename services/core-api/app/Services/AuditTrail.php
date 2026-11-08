<?php

namespace App\Services;

use App\Models\LogAktivitas;
use App\Models\Student;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Throwable;

/**
 * Pencatat audit trail.
 * - Setiap perubahan model App\Models (tambah/ubah/hapus) direkam beserta nilai sebelum & sesudahnya.
 * - Selama permintaan HTTP, perubahan dikumpulkan lalu ditempelkan ke satu log tindakan (middleware CatatAktivitas);
 *   di luar permintaan (migrasi, artisan) perubahan langsung dicatat sebagai kategori SISTEM.
 * - Kata sandi, token, API key, dan isi berkas (base64) selalu disensor.
 */
class AuditTrail
{
    /** Label modul per model; model yang tidak terdaftar memakai nama tabelnya. */
    public const MODUL = [
        'Student' => 'Master Siswa', 'Teacher' => 'Master Guru', 'Classes' => 'Master Kelas', 'Subject' => 'Master Mapel',
        'MasterOrtu' => 'Master Siswa', 'MasterWali' => 'Master Siswa', 'MasterPeriode' => 'Semester',
        'MasterKategoriPenilaian' => 'High Level', 'MasterMBK' => 'Aktivitas', 'MasterMateri' => 'Materi', 'MasterIndikator' => 'Materi',
        'MasterRuangan' => 'Ruangan', 'MasterProyek' => 'Proyek', 'MasterTargetP5' => 'Proyek',
        'TransNilai' => 'Nilai', 'TransNilaiIndikator' => 'Nilai', 'TransRencanaRemedial' => 'Remedial',
        'TransJurnal' => 'Jurnal', 'TransPresensi' => 'Presensi', 'TransJadwal' => 'Jadwal',
        'TransNilaiP5' => 'Proyek', 'TransCatatanP5' => 'Proyek', 'TransCatatanWali' => 'Rapor',
        'SchoolSetting' => 'Pengaturan Sekolah', 'User' => 'Pengguna', 'TransDiagnostikNonkognitif' => 'Asesmen Diagnostik',
        'BankSoal' => 'Bank Soal', 'KisiKisi' => 'Bank Soal', 'KisiKisiBaris' => 'Bank Soal',
        'PaketSoal' => 'Paket Soal', 'PaketSoalButir' => 'Paket Soal', 'PaketSoalJawaban' => 'Paket Soal',
        'CapaianPembelajaran' => 'Perangkat Ajar', 'Atp' => 'Perangkat Ajar', 'AtpBaris' => 'Perangkat Ajar', 'ModulAjar' => 'Perangkat Ajar', 'VideoBelajar' => 'Video Belajar', 'VideoTautan' => 'Video Belajar',
    ];

    // Kolom yang tidak dicatat karena berubah sendiri atau tidak bermakna bagi audit
    private const ABAIKAN = ['created_at', 'updated_at', 'login_terakhir', 'remember_token'];
    // Kunci yang isinya selalu disensor
    private const RAHASIA = '/pass(word)?|token|api_key|secret|base64|signature/i';
    private const LABEL = ['nama_siswa', 'nama_guru', 'nama_kelas', 'nama_mapel', 'nama_materi', 'judul_proyek', 'judul', 'nama_ruangan',
        'nama_kategori', 'kategori_penilaian', 'deskripsi', 'name', 'username', 'nama_sekolah', 'tahun_ajaran', 'nama_ayah', 'nama_wali'];

    private static bool $dalamPermintaan = false;
    private static array $antrean = [];
    private static bool $sudahDicatat = false;
    private static array $namaSiswa = [];

    public static function mulaiPermintaan(): void
    {
        self::$dalamPermintaan = true;
        self::$antrean = [];
        self::$sudahDicatat = false;
    }

    public static function selesaiPermintaan(): array
    {
        $sisa = self::$antrean;
        self::$dalamPermintaan = false;
        self::$antrean = [];
        return $sisa;
    }

    public static function sudahDicatat(): bool { return self::$sudahDicatat; }

    /** Buang perubahan yang terkumpul, mis. karena permintaannya gagal dan transaksinya dibatalkan. */
    public static function buangAntrean(): void { self::$antrean = []; }

    /** Dipanggil listener eloquent.created/updated/deleted untuk model aplikasi. */
    public static function rekamModel(Model $model, string $aksi): void
    {
        $abaikan = [...self::ABAIKAN, ...$model->getHidden()];
        $saring = fn(array $data) => self::sensor(array_diff_key($data, array_flip($abaikan)));

        if ($aksi === 'UBAH') {
            $baru = $saring($model->getChanges());
            if (!$baru) return;
            $lama = array_intersect_key($saring($model->getOriginal()), $baru);
        } else {
            $lama = $aksi === 'HAPUS' ? $saring($model->getAttributes()) : null;
            $baru = $aksi === 'TAMBAH' ? $saring($model->getAttributes()) : null;
        }

        $nama = class_basename($model);
        $rincian = [
            'aksi' => $aksi,
            'tabel' => $model->getTable(),
            'modul' => self::MODUL[$nama] ?? Str::headline($model->getTable()),
            'id_subjek' => (string) $model->getKey(),
            'label' => self::label($model),
            'data_lama' => $lama,
            'data_baru' => $baru,
        ];

        if (self::$dalamPermintaan) {
            self::$antrean[] = $rincian;
            return;
        }
        self::catat([
            'kategori' => 'SISTEM', 'aksi' => $aksi, 'modul' => $rincian['modul'],
            'deskripsi' => ucfirst(strtolower($aksi)) . " {$rincian['modul']}" . ($rincian['label'] ? ": {$rincian['label']}" : '') . ' (proses sistem)',
        ], [$rincian]);
    }

    /**
     * Tulis satu log tindakan. Identitas pengguna, IP, dan perangkat diambil dari permintaan aktif bila tidak diisi.
     * Perubahan yang sedang terkumpul ikut ditempelkan ke log ini.
     */
    public static function catat(array $data, ?array $perubahan = null): ?LogAktivitas
    {
        $request = app()->runningInConsole() && !app()->runningUnitTests() ? null : request();
        $user = array_key_exists('user', $data) ? $data['user'] : ($request?->user() ?? auth()->user());
        unset($data['user']);
        $perubahan ??= self::$antrean;
        if (self::$dalamPermintaan) {
            self::$antrean = [];
            self::$sudahDicatat = true;
        }

        try {
            return DB::transaction(function () use ($data, $perubahan, $user, $request) {
                $log = LogAktivitas::create($data + [
                    'waktu' => now(),
                    'user_id' => $user?->id,
                    'nama_user' => $user?->name,
                    'peran' => $user?->role,
                    'ip' => $request?->ip(),
                    'user_agent' => $request ? Str::limit((string) $request->userAgent(), 490, '') : null,
                    'jumlah_perubahan' => count($perubahan),
                ]);
                foreach (array_chunk($perubahan, 200) as $potongan) {
                    $log->perubahan()->createMany($potongan);
                }
                return $log;
            });
        } catch (Throwable $e) {
            // Audit tidak boleh menggagalkan pekerjaan pengguna; kegagalan dicatat di log server
            report($e);
            return null;
        }
    }

    /** Sensor data rahasia dan pangkas isi yang sangat panjang (mis. respons AI, gambar). */
    public static function sensor(mixed $data, int $kedalaman = 0): mixed
    {
        if (!is_array($data)) return $data;
        $hasil = [];
        foreach ($data as $kunci => $isi) {
            if (is_string($kunci) && preg_match(self::RAHASIA, $kunci)) {
                $hasil[$kunci] = ($isi === null || $isi === '') ? $isi : '••• disensor •••';
            } elseif (is_array($isi)) {
                $hasil[$kunci] = $kedalaman > 4 ? '[…]' : self::sensor($isi, $kedalaman + 1);
            } elseif (is_string($isi) && str_starts_with($isi, 'data:')) {
                $hasil[$kunci] = '[berkas ' . number_format(strlen($isi) / 1024, 0) . ' KB]';
            } elseif (is_string($isi) && mb_strlen($isi) > 1500) {
                $hasil[$kunci] = mb_substr($isi, 0, 1500) . '… [dipangkas]';
            } else {
                $hasil[$kunci] = $isi;
            }
        }
        return $hasil;
    }

    private static function label(Model $model): ?string
    {
        foreach (self::LABEL as $kolom) {
            if (filled($model->getAttribute($kolom))) return Str::limit((string) $model->getAttribute($kolom), 120);
        }
        if ($id = $model->getAttribute('id_siswa')) {
            return self::$namaSiswa[$id] ??= Student::whereKey($id)->value('nama_siswa') ?? $id;
        }
        return null;
    }

    /** Pemetaan rute API → modul, aksi, kategori, dan kalimat yang mudah dibaca. */
    public static function uraikanRute(Request $request): array
    {
        $rute = $request->method() . ' ' . ($request->route()?->uri() ?? $request->path());
        [$modul, $aksi, $teks, $kategori] = (self::RUTE[$rute] ?? [null, null, null]) + [3 => 'DATA'];
        if (!$modul) {
            $segmen = Str::of($request->route()?->uri() ?? '')->after('api/')->before('/')->replace('-', ' ')->headline();
            $modul = (string) $segmen;
            $aksi = match ($request->method()) { 'DELETE' => 'HAPUS', 'PUT', 'PATCH' => 'UBAH', default => 'SIMPAN' };
            $teks = ucfirst(strtolower(['HAPUS' => 'Menghapus', 'UBAH' => 'Mengubah', 'SIMPAN' => 'Menyimpan'][$aksi])) . " data {$modul}";
        }
        if (is_array($request->input('records'))) $teks .= ' (' . count($request->input('records')) . ' baris)';
        if (is_array($request->input('daftar_pesan'))) $teks .= ' (' . count($request->input('daftar_pesan')) . ' pesan)';
        return compact('modul', 'aksi', 'teks', 'kategori');
    }

    private const RUTE = [
        'POST api/akun/password' => ['Akun', 'GANTI_SANDI', 'Mengganti kata sandi sendiri', 'AUTH'],
        'POST api/classes' => ['Master Kelas', 'TAMBAH', 'Menambah kelas'],
        'PUT api/classes/{class}' => ['Master Kelas', 'UBAH', 'Mengubah kelas'],
        'PATCH api/classes/{class}' => ['Master Kelas', 'UBAH', 'Mengubah kelas'],
        'DELETE api/classes/{class}' => ['Master Kelas', 'HAPUS', 'Menghapus kelas'],
        'POST api/students' => ['Master Siswa', 'TAMBAH', 'Menambah siswa'],
        'PUT api/students/{student}' => ['Master Siswa', 'UBAH', 'Mengubah data siswa'],
        'PATCH api/students/{student}' => ['Master Siswa', 'UBAH', 'Mengubah data siswa'],
        'DELETE api/students/{student}' => ['Master Siswa', 'HAPUS', 'Menghapus siswa'],
        'POST api/teachers' => ['Master Guru', 'TAMBAH', 'Menambah guru'],
        'PUT api/teachers/{teacher}' => ['Master Guru', 'UBAH', 'Mengubah data guru'],
        'PATCH api/teachers/{teacher}' => ['Master Guru', 'UBAH', 'Mengubah data guru'],
        'DELETE api/teachers/{teacher}' => ['Master Guru', 'HAPUS', 'Menghapus guru'],
        'POST api/subjects' => ['Master Mapel', 'TAMBAH', 'Menambah mata pelajaran'],
        'PUT api/subjects/{subject}' => ['Master Mapel', 'UBAH', 'Mengubah mata pelajaran'],
        'PATCH api/subjects/{subject}' => ['Master Mapel', 'UBAH', 'Mengubah mata pelajaran'],
        'DELETE api/subjects/{subject}' => ['Master Mapel', 'HAPUS', 'Menghapus mata pelajaran'],
        'POST api/periodes' => ['Semester', 'TAMBAH', 'Menambah semester'],
        'PUT api/periodes/{periode}' => ['Semester', 'UBAH', 'Mengubah semester'],
        'PATCH api/periodes/{periode}' => ['Semester', 'UBAH', 'Mengubah semester'],
        'DELETE api/periodes/{periode}' => ['Semester', 'HAPUS', 'Menghapus semester'],
        'POST api/kategori-penilaian' => ['High Level', 'TAMBAH', 'Menambah High Level'],
        'PUT api/kategori-penilaian/{kategori_penilaian}' => ['High Level', 'UBAH', 'Mengubah High Level'],
        'PATCH api/kategori-penilaian/{kategori_penilaian}' => ['High Level', 'UBAH', 'Mengubah High Level'],
        'DELETE api/kategori-penilaian/{kategori_penilaian}' => ['High Level', 'HAPUS', 'Menghapus High Level'],
        'POST api/mbk' => ['Aktivitas', 'TAMBAH', 'Menambah aktivitas'],
        'PUT api/mbk/{mbk}' => ['Aktivitas', 'UBAH', 'Mengubah aktivitas'],
        'PATCH api/mbk/{mbk}' => ['Aktivitas', 'UBAH', 'Mengubah aktivitas'],
        'DELETE api/mbk/{mbk}' => ['Aktivitas', 'HAPUS', 'Menghapus aktivitas'],
        'POST api/materi' => ['Materi', 'TAMBAH', 'Menambah materi'],
        'PUT api/materi/{materi}' => ['Materi', 'UBAH', 'Mengubah materi & indikator'],
        'DELETE api/materi/{materi}' => ['Materi', 'HAPUS', 'Menghapus materi'],
        'POST api/indikator' => ['Materi', 'TAMBAH', 'Menambah indikator'],
        'PUT api/indikator/{indikator}' => ['Materi', 'UBAH', 'Mengubah indikator'],
        'DELETE api/indikator/{indikator}' => ['Materi', 'HAPUS', 'Menghapus indikator'],
        'POST api/ruangan' => ['Ruangan', 'TAMBAH', 'Menambah ruangan'],
        'PUT api/ruangan/{ruangan}' => ['Ruangan', 'UBAH', 'Mengubah ruangan'],
        'PATCH api/ruangan/{ruangan}' => ['Ruangan', 'UBAH', 'Mengubah ruangan'],
        'DELETE api/ruangan/{ruangan}' => ['Ruangan', 'HAPUS', 'Menghapus ruangan'],
        'POST api/jadwal' => ['Jadwal', 'TAMBAH', 'Menambah jadwal'],
        'PUT api/jadwal/{id}' => ['Jadwal', 'UBAH', 'Mengubah jadwal'],
        'DELETE api/jadwal/{id}' => ['Jadwal', 'HAPUS', 'Menghapus jadwal'],
        'PATCH api/jadwal/{id}/geser' => ['Jadwal', 'UBAH', 'Menggeser jadwal di kalender'],
        'PATCH api/jadwal/{id}/status' => ['Jadwal', 'UBAH', 'Mengubah status sesi jadwal'],
        'POST api/nilai/batch' => ['Nilai', 'SIMPAN', 'Menyimpan lembar nilai'],
        'DELETE api/nilai/{id}' => ['Nilai', 'HAPUS', 'Menghapus nilai'],
        'POST api/remedial' => ['Remedial', 'TAMBAH', 'Membuat rencana tindak lanjut remedial'],
        'PUT api/remedial/{id}' => ['Remedial', 'UBAH', 'Mengubah rencana tindak lanjut'],
        'DELETE api/remedial/{id}' => ['Remedial', 'HAPUS', 'Membatalkan rencana tindak lanjut'],
        'POST api/remedial/notifikasi' => ['Remedial', 'SUSUN_PESAN', 'Menyusun pesan WA orang tua', 'OUTPUT'],
        'POST api/jurnal/analyze' => ['Jurnal', 'AI', 'Menganalisis narasi jurnal dengan AI', 'OUTPUT'],
        'POST api/jurnal/store' => ['Jurnal', 'TAMBAH', 'Menulis jurnal'],
        'POST api/jurnal/import' => ['Jurnal', 'IMPORT', 'Mengimpor jurnal'],
        'PUT api/jurnal/{id}' => ['Jurnal', 'UBAH', 'Mengubah jurnal'],
        'DELETE api/jurnal/{id}' => ['Jurnal', 'HAPUS', 'Menghapus jurnal'],
        'POST api/presensi/batch' => ['Presensi', 'SIMPAN', 'Menyimpan presensi'],
        'DELETE api/presensi/tanggal' => ['Presensi', 'HAPUS', 'Menghapus presensi satu tanggal'],
        'POST api/p5/proyek' => ['Proyek', 'TAMBAH', 'Membuat kegiatan kokurikuler'],
        'PUT api/p5/proyek/{id}' => ['Proyek', 'UBAH', 'Mengubah kegiatan kokurikuler'],
        'DELETE api/p5/proyek/{id}' => ['Proyek', 'HAPUS', 'Menghapus kegiatan kokurikuler'],
        'PUT api/p5/nilai/{id}' => ['Proyek', 'UBAH', 'Mengubah predikat kokurikuler'],
        'POST api/p5/hitung' => ['Proyek', 'SIMPAN', 'Menghitung predikat kokurikuler otomatis'],
        'POST api/p5/catatan' => ['Proyek', 'SIMPAN', 'Menyimpan catatan proses kokurikuler'],
        'POST api/p5/catatan/generate' => ['Proyek', 'AI', 'Membuat catatan kokurikuler dengan AI', 'OUTPUT'],
        'POST api/rapor/catatan-wali' => ['Rapor', 'SIMPAN', 'Menyimpan catatan wali kelas'],
        'POST api/rapor/catatan-wali/generate' => ['Rapor', 'AI', 'Membuat catatan wali kelas dengan AI', 'OUTPUT'],
        'POST api/settings' => ['Pengaturan Sekolah', 'UBAH', 'Mengubah pengaturan sekolah'],
        'POST api/users' => ['Pengguna', 'TAMBAH', 'Membuat akun pengguna'],
        'POST api/users/generate' => ['Pengguna', 'TAMBAH', 'Membuat akun pengguna massal'],
        'PUT api/users/{id}' => ['Pengguna', 'UBAH', 'Mengubah akun pengguna'],
        'DELETE api/users/{id}' => ['Pengguna', 'HAPUS', 'Menghapus akun pengguna'],
        'POST api/users/{id}/reset-password' => ['Pengguna', 'RESET_SANDI', 'Mereset kata sandi pengguna', 'AUTH'],
        'PUT api/diagnostik/nonkognitif' => ['Asesmen Diagnostik', 'SIMPAN', 'Menyimpan diagnostik non-kognitif kelas'],
        'POST api/whatsapp' => ['WhatsApp', 'KIRIM_WA', 'Mengirim WhatsApp otomatis (Fonnte)', 'OUTPUT'],
    ];
}

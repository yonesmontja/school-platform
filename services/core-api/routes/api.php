<?php

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;
use App\Http\Controllers\Api\AdministrasiController;
use App\Http\Controllers\Api\SpmbController;
use App\Http\Controllers\Api\KeuanganController;
use App\Http\Controllers\Api\SuratController;
use App\Http\Controllers\Api\InventarisController;
use App\Http\Controllers\Api\SpmbPublikController;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\StudentController;
use App\Http\Controllers\Api\KeluargaController;
use App\Http\Controllers\Api\SchoolSettingController;
use App\Http\Controllers\Api\TeacherController;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Response;
use App\Http\Controllers\Api\ClassesController;
use App\Http\Controllers\Api\SubjectController;
use App\Http\Controllers\Api\NilaiController;
use App\Http\Controllers\Api\BankSoalController;
use App\Http\Controllers\Api\StimulusController;
use App\Http\Controllers\Api\KisiKisiController;
use App\Http\Controllers\Api\PaketSoalController;
use App\Http\Controllers\Api\PerangkatAjarController;
use App\Http\Controllers\Api\ModulAjarController;
use App\Http\Controllers\Api\PetaTemaController;
use App\Http\Controllers\Api\DokumenRujukanController;
use App\Http\Controllers\Api\DokumentasiApiController;
use App\Http\Controllers\Api\PemakaianController;
use App\Http\Controllers\Api\CanvaController;
use App\Http\Controllers\Api\VideoBelajarController;
use App\Http\Controllers\Api\RenderInternalController;
use App\Http\Controllers\Api\UjianController;
use App\Http\Controllers\Api\SesiUjianController;
use App\Http\Controllers\Api\RemedialController;
use App\Http\Controllers\Api\HariLiburController;
use App\Http\Controllers\Api\RenderApiAdminController;
use App\Http\Controllers\Api\V1\RenderController as RenderV1Controller;
use App\Http\Controllers\Api\PeriodeController;
use App\Http\Controllers\Api\KategoriPenilaianController;
use App\Http\Controllers\Api\MBKController;
use App\Http\Controllers\Api\IndikatorController;
use App\Http\Controllers\Api\MateriController;
use App\Http\Controllers\Api\JurnalController;
use App\Http\Controllers\Api\LaporanController;
use App\Http\Controllers\Api\RaporController;
use App\Http\Controllers\Api\WhatsAppController;
use App\Http\Controllers\Api\PresensiController;
use App\Http\Controllers\Api\PembinaanPresensiController;
use App\Http\Controllers\Api\P5Controller;
use App\Http\Controllers\Api\DashboardController;
use App\Http\Controllers\Api\JadwalController;
use App\Http\Controllers\Api\JadwalPaketController;
use App\Http\Controllers\Api\ProgramAjarController;
use App\Http\Controllers\Api\RuanganController;

use App\Http\Controllers\Api\UserController;
use App\Http\Controllers\Api\LogAktivitasController;
use App\Http\Controllers\Api\NotifikasiController;
use App\Http\Controllers\Api\PanduanKerjaController;
use App\Http\Controllers\Api\DiagnostikController;
use App\Http\Controllers\Api\PortalController;
use App\Http\Controllers\Api\FotoSiswaController;

/*
| Peran: admin, kepsek, guru (staf) · siswa, ortu (portal baca).
| Middleware 'role' menolak akun nonaktif; 'role:a,b' membatasi ke peran tertentu.
| Batasan data per guru (mapel diampu, kelas binaan, data milik sendiri) dicek di controller.
*/

Route::post('/login', [AuthController::class, 'login'])->middleware('throttle:login');

// Internal: layanan video-render (kunci bersama RENDER_SECRET, dicek di controller)
Route::prefix('internal/render')->middleware('throttle:120,1')->group(function () {
    Route::get('/berikut', [RenderInternalController::class, 'berikut']);
    Route::post('/suara', [RenderInternalController::class, 'suara']);
    Route::post('/{id}/selesai', [RenderInternalController::class, 'selesai']);
    Route::post('/{id}/gagal', [RenderInternalController::class, 'gagal']);
});

// API render publik v1 untuk aplikasi luar (mis. asisten AI "Muse"): kunci API, bukan login pengguna
Route::prefix('v1')->group(function () {
    // Unduh hasil lewat tautan bertanda tangan (berlaku 7 hari) yang dikembalikan GET /v1/renders/{id}
    Route::get('/renders/{id}/{jenis}', [RenderV1Controller::class, 'berkas'])->whereIn('jenis', ['video', 'poster'])->name('render-api.berkas')->middleware('throttle:60,1');
    Route::middleware(['kunci.api', 'throttle:render-api'])->group(function () {
        Route::get('/templates', [RenderV1Controller::class, 'templates']);
        Route::get('/places', [RenderV1Controller::class, 'places']);
        Route::post('/renders', [RenderV1Controller::class, 'store'])->middleware('throttle:10,1');
        Route::get('/renders/{id}', [RenderV1Controller::class, 'show']);
    });
});

// Callback OAuth Canva (E3): dibuka peramban dari Canva tanpa token login; dikenali lewat state sekali pakai
Route::get('/video-belajar/canva/kembali', [CanvaController::class, 'kembali'])->middleware('throttle:20,1');

// Pemantau uptime (mis. UptimeRobot) dan healthcheck Docker: API hidup dan database terjangkau
Route::get('/health', function () {
    try {
        DB::select('select 1');
        return response()->json(['status' => 'ok']);
    } catch (\Throwable $e) {
        report($e);
        return response()->json(['status' => 'database tidak terjangkau'], 503);
    }
});

// Logo resmi sekolah (publik: dipakai juga di halaman masuk)
Route::get('/logo-sekolah', [SchoolSettingController::class, 'logo']);
// Identitas sekolah untuk beranda publik (nama, kota, alamat, NPSN; tanpa data pribadi)
Route::get('/sekolah-publik', [SchoolSettingController::class, 'publik'])->middleware('throttle:60,1');
// Ikon aplikasi (favicon/PWA): logo sekolah bila diaktifkan admin, selain itu dialihkan ke ikon bawaan
Route::get('/ikon-aplikasi/{nama}', [SchoolSettingController::class, 'ikon'])->where('nama', '[a-z0-9-]+(\.png)?');

// SPMB tanpa login (Fase 26 Tahap B): formulir daring; status/perbaikan/berkas/daftar ulang memakai nomor + kode akses
Route::prefix('spmb')->group(function () {
    Route::get('/info', [SpmbPublikController::class, 'info'])->middleware('throttle:60,1');
    Route::post('/daftar', [SpmbPublikController::class, 'daftar'])->middleware('throttle:spmb-daftar');
    Route::middleware('throttle:spmb')->group(function () {
        Route::post('/status', [SpmbPublikController::class, 'status']);
        Route::put('/data', [SpmbPublikController::class, 'ubah']);
        Route::post('/berkas', [SpmbPublikController::class, 'unggah']);
        Route::post('/ajukan-ulang', [SpmbPublikController::class, 'ajukanUlang']);
        Route::post('/daftar-ulang', [SpmbPublikController::class, 'daftarUlang']);
    });
});
// Verifikasi keaslian surat keluar dari kode yang tercetak di surat (Fase 26 Tahap D)
// Pas foto siswa lewat tautan bertanda tangan (dibuat untuk akun yang boleh melihat siswa itu; dipakai <img> & cetak rapor)
Route::get('/siswa/{id}/foto', [FotoSiswaController::class, 'tampil'])->name('siswa.foto')->middleware(['signed:relative', 'throttle:240,1']);
Route::get('/verifikasi-siswa/{kode}', [\App\Http\Controllers\Api\KartuSiswaController::class, 'verifikasi'])->where('kode', '[A-Za-z0-9]{12}')->middleware('throttle:30,1');
Route::get('/verifikasi-rapor/{kode}', [\App\Http\Controllers\Api\RaporTerbitController::class, 'verifikasi'])->where('kode', '[A-Za-z0-9]{6,16}')->middleware('throttle:30,1');
Route::get('/verifikasi-surat/{kode}', [SuratController::class, 'verifikasi'])->where('kode', '[A-Za-z0-9]{6,16}')->middleware('throttle:30,1');

// Route Proxy untuk Gambar TTD (Anti CORS)
Route::get('/signature/{filename}', function ($filename) {
    $path = storage_path('app/public/signatures/' . basename($filename));

    if (!File::exists($path)) {
        abort(404, 'File tanda tangan tidak ditemukan di server.');
    }

    $file = File::get($path);
    $type = File::mimeType($path);
    $response = Response::make($file, 200);
    $response->header("Content-Type", $type);
    return $response;
});

Route::middleware(['auth:sanctum', 'role'])->group(function () {
    // ===== SEMUA PERAN =====
    Route::get('/me', [AuthController::class, 'me']);
    Route::get('/user', [AuthController::class, 'me']);
    Route::post('/akun/password', [AuthController::class, 'gantiPassword'])->middleware('throttle:10,1');
    Route::post('/logout', [AuthController::class, 'logout']);
    Route::get('/settings', [SchoolSettingController::class, 'show']);
    // Tindakan di browser (cetak, ekspor, chat WA, buka halaman) untuk audit trail
    Route::post('/log-aktivitas/event', [LogAktivitasController::class, 'event'])->middleware('throttle:120,1');
    // Error JavaScript yang menjatuhkan halaman (error boundary web) → storage/logs untuk diagnosis
    Route::post('/log-aktivitas/error-klien', [LogAktivitasController::class, 'errorKlien'])->middleware('throttle:20,1');
    // Pusat notifikasi "Perlu Tindakan" (isi disesuaikan peran di NotifikasiService)
    Route::get('/notifikasi', [NotifikasiController::class, 'index']);
    // Peta kerja guru: progres alur kerja semester (Panduan & Dashboard)
    Route::get('/panduan/kerja', [PanduanKerjaController::class, 'index']);
    // Kalender hari libur selain Minggu: semua akun membaca; admin & kepala sekolah mengelola
    Route::get('/hari-libur', [HariLiburController::class, 'index']);
    Route::middleware('role:admin,kepsek')->group(function () {
        Route::post('/hari-libur', [HariLiburController::class, 'store']);
        Route::get('/pengampu', [\App\Http\Controllers\Api\PengampuController::class, 'index']);
        // Pemetaan rombel siswa yang naik kelas
        Route::get('/pemetaan-rombel', [\App\Http\Controllers\Api\KenaikanController::class, 'pemetaan']);
        Route::put('/pemetaan-rombel', [\App\Http\Controllers\Api\KenaikanController::class, 'simpanPemetaan']);
        Route::post('/hari-libur/tandai-cek', [HariLiburController::class, 'tandaiCek']);
        Route::put('/hari-libur/{id}', [HariLiburController::class, 'update'])->whereNumber('id');
        Route::delete('/hari-libur/{id}', [HariLiburController::class, 'destroy'])->whereNumber('id');
    });
    Route::post('/notifikasi/baca', [NotifikasiController::class, 'baca']);

    // Log Aktivitas: admin & kepsek melihat semua, guru hanya miliknya (dicek di controller)
    Route::middleware('role:admin,kepsek,guru')->prefix('log-aktivitas')->group(function () {
        Route::get('/', [LogAktivitasController::class, 'index']);
        Route::get('/ringkasan', [LogAktivitasController::class, 'ringkasan']);
        Route::get('/opsi', [LogAktivitasController::class, 'opsi']);
        Route::get('/{id}', [LogAktivitasController::class, 'show'])->whereNumber('id');
    });
    // ===== ADMINISTRASI SEKOLAH (Fase 26) =====
    // Tahap A: ringkasan untuk akun yang punya submodul; daftar operator dilihat pengelola, diubah kepala sekolah.
    // Submodul berikutnya memakai ->middleware('administrasi:KODE') (SPMB, KEUANGAN, SURAT, INVENTARIS).
    Route::prefix('administrasi')->group(function () {
        Route::get('/', [AdministrasiController::class, 'ringkasan'])->middleware('administrasi');
        Route::middleware('role:admin,kepsek')->group(function () {
            Route::get('/operator', [AdministrasiController::class, 'operator']);
            Route::get('/kandidat', [AdministrasiController::class, 'kandidat']);
        });
        Route::middleware('role:kepsek')->group(function () {
            Route::post('/operator', [AdministrasiController::class, 'tunjuk']);
            Route::put('/operator/{id}', [AdministrasiController::class, 'ubah'])->whereNumber('id');
            Route::delete('/operator/{id}', [AdministrasiController::class, 'cabut'])->whereNumber('id');
        });
        // Submodul SPMB (Tahap B): operator bertugas SPMB + admin/kepsek; peninjau hanya membaca
        Route::prefix('spmb')->middleware('administrasi:SPMB')->group(function () {
            Route::get('/pilihan', [SpmbController::class, 'pilihan']);
            Route::get('/gelombang', [SpmbController::class, 'gelombang']);
            Route::post('/gelombang', [SpmbController::class, 'simpanGelombang']);
            Route::put('/gelombang/{id}', [SpmbController::class, 'ubahGelombang'])->whereNumber('id');
            Route::delete('/gelombang/{id}', [SpmbController::class, 'hapusGelombang'])->whereNumber('id');
            Route::post('/gelombang/{id}/umumkan', [SpmbController::class, 'umumkan'])->whereNumber('id');
            Route::get('/pendaftar', [SpmbController::class, 'pendaftar']);
            Route::get('/pendaftar/{id}', [SpmbController::class, 'detail'])->whereNumber('id');
            Route::put('/pendaftar/{id}', [SpmbController::class, 'ubah'])->whereNumber('id');
            Route::delete('/pendaftar/{id}', [SpmbController::class, 'hapus'])->whereNumber('id');
            Route::post('/pendaftar/{id}/verifikasi', [SpmbController::class, 'verifikasi'])->whereNumber('id');
            Route::post('/pendaftar/{id}/hasil', [SpmbController::class, 'hasil'])->whereNumber('id');
            Route::post('/pendaftar/{id}/selesaikan', [SpmbController::class, 'selesaikan'])->whereNumber('id');
            Route::post('/pendaftar/{id}/kode-baru', [SpmbController::class, 'kodeBaru'])->whereNumber('id');
            Route::get('/berkas/{id}', [SpmbController::class, 'berkas'])->whereNumber('id');
        });
        // Submodul Keuangan (Tahap C): jenis biaya, beasiswa, tagihan, pembayaran + kuitansi, tunggakan, kas
        Route::prefix('keuangan')->middleware('administrasi:KEUANGAN')->group(function () {
            Route::get('/pilihan', [KeuanganController::class, 'pilihan']);
            Route::get('/ringkasan', [KeuanganController::class, 'ringkasan']);
            Route::post('/jenis-biaya', [KeuanganController::class, 'simpanJenis']);
            Route::put('/jenis-biaya/{id}', [KeuanganController::class, 'ubahJenis'])->whereNumber('id');
            Route::delete('/jenis-biaya/{id}', [KeuanganController::class, 'hapusJenis'])->whereNumber('id');
            Route::get('/beasiswa', [KeuanganController::class, 'beasiswa']);
            Route::post('/beasiswa', [KeuanganController::class, 'simpanBeasiswa']);
            Route::put('/beasiswa/{id}', [KeuanganController::class, 'ubahBeasiswa'])->whereNumber('id');
            Route::delete('/beasiswa/{id}', [KeuanganController::class, 'hapusBeasiswa'])->whereNumber('id');
            Route::get('/tagihan', [KeuanganController::class, 'tagihan']);
            Route::post('/tagihan/buat', [KeuanganController::class, 'buatTagihan']);
            Route::put('/tagihan/{id}', [KeuanganController::class, 'ubahTagihan'])->whereNumber('id');
            Route::post('/tagihan/{id}/batal', [KeuanganController::class, 'batalTagihan'])->whereNumber('id');
            Route::get('/siswa', [KeuanganController::class, 'siswa']);
            Route::get('/siswa/{id}', [KeuanganController::class, 'detailSiswa']);
            Route::get('/pembayaran', [KeuanganController::class, 'pembayaran']);
            Route::post('/pembayaran', [KeuanganController::class, 'simpanPembayaran']);
            Route::get('/pembayaran/{id}', [KeuanganController::class, 'kuitansi'])->whereNumber('id');
            Route::post('/pembayaran/{id}/batal', [KeuanganController::class, 'batalPembayaran'])->whereNumber('id');
            Route::get('/tunggakan', [KeuanganController::class, 'tunggakan']);
            Route::post('/pengingat', [KeuanganController::class, 'pengingat']);
            Route::post('/pengingat/{id}/catat', [KeuanganController::class, 'catatPengingat']);
            Route::get('/kas', [KeuanganController::class, 'kas']);
            Route::post('/kas', [KeuanganController::class, 'simpanKas']);
            Route::delete('/kas/{id}', [KeuanganController::class, 'hapusKas'])->whereNumber('id');
            Route::post('/tujuan-bayar', [KeuanganController::class, 'simpanTujuan']);
            Route::put('/tujuan-bayar/{id}', [KeuanganController::class, 'ubahTujuan'])->whereNumber('id');
            Route::delete('/tujuan-bayar/{id}', [KeuanganController::class, 'hapusTujuan'])->whereNumber('id');
        });
        // Submodul Surat & Arsip (Tahap D)
        Route::prefix('surat')->middleware('administrasi:SURAT')->group(function () {
            Route::get('/pilihan', [SuratController::class, 'pilihan']);
            Route::put('/pengaturan', [SuratController::class, 'simpanPengaturan']);
            Route::post('/templat', [SuratController::class, 'simpanTemplat']);
            Route::post('/templat/contoh', [SuratController::class, 'contohTemplat']);
            Route::put('/templat/{id}', [SuratController::class, 'ubahTemplat'])->whereNumber('id');
            Route::delete('/templat/{id}', [SuratController::class, 'hapusTemplat'])->whereNumber('id');
            Route::get('/templat/{id}/isi', [SuratController::class, 'isiTemplat'])->whereNumber('id');
            Route::get('/keluar', [SuratController::class, 'keluar']);
            Route::post('/keluar', [SuratController::class, 'simpanKeluar']);
            Route::get('/keluar/{id}', [SuratController::class, 'detailKeluar'])->whereNumber('id');
            Route::put('/keluar/{id}', [SuratController::class, 'ubahKeluar'])->whereNumber('id');
            Route::delete('/keluar/{id}', [SuratController::class, 'hapusKeluar'])->whereNumber('id');
            Route::post('/keluar/{id}/ajukan', [SuratController::class, 'ajukanKeluar'])->whereNumber('id');
            Route::post('/keluar/{id}/terbitkan', [SuratController::class, 'terbitkan'])->whereNumber('id');
            Route::post('/keluar/{id}/tandatangani', [SuratController::class, 'tandatangani'])->whereNumber('id');
            Route::post('/keluar/{id}/batal', [SuratController::class, 'batalKeluar'])->whereNumber('id');
            Route::get('/masuk', [SuratController::class, 'masuk']);
            Route::post('/masuk', [SuratController::class, 'simpanMasuk']);
            Route::post('/masuk/{id}', [SuratController::class, 'ubahMasuk'])->whereNumber('id');
            Route::delete('/masuk/{id}', [SuratController::class, 'hapusMasuk'])->whereNumber('id');
            Route::get('/masuk/{id}/berkas', [SuratController::class, 'berkasMasuk'])->whereNumber('id');
            Route::post('/masuk/{id}/disposisi', [SuratController::class, 'disposisi'])->whereNumber('id');
            Route::post('/masuk/{id}/selesai', [SuratController::class, 'selesaiMasuk'])->whereNumber('id');
            Route::get('/arsip', [SuratController::class, 'arsip']);
            Route::post('/arsip', [SuratController::class, 'simpanArsip']);
            Route::post('/arsip/{id}', [SuratController::class, 'ubahArsip'])->whereNumber('id');
            Route::delete('/arsip/{id}', [SuratController::class, 'hapusArsip'])->whereNumber('id');
            Route::get('/arsip/{id}/berkas', [SuratController::class, 'berkasArsip'])->whereNumber('id');
        });
        // Submodul Inventaris (Tahap E)
        Route::prefix('inventaris')->middleware('administrasi:INVENTARIS')->group(function () {
            Route::get('/pilihan', [InventarisController::class, 'pilihan']);
            Route::get('/ringkasan', [InventarisController::class, 'ringkasan']);
            Route::get('/barang', [InventarisController::class, 'barang']);
            Route::post('/barang', [InventarisController::class, 'simpanBarang']);
            Route::get('/barang/{id}', [InventarisController::class, 'detailBarang'])->whereNumber('id');
            Route::put('/barang/{id}', [InventarisController::class, 'ubahBarang'])->whereNumber('id');
            Route::post('/barang/{id}/hapus', [InventarisController::class, 'hapusBarang'])->whereNumber('id');
            Route::post('/barang/{id}/periksa', [InventarisController::class, 'periksa'])->whereNumber('id');
            Route::get('/peminjaman', [InventarisController::class, 'peminjaman']);
            Route::post('/peminjaman', [InventarisController::class, 'pinjam']);
            Route::post('/peminjaman/{id}/kembali', [InventarisController::class, 'kembali'])->whereNumber('id');
            Route::get('/stok', [InventarisController::class, 'stok']);
            Route::post('/stok', [InventarisController::class, 'simpanStok']);
            Route::get('/stok/{id}', [InventarisController::class, 'detailStok'])->whereNumber('id');
            Route::put('/stok/{id}', [InventarisController::class, 'ubahStok'])->whereNumber('id');
            Route::post('/stok/{id}/mutasi', [InventarisController::class, 'mutasi'])->whereNumber('id');
            Route::get('/pengadaan', [InventarisController::class, 'pengadaan']);
            Route::post('/pengadaan', [InventarisController::class, 'simpanPengadaan']);
            Route::put('/pengadaan/{id}', [InventarisController::class, 'ubahPengadaan'])->whereNumber('id');
            Route::delete('/pengadaan/{id}', [InventarisController::class, 'hapusPengadaan'])->whereNumber('id');
            Route::post('/pengadaan/{id}/putuskan', [InventarisController::class, 'putuskan'])->whereNumber('id');
            Route::post('/pengadaan/{id}/selesaikan', [InventarisController::class, 'selesaikan'])->whereNumber('id');
        });
    });
    // Disposisi surat untuk penerimanya (semua staf, tanpa perlu submodul Surat)
    Route::middleware('role:admin,kepsek,guru,operator')->prefix('disposisi')->group(function () {
        Route::get('/', [SuratController::class, 'disposisiSaya']);
        Route::post('/{id}/baca', [SuratController::class, 'bacaDisposisi'])->whereNumber('id');
        Route::post('/{id}/selesai', [SuratController::class, 'selesaiDisposisi'])->whereNumber('id');
        Route::get('/{id}/berkas', [SuratController::class, 'berkasDisposisi'])->whereNumber('id');
    });
    // Dasbor pemakaian (masa pakai nyata): admin & kepala sekolah
    Route::get('/pemakaian', [PemakaianController::class, 'index'])->middleware('role:admin,kepsek');

    // ===== PORTAL SISWA & ORANG TUA =====
    Route::middleware('role:siswa,ortu')->prefix('portal')->group(function () {
        Route::get('/video', [VideoBelajarController::class, 'portal']);
        Route::get('/tagihan', [KeuanganController::class, 'portal']);
    });
    // Data portal juga dibuka sebagai "dashboard pribadi siswa" untuk admin, kepsek, dan wali kelas (lihat User::siswaDashboard)
    // Rekam jejak (buku induk) siswa lintas semester: pengelola, wali kelas sekarang, siswa/orang tua sendiri
    Route::middleware('role:siswa,ortu,admin,kepsek,guru')->prefix('siswa/{id}/rekam-jejak')->group(function () {
        Route::get('/', [\App\Http\Controllers\Api\RekamJejakController::class, 'show']);
        Route::get('/nilai', [\App\Http\Controllers\Api\RekamJejakController::class, 'nilai']);
        Route::get('/jurnal', [\App\Http\Controllers\Api\RekamJejakController::class, 'jurnal']);
    });
    Route::middleware('role:siswa,ortu,admin,kepsek,guru')->prefix('portal')->group(function () {
        Route::get('/anak', [PortalController::class, 'anak']);
        Route::get('/rapor', [PortalController::class, 'rapor']);
        Route::post('/rapor/terima', [\App\Http\Controllers\Api\RaporTerbitController::class, 'terima']);
        Route::get('/pekan', [PortalController::class, 'pekan']);
    });
    // Pesan wali kelas - orang tua/siswa (akses per utas dicek di PesanService)
    Route::middleware('role:siswa,ortu,admin,kepsek,guru')->prefix('pesan')->group(function () {
        Route::get('/', [\App\Http\Controllers\Api\PesanController::class, 'utas']);
        Route::get('/{id}', [\App\Http\Controllers\Api\PesanController::class, 'show']);
        Route::post('/{id}', [\App\Http\Controllers\Api\PesanController::class, 'kirim'])->middleware('throttle:30,1');
    });

    // ===== TES ONLINE SISWA (Fase 16 Tahap C) =====
    Route::middleware('role:siswa')->prefix('ujian')->group(function () {
        Route::get('/', [UjianController::class, 'index']);
        Route::get('/{id}', [UjianController::class, 'show']);
        Route::post('/{id}/mulai', [UjianController::class, 'mulai']);
        Route::put('/{id}/jawaban', [UjianController::class, 'simpan']);
        Route::post('/{id}/rekaman', [UjianController::class, 'rekam'])->middleware('throttle:30,1');
        Route::post('/{id}/selesai', [UjianController::class, 'selesai']);
    });

    // ===== KHUSUS ADMIN: master data inti, pengaturan sistem, akun pengguna =====
    Route::middleware('role:admin')->group(function () {
        Route::post('/settings', [SchoolSettingController::class, 'update']);
        // API render v1 (aplikasi luar): kunci API, riwayat job, tabel tempat peta terverifikasi
        Route::prefix('render-api')->group(function () {
            Route::get('/', [RenderApiAdminController::class, 'ringkasan']);
            Route::post('/klien', [RenderApiAdminController::class, 'buatKlien']);
            Route::patch('/klien/{id}', [RenderApiAdminController::class, 'ubahKlien'])->whereNumber('id');
            Route::delete('/klien/{id}', [RenderApiAdminController::class, 'hapusKlien'])->whereNumber('id');
            Route::delete('/job/{id}', [RenderApiAdminController::class, 'hapusJob']);
            Route::get('/tempat', [RenderApiAdminController::class, 'tempat']);
            Route::post('/tempat', [RenderApiAdminController::class, 'simpanTempat']);
            Route::put('/tempat/{id}', [RenderApiAdminController::class, 'simpanTempat'])->whereNumber('id');
            Route::delete('/tempat/{id}', [RenderApiAdminController::class, 'hapusTempat'])->whereNumber('id');
        });
        // Dokumentasi API (dibaca dari router; juga OpenAPI 3 untuk Postman/Insomnia)
        Route::get('/dokumentasi', [DokumentasiApiController::class, 'index']);
        Route::get('/dokumentasi/openapi.json', [DokumentasiApiController::class, 'openapi']);

        Route::apiResource('/students', StudentController::class)->only(['store', 'update', 'destroy']);
        Route::post('/keluarga/{jenis}', [KeluargaController::class, 'store'])->whereIn('jenis', ['ortu', 'wali']);
        Route::put('/keluarga/{jenis}/{id}', [KeluargaController::class, 'update'])->whereIn('jenis', ['ortu', 'wali']);
        Route::delete('/keluarga/{jenis}/{id}', [KeluargaController::class, 'destroy'])->whereIn('jenis', ['ortu', 'wali']);
        Route::apiResource('/teachers', TeacherController::class)->only(['store', 'update', 'destroy']);
        Route::apiResource('/classes', ClassesController::class)->only(['store', 'update', 'destroy']);
        Route::put('/classes/{id}/aktif-semester', [ClassesController::class, 'aktifSemester']);
        Route::apiResource('/subjects', SubjectController::class)->only(['store', 'update', 'destroy']);
        Route::apiResource('/periodes', PeriodeController::class)->only(['store', 'update', 'destroy']);
        // Tutup Semester & kunci semester, pembagian mengajar (admin)
        Route::put('/periodes/{id}/kunci', [\App\Http\Controllers\Api\TutupSemesterController::class, 'kunci']);
        Route::get('/semester/tutup', [\App\Http\Controllers\Api\TutupSemesterController::class, 'periksa']);
        Route::post('/semester/tutup', [\App\Http\Controllers\Api\TutupSemesterController::class, 'jalankan']);
        Route::put('/pengampu', [\App\Http\Controllers\Api\PengampuController::class, 'simpan']);
        Route::apiResource('/kategori-penilaian', KategoriPenilaianController::class)->only(['store', 'update', 'destroy']);
        Route::apiResource('/mbk', MBKController::class)->only(['update', 'destroy']);
        Route::delete('/indikator/{indikator}', [IndikatorController::class, 'destroy']);
        Route::delete('/materi/{materi}', [MateriController::class, 'destroy']);

        Route::get('/users', [UserController::class, 'index']);
        Route::post('/users', [UserController::class, 'store']);
        Route::post('/users/generate', [UserController::class, 'generate']);
        Route::put('/users/{id}', [UserController::class, 'update']);
        Route::delete('/users/{id}', [UserController::class, 'destroy']);
        Route::post('/users/{id}/reset-password', [UserController::class, 'resetPassword']);
    });

    // ===== STAF (ADMIN, KEPSEK, GURU) =====
    Route::middleware('role:admin,kepsek,guru')->group(function () {
        // Kenaikan kelas: wali kelas mengisi, kepala sekolah mengesahkan (dicek di controller)
        Route::get('/kenaikan', [\App\Http\Controllers\Api\KenaikanController::class, 'index']);
        Route::put('/kenaikan', [\App\Http\Controllers\Api\KenaikanController::class, 'simpan']);
        Route::post('/kenaikan/sahkan', [\App\Http\Controllers\Api\KenaikanController::class, 'sahkan']);
        // Master data: baca untuk semua staf (dropdown & halaman master kepsek)
        Route::get('/students/master-data', [StudentController::class, 'getMasterData']);
        // Pas foto siswa: admin, kepsek, atau wali kelasnya (dicek di controller)
        Route::prefix('siswa/{id}/foto')->controller(FotoSiswaController::class)->group(function () {
            Route::post('/', 'simpan');
            Route::delete('/', 'hapus');
            Route::get('/asli', 'asli');
            Route::post('/ai', 'ai')->middleware('throttle:10,1');
        });
        // Kartu pelajar berfoto & ber-QR (admin, kepsek, wali kelas)
        Route::get('/kartu-pelajar', [\App\Http\Controllers\Api\KartuSiswaController::class, 'index']);
        // Pencarian global (Ctrl+K)
        Route::get('/cari', [\App\Http\Controllers\Api\CariController::class, 'index'])->middleware('throttle:120,1');
        // Mode "Hari ini" untuk guru di HP: sesi, presensi kelas binaan, pengingat
        Route::get('/hari-ini', [\App\Http\Controllers\Api\HariIniController::class, 'index']);
        // Analitik lintas semester: pengelola & guru (dibatasi mapel diampu, dicek di controller)
        Route::get('/analitik/lintas-semester', [\App\Http\Controllers\Api\AnalitikController::class, 'index']);
        Route::post('/analitik/saran-tp', [\App\Http\Controllers\Api\AnalitikController::class, 'saranTp'])->middleware('throttle:10,1');
        // Peringatan dini siswa: pengelola & wali kelas (dicek di controller)
        Route::prefix('peringatan-dini')->controller(\App\Http\Controllers\Api\PeringatanDiniController::class)->group(function () {
            Route::get('/', 'index');
            Route::get('/{id}/riwayat', 'riwayat');
            Route::post('/{id}/tindak', 'tindak');
        });
        Route::apiResource('/students', StudentController::class)->only(['index']);
        Route::apiResource('/teachers', TeacherController::class)->only(['index']);
        Route::apiResource('/classes', ClassesController::class)->only(['index']);
        Route::apiResource('/subjects', SubjectController::class)->only(['index']);
        Route::apiResource('/periodes', PeriodeController::class)->only(['index']);
        Route::get('/pengampu/saya', [\App\Http\Controllers\Api\PengampuController::class, 'saya']);
        Route::apiResource('/kategori-penilaian', KategoriPenilaianController::class)->only(['index']);
        Route::get('/mbk', [MBKController::class, 'index']);
        Route::get('/materi/by-context', [MateriController::class, 'byContext']);
        Route::get('/materi', [MateriController::class, 'index']);
        Route::get('/indikator', [IndikatorController::class, 'index']);

        // Nilai: guru dibatasi ke mapel yang diampu (dicek di controller)
        Route::prefix('nilai')->group(function () {
            Route::get('/', [NilaiController::class, 'index']);
            Route::get('/filters', [NilaiController::class, 'getFilters']);
            Route::get('/materi', [NilaiController::class, 'getMateriByContext']);
            Route::get('/students', [NilaiController::class, 'getStudentsWithNilai']);
            Route::get('/remedial', [NilaiController::class, 'getRemedial']);
            Route::get('/ringkasan', [NilaiController::class, 'ringkasan']);
            Route::post('/batch', [NilaiController::class, 'saveBatch']);
            Route::delete('/{id}', [NilaiController::class, 'destroy']);
        });

        // Asesmen diagnostik awal semester: kognitif (lihat) & non-kognitif (diisi wali kelas/pengelola, dicek di controller)
        Route::prefix('diagnostik')->group(function () {
            Route::get('/kognitif', [DiagnostikController::class, 'kognitif']);
            Route::get('/nonkognitif', [DiagnostikController::class, 'nonkognitif']);
            Route::put('/nonkognitif', [DiagnostikController::class, 'simpanNonkognitif']);
        });

        // Rencana tindak lanjut remedial: hak akses mengikuti mapel nilai (dicek di controller)
        Route::prefix('remedial')->group(function () {
            Route::post('/', [RemedialController::class, 'store']);
            Route::post('/notifikasi', [RemedialController::class, 'notifikasi']);
            Route::put('/{id}', [RemedialController::class, 'update']);
            Route::delete('/{id}', [RemedialController::class, 'destroy']);
            Route::post('/{id}/bukti', [RemedialController::class, 'simpanBukti']);
            Route::delete('/{id}/bukti', [RemedialController::class, 'hapusBukti']);
        });

        // Foto/video yang disisipkan di editor catatan (pembinaan, catatan progres)
        Route::post('/lampiran', [\App\Http\Controllers\Api\LampiranController::class, 'store']);

        // Jurnal: semua kelas; guru hanya mengubah/menghapus catatan miliknya
        Route::prefix('jurnal')->group(function () {
            Route::get('/', [JurnalController::class, 'index']);
            Route::post('/analyze', [JurnalController::class, 'analyze']);
            Route::post('/store', [JurnalController::class, 'store']);
            Route::post('/import', [JurnalController::class, 'importBatch']);
            Route::put('/{id}', [JurnalController::class, 'update']);
            Route::patch('/{id}/sensitif', [JurnalController::class, 'tandaiSensitif']);
            Route::get('/{id}/riwayat', [JurnalController::class, 'riwayat']);
            Route::delete('/{id}', [JurnalController::class, 'destroy']);
        });

        Route::prefix('presensi')->group(function () {
            Route::get('/', [PresensiController::class, 'index']);
            Route::post('/batch', [PresensiController::class, 'saveBatch']);
            Route::delete('/tanggal', [PresensiController::class, 'hapusTanggal']);
            // Presensi per mapel oleh guru mapel (rapor tetap memakai presensi harian)
            Route::get('/mapel', [PresensiController::class, 'mapel']);
            Route::post('/mapel', [PresensiController::class, 'simpanMapel']);
            // Pembinaan siswa yang kehadirannya perlu perhatian
            Route::get('/pembinaan', [PembinaanPresensiController::class, 'index']);
            Route::get('/pembinaan/konteks', [PembinaanPresensiController::class, 'konteks']);
            Route::post('/pembinaan/ai', [PembinaanPresensiController::class, 'ai']);
            Route::get('/pembinaan/{id}', [PembinaanPresensiController::class, 'detail']);
            Route::post('/pembinaan/{id}/progres', [PembinaanPresensiController::class, 'progres']);
            Route::post('/pembinaan', [PembinaanPresensiController::class, 'store']);
            Route::put('/pembinaan/{id}', [PembinaanPresensiController::class, 'update']);
            Route::patch('/pembinaan/{id}/status', [PembinaanPresensiController::class, 'status']);
            Route::post('/pembinaan/{id}/jurnal', [PembinaanPresensiController::class, 'tautJurnal']);
            Route::delete('/pembinaan/{id}', [PembinaanPresensiController::class, 'destroy']);
        });

        // P5 & rapor: guru hanya kelas binaan (wali kelas)
        Route::prefix('p5')->group(function () {
            Route::get('/', [P5Controller::class, 'index']);
            Route::post('/proyek', [P5Controller::class, 'storeProyek']);
            Route::put('/proyek/{id}', [P5Controller::class, 'updateProyek']);
            Route::delete('/proyek/{id}', [P5Controller::class, 'destroyProyek']);
            Route::post('/catatan', [P5Controller::class, 'saveCatatan']);
            Route::post('/catatan/generate', [P5Controller::class, 'generateCatatan']);
            Route::post('/hitung', [P5Controller::class, 'hitung']);
            Route::put('/nilai/{id}', [P5Controller::class, 'updateNilai']);
        });
        Route::prefix('rapor')->group(function () {
            Route::get('/data', [RaporController::class, 'data']);
            Route::post('/catatan-wali', [RaporController::class, 'simpanCatatanWali']);
            Route::post('/catatan-wali/generate', [RaporController::class, 'generateCatatanWali']);
            // Rapor resmi: terbit (kode QR + tanda tangan elektronik wali), pengesahan kepala sekolah
            Route::get('/terbit', [\App\Http\Controllers\Api\RaporTerbitController::class, 'index']);
            Route::post('/terbit', [\App\Http\Controllers\Api\RaporTerbitController::class, 'terbitkan']);
            Route::post('/terbit/sahkan', [\App\Http\Controllers\Api\RaporTerbitController::class, 'sahkan']);
        });

        // Jadwal: guru membuat & mengubah jadwal miliknya sendiri
        Route::prefix('jadwal')->group(function () {
            Route::get('/', [JadwalController::class, 'index']);
            Route::get('/referensi', [JadwalController::class, 'referensi']);
            Route::get('/perangkat', [JadwalController::class, 'perangkat']);
            Route::get('/rencana-hari', [JadwalController::class, 'rencanaHari']);
            // Paket jadwal dari Promes: pola jam mingguan + ATP -> seluruh sesi semester, ditinjau lalu diaktifkan
            Route::get('/paket/referensi', [JadwalPaketController::class, 'referensi']);
            Route::post('/paket/pratinjau', [JadwalPaketController::class, 'pratinjau']);
            Route::post('/paket/aktifkan', [JadwalPaketController::class, 'aktifkan']);
            Route::get('/{id}/rencana', [JadwalController::class, 'rencana']);
            Route::get('/{id}', [JadwalController::class, 'show']);
            Route::post('/', [JadwalController::class, 'store']);
            Route::put('/{id}', [JadwalController::class, 'update']);
            Route::patch('/{id}/geser', [JadwalController::class, 'geser']);
            Route::patch('/{id}/status', [JadwalController::class, 'status']);
            Route::delete('/{id}', [JadwalController::class, 'destroy']);
        });
        Route::get('/ruangan', [RuanganController::class, 'index']);

        // Bank soal & kisi-kisi (Fase 16): guru untuk mapel yang diampu, persetujuan oleh kepala sekolah (dicek di controller)
        Route::prefix('bank-soal')->group(function () {
            Route::get('/', [BankSoalController::class, 'index']);
            Route::get('/referensi', [BankSoalController::class, 'referensi']);
            Route::post('/', [BankSoalController::class, 'store']);
            Route::post('/ajukan', [BankSoalController::class, 'ajukan']);
            Route::post('/setujui', [BankSoalController::class, 'setujui']);
            Route::post('/revisi', [BankSoalController::class, 'revisi']);
            Route::post('/ai/draf', [BankSoalController::class, 'drafAI']);
            Route::get('/cakupan', [BankSoalController::class, 'cakupan']);
            Route::get('/kembar', [BankSoalController::class, 'kembar']);
            Route::post('/{id}/varian', [BankSoalController::class, 'varianAI'])->middleware('throttle:20,1');
            Route::post('/ai/dari-riset', [BankSoalController::class, 'drafDariRiset'])->middleware('throttle:10,1');
            Route::post('/impor', [BankSoalController::class, 'impor']);
            Route::post('/gambar', [BankSoalController::class, 'unggahGambar']);
            Route::post('/ai/gambar', [BankSoalController::class, 'gambarAI'])->middleware('throttle:20,1');
            Route::get('/{id}', [BankSoalController::class, 'show']);
            Route::put('/{id}', [BankSoalController::class, 'update']);
            Route::delete('/{id}', [BankSoalController::class, 'destroy']);
            Route::post('/{id}/tarik', [BankSoalController::class, 'tarik']);
        });
        // Stimulus AKM bersama (CBT Tahap B): satu bacaan/tabel untuk beberapa soal
        Route::apiResource('/stimulus', StimulusController::class)->parameters(['stimulus' => 'id']);
        Route::apiResource('/kisi-kisi', KisiKisiController::class)->parameters(['kisi-kisi' => 'id']);
        // Paket soal (Fase 16 Tahap B): naskah, koreksi, kirim nilai ke Input Nilai, analisis butir
        Route::prefix('paket-soal')->group(function () {
            Route::get('/', [PaketSoalController::class, 'index']);
            Route::post('/', [PaketSoalController::class, 'store']);
            Route::get('/{id}', [PaketSoalController::class, 'show']);
            Route::put('/{id}', [PaketSoalController::class, 'update']);
            Route::delete('/{id}', [PaketSoalController::class, 'destroy']);
            Route::post('/{id}/butir', [PaketSoalController::class, 'tambahButir']);
            Route::put('/{id}/butir', [PaketSoalController::class, 'aturButir']);
            Route::delete('/{id}/butir/{idButir}', [PaketSoalController::class, 'hapusButir'])->whereNumber('idButir');
            Route::post('/{id}/isi-kisi', [PaketSoalController::class, 'isiDariKisi']);
            Route::get('/{id}/jawaban', [PaketSoalController::class, 'jawaban']);
            Route::put('/{id}/jawaban', [PaketSoalController::class, 'simpanJawaban']);
            Route::delete('/{id}/jawaban/{idSiswa}', [PaketSoalController::class, 'hapusJawaban']);
            Route::post('/{id}/jawaban/{idSiswa}/foto', [PaketSoalController::class, 'unggahFoto']);
            Route::delete('/{id}/jawaban/{idSiswa}/foto', [PaketSoalController::class, 'hapusFoto']);
            Route::post('/{id}/jawaban/{idSiswa}/baca', [PaketSoalController::class, 'bacaFoto']);
            Route::post('/{id}/jawaban/{idSiswa}/nilai-ai', [PaketSoalController::class, 'nilaiUraianAI']);
            Route::post('/{id}/kirim-nilai', [PaketSoalController::class, 'kirimNilai']);
            Route::get('/{id}/analisis', [PaketSoalController::class, 'analisis']);
            Route::put('/{id}/online', [PaketSoalController::class, 'aturOnline']);
            Route::get('/{id}/pantau', [PaketSoalController::class, 'pantau']);
            Route::post('/{id}/jawaban/{idSiswa}/akhiri', [PaketSoalController::class, 'akhiriSesi']);
        });
        // Sesi ujian CBT (Tahap A): satu paket untuk beberapa kelas, token sesi, pantau pengawas, kartu peserta (hak akses dicek di controller)
        Route::prefix('sesi-ujian')->group(function () {
            Route::get('/', [SesiUjianController::class, 'index']);
            Route::get('/referensi', [SesiUjianController::class, 'referensi']);
            Route::post('/', [SesiUjianController::class, 'store']);
            Route::get('/{id}', [SesiUjianController::class, 'show']);
            Route::put('/{id}', [SesiUjianController::class, 'update']);
            Route::delete('/{id}', [SesiUjianController::class, 'destroy']);
            Route::get('/{id}/pantau', [SesiUjianController::class, 'pantau']);
            Route::get('/{id}/kartu', [SesiUjianController::class, 'kartu']);
            Route::get('/{id}/siswa/{idSiswa}/log', [SesiUjianController::class, 'log']);
            Route::post('/{id}/siswa/{idSiswa}/izinkan', [SesiUjianController::class, 'izinkan']);
            Route::post('/{id}/siswa/{idSiswa}/akhiri', [SesiUjianController::class, 'akhiri']);
        });
        // Video Belajar (Fase 19): pustaka video, tautan ke modul ajar & jadwal, persetujuan kepala sekolah (dicek di controller)
        Route::prefix('video-belajar')->group(function () {
            Route::get('/', [VideoBelajarController::class, 'index']);
            Route::post('/', [VideoBelajarController::class, 'store'])->middleware('throttle:20,1');
            Route::get('/tautan', [VideoBelajarController::class, 'tautan']);
            Route::get('/suara', [VideoBelajarController::class, 'suara']);
            Route::post('/templat', [VideoBelajarController::class, 'dariTemplat'])->middleware('throttle:20,1');
            Route::get('/studio', [VideoBelajarController::class, 'studio']);
            Route::put('/studio', [VideoBelajarController::class, 'aturStudio']);
            Route::post('/aset', [VideoBelajarController::class, 'aset'])->middleware('throttle:60,1');
            Route::get('/aset', [VideoBelajarController::class, 'daftarAset']);
            Route::patch('/aset/{id}', [VideoBelajarController::class, 'ubahAset'])->whereNumber('id');
            // Impor desain Canva (E3)
            Route::get('/canva', [CanvaController::class, 'status']);
            Route::post('/canva/sambung', [CanvaController::class, 'sambung'])->middleware('throttle:10,1');
            Route::delete('/canva/sambung', [CanvaController::class, 'putuskan']);
            Route::get('/canva/desain', [CanvaController::class, 'desain'])->middleware('throttle:60,1');
            Route::post('/canva/impor', [CanvaController::class, 'impor'])->middleware('throttle:15,1');
            Route::get('/templat-studio', [VideoBelajarController::class, 'daftarTemplatStudio']);
            Route::post('/papan-cerita', [VideoBelajarController::class, 'papanCerita'])->middleware('throttle:20,1');
            Route::post('/terapkan-gaya', [VideoBelajarController::class, 'terapkanGaya'])->middleware('throttle:60,1');
            Route::post('/templat-studio', [VideoBelajarController::class, 'simpanTemplatStudio']);
            Route::put('/templat-studio/{id}', [VideoBelajarController::class, 'simpanTemplatStudio']);
            Route::delete('/templat-studio/{id}', [VideoBelajarController::class, 'hapusTemplatStudio']);
            Route::post('/{id}/render', [VideoBelajarController::class, 'renderUlang'])->middleware('throttle:20,1');
            Route::post('/tautan', [VideoBelajarController::class, 'tautkan']);
            Route::delete('/tautan/{id}', [VideoBelajarController::class, 'lepas'])->whereNumber('id');
            Route::get('/{id}', [VideoBelajarController::class, 'show']);
            Route::post('/{id}', [VideoBelajarController::class, 'update']); // multipart (berkas pengganti)
            Route::delete('/{id}', [VideoBelajarController::class, 'destroy']);
            Route::post('/{id}/ajukan', [VideoBelajarController::class, 'ajukan']);
            Route::post('/{id}/setujui', [VideoBelajarController::class, 'setujui']);
            Route::post('/{id}/revisi', [VideoBelajarController::class, 'revisi']);
        });
        // Pustaka dokumen resmi untuk AI: admin & kepsek langsung aktif; guru (bila diizinkan admin) disetujui kepala sekolah
        Route::prefix('dokumen-rujukan')->group(function () {
            Route::get('/', [DokumenRujukanController::class, 'index']);
            Route::post('/', [DokumenRujukanController::class, 'store'])->middleware('throttle:30,1');
            Route::put('/pengaturan', [DokumenRujukanController::class, 'pengaturan']);
            Route::post('/cari', [DokumenRujukanController::class, 'cari']);
            Route::get('/{id}', [DokumenRujukanController::class, 'show']);
            Route::get('/{id}/unduh', [DokumenRujukanController::class, 'unduh']);
            Route::put('/{id}', [DokumenRujukanController::class, 'update']);
            Route::post('/{id}/perbarui', [DokumenRujukanController::class, 'perbarui'])->middleware('throttle:30,1');
            Route::post('/{id}/setujui', [DokumenRujukanController::class, 'setujui']);
            Route::post('/{id}/tolak', [DokumenRujukanController::class, 'tolak']);
            Route::post('/{id}/aktifkan', [DokumenRujukanController::class, 'aktifkan']);
            Route::post('/{id}/baca-ulang', [DokumenRujukanController::class, 'bacaUlang']);
            Route::post('/{id}/analisis', [DokumenRujukanController::class, 'analisis'])->middleware('throttle:20,1');
            // Notebook AI (Fase 23): riset per dokumen & tanya-jawab dengan rujukan bagian
            Route::get('/{id}/riset', [\App\Http\Controllers\Api\RisetDokumenController::class, 'index']);
            Route::post('/{id}/riset', [\App\Http\Controllers\Api\RisetDokumenController::class, 'riset'])->middleware('throttle:10,1');
            Route::post('/{id}/tanya', [\App\Http\Controllers\Api\RisetDokumenController::class, 'tanya'])->middleware('throttle:20,1');
            Route::delete('/{id}/riset/{idRiset}', [\App\Http\Controllers\Api\RisetDokumenController::class, 'hapus'])->whereNumber('idRiset');
            Route::delete('/{id}', [DokumenRujukanController::class, 'destroy']);
        });
        // Notebook riset beberapa dokumen (Fase 23 Tahap B): pribadi per akun; catatan menjadi bahan Jadikan…
        Route::prefix('notebook')->controller(\App\Http\Controllers\Api\NotebookController::class)->group(function () {
            Route::get('/', 'index');
            Route::post('/', 'store');
            Route::get('/catatan', 'semuaCatatan');
            Route::get('/{id}', 'show')->whereNumber('id');
            Route::put('/{id}', 'update')->whereNumber('id');
            Route::delete('/{id}', 'destroy')->whereNumber('id');
            Route::post('/{id}/tanya', 'tanya')->whereNumber('id')->middleware('throttle:20,1');
            Route::post('/{id}/catatan', 'simpanCatatan')->whereNumber('id');
            Route::put('/{id}/catatan/{idCatatan}', 'simpanCatatan')->whereNumber(['id', 'idCatatan']);
            Route::delete('/{id}/catatan/{idCatatan}', 'hapusCatatan')->whereNumber(['id', 'idCatatan']);
        });
        // Prota & Promes (Fase 20): rencana dari ATP, realisasi dari jadwal
        Route::prefix('program-ajar')->group(function () {
            Route::get('/referensi', [ProgramAjarController::class, 'referensi']);
            Route::get('/promes', [ProgramAjarController::class, 'promes']);
            Route::get('/prota', [ProgramAjarController::class, 'prota']);
            Route::put('/kalender/{id}', [ProgramAjarController::class, 'simpanKalender'])->middleware('role:admin,kepsek');
        });
        // Perangkat ajar (Fase 17): CP & ATP; guru untuk mapel diampu, persetujuan ATP oleh kepala sekolah (dicek di controller)
        Route::prefix('perangkat-ajar')->group(function () {
            Route::get('/referensi', [PerangkatAjarController::class, 'referensi']);
            Route::get('/cp', [PerangkatAjarController::class, 'daftarCp']);
            Route::post('/cp', [PerangkatAjarController::class, 'simpanCp']);
            Route::post('/cp/pecah', [PerangkatAjarController::class, 'pecahCp']);
            Route::post('/cp/susun', [PerangkatAjarController::class, 'susunCp']);
            Route::get('/cp/dokumen/{id}/bagian', [PerangkatAjarController::class, 'bagianCpDokumen']);
            Route::post('/cp/dari-dokumen', [PerangkatAjarController::class, 'cpDariDokumen'])->middleware('throttle:10,1');
            Route::post('/cp/banyak', [PerangkatAjarController::class, 'simpanBanyakCp']);
            Route::put('/cp/{id}', [PerangkatAjarController::class, 'simpanCp']);
            Route::delete('/cp/{id}', [PerangkatAjarController::class, 'hapusCp']);
            Route::get('/atp', [PerangkatAjarController::class, 'daftarAtp']);
            Route::post('/atp', [PerangkatAjarController::class, 'simpanAtp']);
            Route::get('/atp/{id}', [PerangkatAjarController::class, 'lihatAtp']);
            Route::put('/atp/{id}', [PerangkatAjarController::class, 'simpanAtp']);
            Route::delete('/atp/{id}', [PerangkatAjarController::class, 'hapusAtp']);
            Route::post('/atp/{id}/ai', [PerangkatAjarController::class, 'susunAtpAI']);
            Route::post('/atp/{id}/ajukan', [PerangkatAjarController::class, 'ajukanAtp']);
            Route::post('/atp/{id}/tarik', [PerangkatAjarController::class, 'tarikAtp']);
            Route::post('/atp/{id}/setujui', [PerangkatAjarController::class, 'setujuiAtp']);
            Route::post('/atp/{id}/revisi', [PerangkatAjarController::class, 'revisiAtp']);
            Route::get('/modul', [ModulAjarController::class, 'index']);
            Route::post('/modul', [ModulAjarController::class, 'simpan']);
            Route::get('/modul/{id}', [ModulAjarController::class, 'show']);
            Route::put('/modul/{id}', [ModulAjarController::class, 'simpan']);
            Route::delete('/modul/{id}', [ModulAjarController::class, 'destroy']);
            Route::get('/modul/{id}/paket', [ModulAjarController::class, 'pilihanPaket']);
            Route::post('/modul/{id}/ai', [ModulAjarController::class, 'susunAI']);
            Route::post('/modul/{id}/ajukan', [ModulAjarController::class, 'ajukan']);
            Route::post('/modul/{id}/tarik', [ModulAjarController::class, 'tarik']);
            Route::post('/modul/{id}/setujui', [ModulAjarController::class, 'setujui']);
            Route::post('/modul/{id}/revisi', [ModulAjarController::class, 'revisi']);
            // Peta Tema / spider web kurikulum PBPM (lintas mapel; persetujuan kepala sekolah dicek di controller)
            Route::get('/tema/referensi', [PetaTemaController::class, 'referensi']);
            Route::get('/tema/high-level', [PetaTemaController::class, 'highLevel']);
            Route::post('/tema/high-level', [PetaTemaController::class, 'tambahHighLevel']);
            Route::get('/tema', [PetaTemaController::class, 'index']);
            Route::post('/tema', [PetaTemaController::class, 'simpan']);
            Route::get('/tema/{id}', [PetaTemaController::class, 'show']);
            Route::put('/tema/{id}', [PetaTemaController::class, 'simpan']);
            Route::delete('/tema/{id}', [PetaTemaController::class, 'destroy']);
            Route::post('/tema/{id}/ai', [PetaTemaController::class, 'susunAI']);
            Route::get('/tema/{id}/pola-jadwal', [PetaTemaController::class, 'polaJadwal']);
            Route::post('/tema/{id}/pola-ai', [PetaTemaController::class, 'polaAI']);
            Route::post('/tema/{id}/slot', [PetaTemaController::class, 'slot']);
            Route::post('/tema/{id}/tetapkan', [PetaTemaController::class, 'tetapkan']);
            Route::get('/tema/{id}/jadwal', [PetaTemaController::class, 'jadwalPratinjau']);
            Route::post('/tema/{id}/jadwal', [PetaTemaController::class, 'buatJadwal']);
            Route::get('/tema/{id}/cek', [PetaTemaController::class, 'cek']);
            Route::post('/tema/{id}/buka-kunci', [PetaTemaController::class, 'bukaKunci']);
            Route::post('/tema/{id}/ajukan', [PetaTemaController::class, 'ajukan']);
            Route::post('/tema/{id}/tarik', [PetaTemaController::class, 'tarik']);
            Route::post('/tema/{id}/setujui', [PetaTemaController::class, 'setujui']);
            Route::post('/tema/{id}/revisi', [PetaTemaController::class, 'revisi']);
        });

        Route::get('/dashboard', [DashboardController::class, 'index']);
        Route::get('/laporan/stnkm', [LaporanController::class, 'stnkm']);
        Route::post('/whatsapp', [WhatsAppController::class, 'kirim']);
    });

    // ===== PENYUSUN REFERENSI PENILAIAN (ADMIN & GURU; KEPSEK LIHAT SAJA) =====
    // Guru dibatasi ke mapel yang diampu (dicek di controller); ubah/hapus aktivitas, hapus materi & indikator khusus admin
    Route::middleware('role:admin,guru')->group(function () {
        Route::post('/mbk', [MBKController::class, 'store']);
        Route::post('/materi', [MateriController::class, 'store']);
        Route::put('/materi/{materi}', [MateriController::class, 'update']);
        Route::post('/materi/rujukan-tp', [MateriController::class, 'rujukanTp']);
        Route::post('/materi/asisten-ai', [MateriController::class, 'asistenAI'])->middleware('throttle:20,1');
        Route::post('/indikator', [IndikatorController::class, 'store']);
        Route::put('/indikator/{indikator}', [IndikatorController::class, 'update']);
    });

    // ===== PENGELOLA AKADEMIK (ADMIN & KEPSEK) =====
    Route::middleware('role:admin,kepsek')->group(function () {
        Route::get('/keluarga', [KeluargaController::class, 'index']);
        Route::apiResource('/ruangan', RuanganController::class)->only(['store', 'update', 'destroy']);
    });
});

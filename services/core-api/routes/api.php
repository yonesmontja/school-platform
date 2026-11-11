<?php

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;
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
use App\Http\Controllers\Api\KisiKisiController;
use App\Http\Controllers\Api\PaketSoalController;
use App\Http\Controllers\Api\PerangkatAjarController;
use App\Http\Controllers\Api\ModulAjarController;
use App\Http\Controllers\Api\DokumenRujukanController;
use App\Http\Controllers\Api\DokumentasiApiController;
use App\Http\Controllers\Api\PemakaianController;
use App\Http\Controllers\Api\CanvaController;
use App\Http\Controllers\Api\VideoBelajarController;
use App\Http\Controllers\Api\RenderInternalController;
use App\Http\Controllers\Api\UjianController;
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
use App\Http\Controllers\Api\P5Controller;
use App\Http\Controllers\Api\DashboardController;
use App\Http\Controllers\Api\JadwalController;
use App\Http\Controllers\Api\RuanganController;

use App\Http\Controllers\Api\UserController;
use App\Http\Controllers\Api\LogAktivitasController;
use App\Http\Controllers\Api\NotifikasiController;
use App\Http\Controllers\Api\DiagnostikController;
use App\Http\Controllers\Api\PortalController;

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
    // Pusat notifikasi "Perlu Tindakan" (isi disesuaikan peran di NotifikasiService)
    Route::get('/notifikasi', [NotifikasiController::class, 'index']);
    // Kalender hari libur selain Minggu: semua akun membaca; admin & kepala sekolah mengelola
    Route::get('/hari-libur', [HariLiburController::class, 'index']);
    Route::middleware('role:admin,kepsek')->group(function () {
        Route::post('/hari-libur', [HariLiburController::class, 'store']);
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
    // Dasbor pemakaian (masa pakai nyata): admin & kepala sekolah
    Route::get('/pemakaian', [PemakaianController::class, 'index'])->middleware('role:admin,kepsek');

    // ===== PORTAL SISWA & ORANG TUA =====
    Route::middleware('role:siswa,ortu')->prefix('portal')->group(function () {
        Route::get('/anak', [PortalController::class, 'anak']);
        Route::get('/video', [VideoBelajarController::class, 'portal']);
        Route::get('/rapor', [PortalController::class, 'rapor']);
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
        Route::apiResource('/subjects', SubjectController::class)->only(['store', 'update', 'destroy']);
        Route::apiResource('/periodes', PeriodeController::class)->only(['store', 'update', 'destroy']);
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
        // Master data: baca untuk semua staf (dropdown & halaman master kepsek)
        Route::get('/students/master-data', [StudentController::class, 'getMasterData']);
        Route::apiResource('/students', StudentController::class)->only(['index']);
        Route::apiResource('/teachers', TeacherController::class)->only(['index']);
        Route::apiResource('/classes', ClassesController::class)->only(['index']);
        Route::apiResource('/subjects', SubjectController::class)->only(['index']);
        Route::apiResource('/periodes', PeriodeController::class)->only(['index']);
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

        // Jurnal: semua kelas; guru hanya mengubah/menghapus catatan miliknya
        Route::prefix('jurnal')->group(function () {
            Route::get('/', [JurnalController::class, 'index']);
            Route::post('/analyze', [JurnalController::class, 'analyze']);
            Route::post('/store', [JurnalController::class, 'store']);
            Route::post('/import', [JurnalController::class, 'importBatch']);
            Route::put('/{id}', [JurnalController::class, 'update']);
            Route::delete('/{id}', [JurnalController::class, 'destroy']);
        });

        Route::prefix('presensi')->group(function () {
            Route::get('/', [PresensiController::class, 'index']);
            Route::post('/batch', [PresensiController::class, 'saveBatch']);
            Route::delete('/tanggal', [PresensiController::class, 'hapusTanggal']);
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
        });

        // Jadwal: guru membuat & mengubah jadwal miliknya sendiri
        Route::prefix('jadwal')->group(function () {
            Route::get('/', [JadwalController::class, 'index']);
            Route::get('/referensi', [JadwalController::class, 'referensi']);
            Route::get('/rencana-hari', [JadwalController::class, 'rencanaHari']);
            Route::get('/{id}/rencana', [JadwalController::class, 'rencana']);
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
            Route::post('/impor', [BankSoalController::class, 'impor']);
            Route::post('/gambar', [BankSoalController::class, 'unggahGambar']);
            Route::post('/ai/gambar', [BankSoalController::class, 'gambarAI'])->middleware('throttle:20,1');
            Route::get('/{id}', [BankSoalController::class, 'show']);
            Route::put('/{id}', [BankSoalController::class, 'update']);
            Route::delete('/{id}', [BankSoalController::class, 'destroy']);
            Route::post('/{id}/tarik', [BankSoalController::class, 'tarik']);
        });
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
            Route::delete('/{id}', [DokumenRujukanController::class, 'destroy']);
        });
        // Perangkat ajar (Fase 17): CP & ATP; guru untuk mapel diampu, persetujuan ATP oleh kepala sekolah (dicek di controller)
        Route::prefix('perangkat-ajar')->group(function () {
            Route::get('/referensi', [PerangkatAjarController::class, 'referensi']);
            Route::get('/cp', [PerangkatAjarController::class, 'daftarCp']);
            Route::post('/cp', [PerangkatAjarController::class, 'simpanCp']);
            Route::post('/cp/pecah', [PerangkatAjarController::class, 'pecahCp']);
            Route::post('/cp/susun', [PerangkatAjarController::class, 'susunCp']);
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
        Route::post('/indikator', [IndikatorController::class, 'store']);
        Route::put('/indikator/{indikator}', [IndikatorController::class, 'update']);
    });

    // ===== PENGELOLA AKADEMIK (ADMIN & KEPSEK) =====
    Route::middleware('role:admin,kepsek')->group(function () {
        Route::get('/keluarga', [KeluargaController::class, 'index']);
        Route::apiResource('/ruangan', RuanganController::class)->only(['store', 'update', 'destroy']);
    });
});

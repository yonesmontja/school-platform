<?php

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\StudentController;
use App\Http\Controllers\Api\SchoolSettingController;
use App\Http\Controllers\Api\TeacherController;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Response;
use App\Http\Controllers\Api\ClassesController;
use App\Http\Controllers\Api\SubjectController;
use App\Http\Controllers\Api\NilaiController;
use App\Http\Controllers\Api\RemedialController;
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
    Route::post('/notifikasi/baca', [NotifikasiController::class, 'baca']);

    // Log Aktivitas: admin & kepsek melihat semua, guru hanya miliknya (dicek di controller)
    Route::middleware('role:admin,kepsek,guru')->prefix('log-aktivitas')->group(function () {
        Route::get('/', [LogAktivitasController::class, 'index']);
        Route::get('/ringkasan', [LogAktivitasController::class, 'ringkasan']);
        Route::get('/opsi', [LogAktivitasController::class, 'opsi']);
        Route::get('/{id}', [LogAktivitasController::class, 'show'])->whereNumber('id');
    });

    // ===== PORTAL SISWA & ORANG TUA =====
    Route::middleware('role:siswa,ortu')->prefix('portal')->group(function () {
        Route::get('/anak', [PortalController::class, 'anak']);
        Route::get('/rapor', [PortalController::class, 'rapor']);
    });

    // ===== KHUSUS ADMIN: master data inti, pengaturan sistem, akun pengguna =====
    Route::middleware('role:admin')->group(function () {
        Route::post('/settings', [SchoolSettingController::class, 'update']);

        Route::apiResource('/students', StudentController::class)->only(['store', 'update', 'destroy']);
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
            Route::post('/', [JadwalController::class, 'store']);
            Route::put('/{id}', [JadwalController::class, 'update']);
            Route::patch('/{id}/geser', [JadwalController::class, 'geser']);
            Route::patch('/{id}/status', [JadwalController::class, 'status']);
            Route::delete('/{id}', [JadwalController::class, 'destroy']);
        });
        Route::get('/ruangan', [RuanganController::class, 'index']);

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
        Route::apiResource('/ruangan', RuanganController::class)->only(['store', 'update', 'destroy']);
    });
});

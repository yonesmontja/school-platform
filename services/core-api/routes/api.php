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
use App\Http\Controllers\Api\PeriodeController;
use App\Http\Controllers\Api\KategoriPenilaianController;
use App\Http\Controllers\Api\MBKController;
use App\Http\Controllers\Api\MateriController;
use App\Http\Controllers\Api\JurnalController;

Route::post('/register', [AuthController::class, 'register']);
Route::post('/login', [AuthController::class, 'login']);

// Route Proxy untuk Gambar TTD (Anti CORS)
Route::get('/signature/{filename}', function ($filename) {
    $path = storage_path('app/public/signatures/' . $filename);

    if (!File::exists($path)) {
        abort(404, 'File tanda tangan tidak ditemukan di server.');
    }

    $file = File::get($path);
    $type = File::mimeType($path);
    $response = Response::make($file, 200);
    $response->header("Content-Type", $type);
    $response->header('Access-Control-Allow-Origin', '*'); // Izinkan akses dari Next.js
    return $response;
});

Route::middleware('auth:sanctum')->group(function () {
    Route::get('/user', function (Request $request) {
        return $request->user();
    });
    Route::post('/logout', [AuthController::class, 'logout']);

    Route::get('/students/master-data', [StudentController::class, 'getMasterData']);
    Route::apiResource('/students', StudentController::class);
    Route::get('/settings', [SchoolSettingController::class, 'show']);
    Route::post('/settings', [SchoolSettingController::class, 'update']);
    Route::apiResource('/teachers', TeacherController::class);
    Route::apiResource('/classes', ClassesController::class);
    Route::apiResource('/subjects', SubjectController::class);
    Route::prefix('nilai')->group(function () {
        Route::get('/', [NilaiController::class, 'index']);
        Route::get('/filters', [NilaiController::class, 'getFilters']);
        Route::get('/materi', [NilaiController::class, 'getMateriByContext']);
        Route::get('/students', [NilaiController::class, 'getStudentsWithNilai']);
        Route::post('/batch', [NilaiController::class, 'saveBatch']);
        Route::delete('/{id}', [NilaiController::class, 'destroy']);
    });
    // Master Reference Penilaian
    Route::apiResource('/periodes', PeriodeController::class);
    Route::apiResource('/kategori-penilaian', KategoriPenilaianController::class);
    // Master MBK & Materi
    Route::apiResource('/mbk', MBKController::class)->except(['show']);
    Route::get('/materi/by-context', [MateriController::class, 'byContext']);
    Route::apiResource('/materi', MateriController::class)->except(['show']);
    // Jurnal Anekdotal
    Route::prefix('jurnal')->group(function () {
        Route::get('/', [JurnalController::class, 'index']);
        Route::post('/analyze', [JurnalController::class, 'analyze']);
        Route::post('/store', [JurnalController::class, 'store']);
        Route::put('/{id}', [JurnalController::class, 'update']);
        Route::delete('/{id}', [JurnalController::class, 'destroy']);
    });
});

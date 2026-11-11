<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

// Dijalankan oleh layanan "scheduler" (php artisan schedule:work) di docker-compose
Schedule::command('log:arsipkan')->dailyAt('02:00')->timezone(config('app.zona_sekolah'))->withoutOverlapping();
// Token login yang lewat masa berlaku (sanctum.expiration) dibersihkan meski pemiliknya tidak login lagi
Schedule::command('sanctum:prune-expired --hours=24')->dailyAt('02:30')->timezone(config('app.zona_sekolah'));

// API render v1: berkas hasil render lebih dari 30 hari dihapus (tautan unduh hanya berlaku 7 hari)
Artisan::command('render-api:bersihkan', function () {
    $n = 0;
    \App\Models\RenderApi::where('status', 'done')->whereNotNull('file_path')->where('selesai_pada', '<', now()->subDays(30))->each(function ($j) use (&$n) {
        \Illuminate\Support\Facades\Storage::disk('local')->delete(array_filter([$j->file_path, $j->poster_path]));
        $j->update(['file_path' => null, 'poster_path' => null]);
        $n++;
    });
    $this->info("{$n} hasil render API dibersihkan.");
})->purpose('Hapus berkas hasil API render yang lebih dari 30 hari');
Schedule::command('render-api:bersihkan')->dailyAt('03:00')->timezone(config('app.zona_sekolah'));

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

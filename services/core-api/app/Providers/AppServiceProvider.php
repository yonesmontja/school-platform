<?php

namespace App\Providers;

use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        // Batas kasar per IP untuk endpoint login. Satu sekolah bisa berbagi satu IP publik (NAT),
        // jadi dibuat longgar; batas utama per akun ada di AuthController::login.
        RateLimiter::for('login', fn (Request $request) => Limit::perMinute(30)->by($request->ip()));
    }
}

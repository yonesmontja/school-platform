<?php

use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',      // <-- TAMBAHKAN BARIS INI
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        // Semua request datang lewat proxy Next.js (dan cloudflared). IP asli pengguna dibaca dari
        // X-Forwarded-For hanya bila pengirimnya proxy tepercaya (jaringan privat Docker), agar
        // rate limit login berlaku per pengguna, bukan per container web.
        $middleware->trustProxies(
            at: env('TRUSTED_PROXIES', '127.0.0.1,::1,10.0.0.0/8,172.16.0.0/12,192.168.0.0/16,fc00::/7'),
            // Host asli (web.saprapor.com) dari Next.js dipercaya agar URL yang dibuat Laravel (mis. tautan unduh bertanda
            // tangan API render) memakai domain publik, bukan nama container core-api:8000. Port tidak dipercaya.
            headers: Request::HEADER_X_FORWARDED_FOR | Request::HEADER_X_FORWARDED_PROTO | Request::HEADER_X_FORWARDED_HOST,
        );
        // Bawaan Laravel mengarahkan tamu ke route('login') yang tidak ada di API ini (→ error 500).
        // Request API cukup dijawab 401 JSON; halaman login ada di frontend Next.js.
        $middleware->redirectGuestsTo(fn (Request $request) => $request->is('api/*') ? null : url('/'));
        // role:admin,kepsek → hanya peran tersebut; role (tanpa argumen) → semua peran asalkan akun aktif
        $middleware->alias(['role' => \App\Http\Middleware\EnsureRole::class, 'kunci.api' => \App\Http\Middleware\KunciApi::class]);
        // Batas laju umum untuk semua route API (RateLimiter 'api' di AppServiceProvider)
        $middleware->throttleApi();
        // Audit trail: setiap tindakan yang mengubah data dicatat ke Log Aktivitas
        $middleware->appendToGroup('api', \App\Http\Middleware\CatatAktivitas::class);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->shouldRenderJsonWhen(
            fn (Request $request) => $request->is('api/*') || $request->expectsJson(),
        );
    })->create();

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
        // Bawaan Laravel mengarahkan tamu ke route('login') yang tidak ada di API ini (→ error 500).
        // Request API cukup dijawab 401 JSON; halaman login ada di frontend Next.js.
        $middleware->redirectGuestsTo(fn (Request $request) => $request->is('api/*') ? null : url('/'));
        // role:admin,kepsek → hanya peran tersebut; role (tanpa argumen) → semua peran asalkan akun aktif
        $middleware->alias(['role' => \App\Http\Middleware\EnsureRole::class]);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->shouldRenderJsonWhen(
            fn (Request $request) => $request->is('api/*') || $request->expectsJson(),
        );
    })->create();

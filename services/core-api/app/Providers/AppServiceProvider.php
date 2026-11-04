<?php

namespace App\Providers;

use App\Models\LogAktivitas;
use App\Models\LogPerubahan;
use App\Services\AuditTrail;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Event;
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

        // Audit trail: setiap tambah/ubah/hapus model aplikasi direkam (kecuali log itu sendiri)
        foreach (['created' => 'TAMBAH', 'updated' => 'UBAH', 'deleted' => 'HAPUS'] as $event => $aksi) {
            Event::listen("eloquent.{$event}: *", function (string $nama, array $data) use ($aksi) {
                $model = $data[0] ?? null;
                if (!$model instanceof Model || !str_starts_with($model::class, 'App\\Models\\')) return;
                if ($model instanceof LogAktivitas || $model instanceof LogPerubahan || ($model->tanpaAudit ?? false)) return;
                AuditTrail::rekamModel($model, $aksi);
            });
        }
    }
}

# core-api (Laravel)

Laravel Boost sengaja **tidak** dipakai di proyek ini: satu-satunya container Laravel (`school_core_api`) memakai kode
yang di-bind-mount dan terhubung ke database asli, jadi paket dev dan alat database untuk asisten AI tidak dipasang di sana.

- PHP dan Composer berjalan di dalam Docker, bukan di host: `docker exec school_core_api php artisan …`.
- Tes: `docker exec school_core_api php artisan test --compact` (database `school_platform_test`).
- Perubahan kode backend langsung aktif di situs publik. Sebelum migrasi di database asli: backup dulu, periksa dump,
  baru migrasi, lalu migrasi juga database tes (`-e DB_DATABASE=school_platform_test`).

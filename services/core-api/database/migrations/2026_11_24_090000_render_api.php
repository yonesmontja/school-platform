<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * API render publik (v1) untuk aplikasi luar (mis. asisten AI "Muse"): kunci API, antrean render, dan tabel tempat
 * terverifikasi untuk adegan peta. Video hasil API terpisah dari Video Belajar sekolah.
 */
return new class extends Migration
{
    // Penyesuaian nama data awal Natural Earth ke ejaan baku Indonesia
    private const NAMA = ['strait-of-malacca' => ['Selat Malaka', ['Selat Melaka']]];

    public function up(): void
    {
        Schema::table('school_settings', function (Blueprint $t) {
            $t->text('azure_speech_key')->nullable();
            $t->string('azure_speech_region', 40)->nullable();
        });

        Schema::create('api_klien', function (Blueprint $t) {
            $t->id();
            $t->string('nama', 80);
            $t->string('awalan', 12); // beberapa karakter awal kunci, untuk dikenali di daftar
            $t->string('kunci_hash', 64)->unique(); // SHA-256; kunci asli hanya ditampilkan sekali saat dibuat
            $t->boolean('aktif')->default(true);
            $t->foreignId('dibuat_oleh')->nullable()->constrained('users')->nullOnDelete();
            $t->timestamp('terakhir_dipakai')->nullable();
            $t->timestamps();
        });

        Schema::create('render_api', function (Blueprint $t) {
            $t->string('id', 40)->primary(); // job_id: rnd_…
            $t->foreignId('id_klien')->constrained('api_klien')->cascadeOnDelete();
            $t->string('status', 12)->default('queued'); // queued | rendering | done | failed
            $t->string('episode', 120)->nullable();
            $t->string('templat', 40);
            $t->json('payload');
            $t->json('props');
            $t->string('suara', 20)->default('TANPA');
            $t->json('peringatan')->nullable();
            $t->text('pesan')->nullable();
            $t->string('file_path')->nullable();   // disk lokal (privat): render-api/…
            $t->string('poster_path')->nullable();
            $t->unsignedInteger('durasi_detik')->nullable();
            $t->unsignedInteger('ukuran_kb')->nullable();
            $t->json('aset')->nullable(); // berkas unduhan (narasi/musik) di storage publik, dihapus setelah selesai
            $t->timestamp('mulai_render')->nullable();
            $t->timestamp('selesai_pada')->nullable();
            $t->timestamps();
            $t->index(['status', 'created_at']);
        });

        Schema::create('tempat_peta', function (Blueprint $t) {
            $t->id();
            $t->string('kode', 80)->unique();
            $t->string('nama', 120);
            $t->json('alias')->nullable();
            $t->string('jenis', 10); // titik | wilayah
            $t->decimal('lon', 9, 5);
            $t->decimal('lat', 8, 5);
            $t->json('bbox')->nullable(); // [minLon, minLat, maxLon, maxLat] untuk wilayah (selat, laut)
            $t->string('negara', 80)->nullable();
            $t->string('sumber', 200);
            $t->timestamps();
            $t->index('nama');
        });

        $now = now();
        $data = json_decode(file_get_contents(resource_path('peta/tempat_awal.json')), true);
        foreach (array_chunk($data, 200) as $potong) {
            DB::table('tempat_peta')->insert(array_map(function ($t) use ($now) {
                [$nama, $tambahAlias] = self::NAMA[$t['kode']] ?? [$t['nama'], []];
                $alias = array_values(array_unique(array_merge($t['alias'] ?? [], $tambahAlias, $nama !== $t['nama'] ? [$t['nama']] : [])));
                return [
                    'kode' => $t['kode'], 'nama' => $nama, 'alias' => json_encode(array_values(array_diff($alias, [$nama]))),
                    'jenis' => $t['jenis'], 'lon' => $t['lon'], 'lat' => $t['lat'], 'bbox' => $t['bbox'] ? json_encode($t['bbox']) : null,
                    'negara' => $t['negara'] ?? null, 'sumber' => $t['sumber'], 'created_at' => $now, 'updated_at' => $now,
                ];
            }, $potong));
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('tempat_peta');
        Schema::dropIfExists('render_api');
        Schema::dropIfExists('api_klien');
        Schema::table('school_settings', fn(Blueprint $t) => $t->dropColumn(['azure_speech_key', 'azure_speech_region']));
    }
};

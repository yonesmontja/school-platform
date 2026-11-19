<?php

namespace Tests\Feature;

use App\Models\LogAktivitas;
use App\Models\SchoolSetting;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

/**
 * Pemantau uptime (situs:pantau): admin diberi tahu lewat WA setelah 2 pemeriksaan gagal berturut-turut (sekali saja),
 * lalu sekali lagi saat situs pulih. Tanpa nomor WA admin, kejadian tetap tercatat di Log Aktivitas.
 */
class PantauSitusTest extends TestCase
{
    use RefreshDatabase;

    private array $kiriman = [];

    protected function setUp(): void
    {
        parent::setUp();
        config(['app.url_publik' => 'https://situs.uji']);
        Cache::forget('pantau-situs');
    }

    private int $kode = 200;
    private bool $palsu = false;

    /** Situs menjawab $kode; Fonnte dicatat. Fake dipasang sekali (stub pertama selalu menang). */
    private function situs(int $kode): void
    {
        $this->kode = $kode;
        if ($this->palsu) return;
        $this->palsu = true;
        Http::fake(function ($req) {
            $kode = $this->kode;
            if (str_contains($req->url(), 'api.fonnte.com')) {
                $this->kiriman[] = $req['data'];
                return Http::response(['status' => true]);
            }
            return str_ends_with($req->url(), '/api/health')
                ? Http::response(['status' => $kode < 500 ? 'ok' : 'database tidak terjangkau'], $kode)
                : Http::response('beranda', $kode);
        });
    }

    public function test_wa_sekali_saat_mati_lalu_saat_pulih(): void
    {
        SchoolSetting::create(['nama_sekolah' => 'SD Uji', 'status_wa_api' => true, 'wa_api_token' => 'tok', 'no_wa_admin' => '081234567890']);

        $this->situs(200);
        $this->artisan('situs:pantau')->assertSuccessful();
        $this->assertCount(0, $this->kiriman);

        $this->situs(502);
        $this->artisan('situs:pantau')->assertSuccessful(); // gagal pertama: belum diumumkan
        $this->assertCount(0, $this->kiriman);
        $this->artisan('situs:pantau')->assertSuccessful(); // gagal kedua: WA
        $this->artisan('situs:pantau')->assertSuccessful(); // gagal ketiga: tidak diulang
        $this->assertCount(1, $this->kiriman);
        $this->assertStringContainsString('tidak bisa dibuka', $this->kiriman[0]);
        $this->assertStringContainsString('Beranda menjawab 502', $this->kiriman[0]);

        $this->situs(200);
        $this->artisan('situs:pantau')->assertSuccessful();
        $this->assertCount(2, $this->kiriman);
        $this->assertStringContainsString('sudah bisa dibuka lagi', $this->kiriman[1]);
        $this->assertSame(['SITUS_MATI', 'SITUS_PULIH'], LogAktivitas::whereIn('aksi', ['SITUS_MATI', 'SITUS_PULIH'])->orderBy('id')->pluck('aksi')->all());

        // Situs normal lagi: tidak ada pesan tambahan
        $this->artisan('situs:pantau')->assertSuccessful();
        $this->assertCount(2, $this->kiriman);
    }

    public function test_tanpa_nomor_admin_tetap_dicatat_dan_uji_melapor_gagal(): void
    {
        SchoolSetting::create(['nama_sekolah' => 'SD Uji']);
        Http::fake(fn() => throw new \Illuminate\Http\Client\ConnectionException('timeout'));
        $this->artisan('situs:pantau');
        $this->artisan('situs:pantau');
        $log = LogAktivitas::where('aksi', 'SITUS_MATI')->first();
        $this->assertNotNull($log);
        $this->assertStringContainsString('tidak menjawab', $log->deskripsi);
        $this->assertStringContainsString('nomor WA admin belum diisi', $log->deskripsi);

        $this->artisan('situs:pantau --uji')->assertFailed();
    }
}

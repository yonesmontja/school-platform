<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\Concerns\MembuatDataSekolah;
use Tests\TestCase;

/** Dokumentasi API: dibaca dari router, hanya untuk admin, lengkap dengan akses & keterangan; tersedia sebagai OpenAPI. */
class DokumentasiApiTest extends TestCase
{
    use RefreshDatabase, MembuatDataSekolah;

    protected function setUp(): void
    {
        parent::setUp();
        $this->buatSekolah();
    }

    public function test_dokumentasi_memuat_semua_endpoint_dengan_akses_dan_keterangan(): void
    {
        Sanctum::actingAs($this->sekolah->guruA);
        $this->getJson('/api/dokumentasi')->assertForbidden();

        Sanctum::actingAs($this->sekolah->admin);
        $res = $this->getJson('/api/dokumentasi')->assertOk();
        $semua = collect($res->json('data'))->flatMap(fn($g) => $g['endpoint'])->keyBy(fn($e) => "{$e['metode']} {$e['uri']}");
        $this->assertSame($res->json('jumlah'), $semua->count());

        // Rute publik, rute siswa, rute admin, dan keterangan dari README/komentar
        $this->assertFalse($semua['POST /login']['butuh_login']);
        $this->assertSame(['siswa'], $semua['POST /ujian/{id}/rekaman']['peran']);
        $this->assertSame('30 permintaan per 1 menit', $semua['POST /ujian/{id}/rekaman']['batas']);
        $this->assertSame(['admin'], $semua['POST /settings']['peran']);
        $this->assertStringContainsString('rekaman', mb_strtolower($semua['POST /ujian/{id}/rekaman']['deskripsi']));
        $this->assertSame('Tes online (siswa)', $semua['POST /ujian/{id}/rekaman']['kelompok']);
        $this->assertFalse($semua->has('GET /dokumentasi')); // halaman ini sendiri tidak didaftar
        $this->assertTrue($semua->every(fn($e) => trim($e['deskripsi']) !== ''));

        $spec = $this->getJson('/api/dokumentasi/openapi.json')->assertOk()->json();
        $this->assertSame('3.0.3', $spec['openapi']);
        $this->assertArrayHasKey('post', $spec['paths']['/paket-soal/{id}/kirim-nilai']);
        $this->assertSame([], $spec['paths']['/login']['post']['security']);
        $this->assertSame('id', $spec['paths']['/paket-soal/{id}/kirim-nilai']['post']['parameters'][0]['name']);
    }
}

<?php

namespace Tests\Feature;

use App\Models\Student;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\Concerns\MembuatDataSekolah;
use Tests\TestCase;

/**
 * Kartu pelajar berfoto & ber-QR: data cetak per peran dan verifikasi publik dari kode QR.
 */
class KartuSiswaTest extends TestCase
{
    use RefreshDatabase, MembuatDataSekolah;

    protected function setUp(): void
    {
        parent::setUp();
        $this->buatSekolah();
    }

    public function test_wali_kelas_mencetak_kartu_kelas_binaan_saja(): void
    {
        Sanctum::actingAs($this->sekolah->guruA);
        $res = $this->getJson('/api/kartu-pelajar')->assertOk();
        $this->assertEqualsCanonicalizing(['SIS-1', 'SIS-2', 'SIS-3'], array_column($res->json('data'), 'id_siswa'));
        $this->assertSame('2029/2030', $res->json('tahun_ajaran'));
        $kode = $res->json('data.0.kode');
        $this->assertMatchesRegularExpression('/^[A-F0-9]{12}$/', $kode);

        // Siswa kelas lain tidak ikut walau diminta
        $this->getJson('/api/kartu-pelajar?id_kelas=KLS-B')->assertNotFound();
        $this->assertSame('CETAK_KARTU', \App\Models\LogAktivitas::latest('id')->value('aksi'));

        // Guru tanpa kelas binaan dan siswa ditolak
        Sanctum::actingAs($this->sekolah->siswa);
        $this->getJson('/api/kartu-pelajar')->assertForbidden();

        // Admin: satu siswa tertentu
        Sanctum::actingAs($this->sekolah->admin);
        $this->getJson('/api/kartu-pelajar?id_siswa[]=SIS-4')->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.kelas', '4B');
    }

    public function test_verifikasi_publik_dari_kode_qr(): void
    {
        $kode = Student::find('SIS-2')->kodeKartu();
        $this->getJson("/api/verifikasi-siswa/{$kode}")->assertOk()
            ->assertJsonPath('data.nama_siswa', 'Budi')->assertJsonPath('data.kelas', '4A')->assertJsonPath('data.aktif', true)
            ->assertJsonMissingPath('data.nisn');
        $this->getJson('/api/verifikasi-siswa/' . strtolower($kode))->assertOk();
        $this->getJson('/api/verifikasi-siswa/AAAAAAAAAAAA')->assertNotFound();
        $this->getJson('/api/verifikasi-siswa/pendek')->assertNotFound();
    }
}

<?php

namespace Tests\Feature;

use App\Models\BankSoal;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\Concerns\MembuatDataSekolah;
use Tests\TestCase;

/**
 * Pencarian global (Ctrl+K): hasil disaring menurut hak akses peran.
 */
class CariTest extends TestCase
{
    use RefreshDatabase, MembuatDataSekolah;

    protected function setUp(): void
    {
        parent::setUp();
        $this->buatSekolah();
    }

    private function jenis(array $data, string $jenis): array
    {
        return array_values(array_map(fn($x) => $x['judul'], array_filter($data, fn($x) => $x['jenis'] === $jenis)));
    }

    public function test_admin_menemukan_siswa_guru_dan_materi(): void
    {
        Sanctum::actingAs($this->sekolah->admin);
        $d = $this->getJson('/api/cari?q=do')->assertOk()->json('data');
        $this->assertSame(['Dodi'], $this->jenis($d, 'Siswa'));
        $siswa = collect($d)->firstWhere('jenis', 'Siswa');
        $this->assertSame('/dashboard/portal?siswa=SIS-4', $siswa['tautan']);
        $this->assertTrue($siswa['dashboard_pribadi']);

        $this->assertSame(['Guru A', 'Guru B'], $this->jenis($this->getJson('/api/cari?q=guru')->json('data'), 'Guru'));
        $this->assertSame(['Pecahan'], $this->jenis($this->getJson('/api/cari?q=PECA')->json('data'), 'Materi'));
        // Kata terlalu pendek ditolak; karakter wildcard tidak mencocokkan semuanya
        $this->getJson('/api/cari?q=a')->assertStatus(422);
        $this->assertSame([], $this->getJson('/api/cari?q=%25%25')->json('data'));
    }

    public function test_guru_hanya_melihat_yang_terjangkau(): void
    {
        BankSoal::unguarded(function () {
            BankSoal::create(['id_soal' => 'SOAL-1', 'id_mapel' => 'MPL-A', 'bentuk' => 'PG', 'level_kognitif' => 'C2', 'tingkat_kesulitan' => 'SEDANG', 'sumber' => 'MANUAL', 'pertanyaan' => 'Berapakah pecahan senilai 1/2?', 'status' => 'DISETUJUI', 'dibuat_oleh' => $this->sekolah->admin->id]);
            BankSoal::create(['id_soal' => 'SOAL-2', 'id_mapel' => 'MPL-B', 'bentuk' => 'PG', 'level_kognitif' => 'C2', 'tingkat_kesulitan' => 'SEDANG', 'sumber' => 'MANUAL', 'pertanyaan' => 'Berapakah kaki serangga?', 'status' => 'DISETUJUI', 'dibuat_oleh' => $this->sekolah->admin->id]);
        });

        // Guru A: wali 4A & pengampu Matematika
        Sanctum::actingAs($this->sekolah->guruA);
        $this->assertSame(['Ani'], $this->jenis($this->getJson('/api/cari?q=ani')->json('data'), 'Siswa'));
        $this->assertSame([], $this->jenis($this->getJson('/api/cari?q=dodi')->json('data'), 'Siswa'), 'Siswa kelas lain tidak muncul');
        $this->assertSame([], $this->jenis($this->getJson('/api/cari?q=guru')->json('data'), 'Guru'), 'Data guru hanya untuk pengelola');
        $soal = $this->jenis($this->getJson('/api/cari?q=berapakah')->json('data'), 'Soal');
        $this->assertCount(1, $soal);
        $this->assertStringContainsString('pecahan', $soal[0]);
        $this->assertSame([], $this->jenis($this->getJson('/api/cari?q=surat')->json('data'), 'Surat masuk'));

        Sanctum::actingAs($this->sekolah->siswa);
        $this->getJson('/api/cari?q=ani')->assertForbidden();
    }
}

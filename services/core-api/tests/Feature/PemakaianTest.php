<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Tests\Concerns\MembuatDataSekolah;
use Tests\TestCase;

/** Dasbor pemakaian (Fase 18): adopsi fitur per guru, jejak kerja, hambatan; hanya admin & kepala sekolah. */
class PemakaianTest extends TestCase
{
    use RefreshDatabase, MembuatDataSekolah;

    protected function setUp(): void
    {
        parent::setUp();
        $this->buatSekolah();
    }

    private function log(array $d): void
    {
        DB::table('log_aktivitas')->insert($d + ['waktu' => now(), 'kategori' => 'DATA', 'aksi' => 'SIMPAN', 'deskripsi' => 'uji', 'berhasil' => true]);
    }

    public function test_dasbor_menghitung_adopsi_per_guru_dan_hambatan(): void
    {
        $a = $this->sekolah->guruA;
        $b = $this->sekolah->guruB;
        $this->log(['user_id' => $a->id, 'peran' => 'guru', 'kategori' => 'NAVIGASI', 'aksi' => 'BUKA_HALAMAN', 'modul' => 'Input Nilai']);
        $this->log(['user_id' => $a->id, 'peran' => 'guru', 'modul' => 'Nilai']);
        $this->log(['user_id' => $a->id, 'peran' => 'guru', 'kategori' => 'NAVIGASI', 'aksi' => 'BUKA_HALAMAN', 'modul' => 'Jadwal']);
        $this->log(['user_id' => $a->id, 'peran' => 'guru', 'modul' => 'Jadwal', 'waktu' => now()->subDays(40)]); // di luar rentang 30 hari
        foreach ([200, 400, 5000] as $ms) $this->log(['user_id' => $a->id, 'peran' => 'guru', 'modul' => 'Jurnal', 'rute' => '/api/jurnal', 'durasi_ms' => $ms]);
        foreach ([40000, 50000, 45000] as $ms) $this->log(['user_id' => $a->id, 'peran' => 'guru', 'modul' => 'Bank Soal', 'rute' => '/api/bank-soal/ai/draf', 'durasi_ms' => $ms]);
        $this->log(['user_id' => $a->id, 'peran' => 'guru', 'modul' => 'Presensi', 'rute' => '/api/presensi', 'berhasil' => false, 'status_http' => 500]);
        $this->log(['user_id' => $a->id, 'peran' => 'guru', 'modul' => 'Presensi', 'rute' => '/api/presensi', 'berhasil' => false, 'status_http' => 422]); // isian tidak valid: bukan hambatan

        Sanctum::actingAs($a);
        $this->getJson('/api/pemakaian')->assertForbidden();

        Sanctum::actingAs($this->sekolah->kepsek);
        $d = $this->getJson('/api/pemakaian?hari=30')->assertOk()->json();
        $guruA = collect($d['per_guru'])->firstWhere('id', $a->id);
        $this->assertSame(['buka' => 1, 'kerja' => 1], $guruA['fitur']['nilai']);
        $this->assertSame(['buka' => 1, 'kerja' => 0], $guruA['fitur']['jadwal']); // log 40 hari lalu tidak dihitung
        $this->assertSame(0, collect($d['per_guru'])->firstWhere('id', $b->id)['hari_aktif']);
        $this->assertSame(['guru' => 2, 'guru_aktif' => 1], array_intersect_key($d['ringkasan'], ['guru' => 0, 'guru_aktif' => 0]));
        $this->assertSame(50, collect($d['adopsi'])->firstWhere('kunci', 'nilai')['persen']);

        // Hambatan: kegagalan 500 dihitung (422 tidak); rute AI tidak masuk daftar lambat
        $this->assertSame([['/api/presensi', 1]], collect($d['hambatan']['gagal'])->map(fn($g) => [$g['rute'], $g['jumlah']])->all());
        $this->assertSame(['/api/jurnal'], collect($d['hambatan']['lambat'])->pluck('rute')->all());
        $this->assertCount(8, $d['jejak']);
    }
}

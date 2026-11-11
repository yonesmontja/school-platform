<?php

namespace Tests\Feature;

use App\Models\User;
use App\Rules\BukanHariMinggu;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\Concerns\MembuatDataSekolah;
use Tests\TestCase;

class HariLiburTest extends TestCase
{
    use RefreshDatabase, MembuatDataSekolah;

    protected function setUp(): void
    {
        parent::setUp();
        $this->buatSekolah();
    }

    private function sebagai(User $user): static
    {
        Sanctum::actingAs($user);
        return $this;
    }

    public function test_data_awal_skb_dan_aturan_tanggal(): void
    {
        $r = $this->sebagai($this->sekolah->siswa)->getJson('/api/hari-libur?tahun=2026')->assertOk();
        $this->assertCount(25, $r->json('data'));
        $this->assertContains('Proklamasi Kemerdekaan', array_column($r->json('data'), 'nama'));
        $this->assertSame([2026, 2027], $r->json('tahun'));
        // 2027 belum dicocokkan dengan dokumen resmi
        $this->assertTrue($this->getJson('/api/hari-libur?tahun=2027')->json('data.0.perlu_cek'));

        $this->assertStringContainsString('Proklamasi', BukanHariMinggu::alasan(Carbon::parse('2026-08-17')));
        $this->assertStringContainsString('Minggu', BukanHariMinggu::alasan(Carbon::parse('2026-08-16')));
        $this->assertNull(BukanHariMinggu::alasan(Carbon::parse('2026-08-18')));
    }

    public function test_libur_sekolah_menolak_jadwal_dan_dilewati_pengulangan(): void
    {
        $s = $this->sekolah;
        $this->sebagai($s->guruA)->postJson('/api/hari-libur', ['tanggal' => '2030-01-09', 'nama' => 'HUT Sekolah', 'jenis' => 'SEKOLAH'])->assertForbidden();
        $id = $this->sebagai($s->kepsek)->postJson('/api/hari-libur', ['tanggal' => '2030-01-09', 'nama' => 'HUT Sekolah', 'jenis' => 'SEKOLAH'])
            ->assertCreated()->json('data.id');
        $this->postJson('/api/hari-libur', ['tanggal' => '2030-01-09', 'nama' => 'Ganda', 'jenis' => 'SEKOLAH'])->assertUnprocessable();

        // Sesi tunggal di hari libur ditolak dengan nama liburnya
        $this->sebagai($s->guruA)->postJson('/api/jadwal', ['judul' => 'Tes', 'mulai' => '2030-01-09T08:00', 'selesai' => '2030-01-09T09:00', 'pola' => 'sekali'])
            ->assertUnprocessable()->assertJsonFragment(['Tanggal 9 Januari 2030 adalah hari libur (HUT Sekolah). Pilih hari sekolah lain.']);

        // Pengulangan harian Senin–Jumat: hari libur dilewati, sesi lain tetap dibuat
        $r = $this->postJson('/api/jadwal', ['judul' => 'Harian', 'mulai' => '2030-01-07T08:00', 'selesai' => '2030-01-07T09:00', 'pola' => 'harian', 'sampai' => '2030-01-11'])
            ->assertCreated();
        $this->assertSame(4, $r->json('jumlah'));
        $this->assertCount(1, $r->json('libur_dilewati'));
        $this->assertStringContainsString('1 tanggal libur dilewati', $r->json('message'));

        // Libur dihapus → tanggal kembali menjadi hari sekolah
        $this->sebagai($s->kepsek)->deleteJson("/api/hari-libur/{$id}")->assertOk();
        $this->sebagai($s->guruA)->postJson('/api/jadwal', ['judul' => 'Tes', 'mulai' => '2030-01-09T10:00', 'selesai' => '2030-01-09T11:00', 'pola' => 'sekali'])->assertCreated();
    }

    public function test_tandai_tahun_sudah_dicek(): void
    {
        $this->sebagai($this->sekolah->admin)->postJson('/api/hari-libur/tandai-cek', ['tahun' => 2027])->assertOk();
        $this->assertNotContains(true, array_column($this->getJson('/api/hari-libur?tahun=2027')->json('data'), 'perlu_cek'));
    }
}

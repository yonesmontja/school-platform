<?php

namespace Tests\Feature;

use App\Models\LogAktivitas;
use App\Models\LogPerubahan;
use App\Models\KirimAkses;
use App\Models\Teacher;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\Concerns\MembuatDataSekolah;
use Tests\TestCase;

/** Pesan akses aplikasi lewat WhatsApp: jam efektif WIT, kata sandi dicocokkan/ditetapkan, riwayat tanpa kata sandi, khusus admin. */
class KirimAksesTest extends TestCase
{
    use RefreshDatabase, MembuatDataSekolah;

    protected function setUp(): void
    {
        parent::setUp();
        $this->buatSekolah();
        Teacher::where('id_guru', 'GR-A')->update(['no_wa' => '0812-3456-7890']);
        Sanctum::actingAs($this->sekolah->admin);
    }

    // Senin 09:00 WIT = 00:00 UTC
    private function jamEfektif(): void
    {
        $this->travelTo(CarbonImmutable::parse('2030-01-07 09:00', 'Asia/Jayapura'));
    }

    private function siapkan(array $data = [])
    {
        return $this->postJson("/api/users/{$this->sekolah->guruA->id}/akses-wa", $data + ['no_wa' => '081234567890', 'password' => 'rahasia123']);
    }

    public function test_pesan_berisi_salam_username_sandi_dan_alamat_lalu_tercatat_tanpa_sandi(): void
    {
        $this->jamEfektif();
        $info = $this->getJson("/api/users/{$this->sekolah->guruA->id}/akses-wa")->assertOk();
        $this->assertSame('0812-3456-7890', $info->json('nomor'));
        $this->assertTrue($info->json('jendela.buka'));

        $res = $this->siapkan()->assertOk();
        $teks = $res->json('teks');
        $this->assertStringContainsString('Salam hormat, Bapak/Ibu *Guru*', $teks);
        $this->assertStringContainsString($this->sekolah->guruA->username, $teks);
        $this->assertStringContainsString('rahasia123', $teks);
        $this->assertStringContainsString('https://web.saprapor.com/', $teks);
        $this->assertSame('6281234567890', $res->json('nomor'));
        $this->assertStringStartsWith('https://wa.me/6281234567890?text=', $res->json('tautan_wa'));

        $this->postJson("/api/akses-wa/{$res->json('id')}/tindakan", ['tindakan' => 'WHATSAPP'])->assertOk();
        $this->postJson("/api/akses-wa/{$res->json('id')}/tindakan", ['tindakan' => 'DISALIN'])->assertOk();
        $catatan = KirimAkses::sole();
        $this->assertSame('WHATSAPP', $catatan->tindakan);
        $this->assertSame('COCOK', $catatan->sandi);
        $this->assertSame($this->sekolah->admin->id, $catatan->dikirim_oleh);
        $this->assertStringNotContainsString('rahasia123', json_encode($catatan->toArray()));

        $riwayat = $this->getJson('/api/akses-wa/riwayat')->assertOk();
        $this->assertCount(1, $riwayat->json('data'));
        $this->assertSame('Admin', $riwayat->json('data.0.pengirim.name'));

        // Kata sandi tidak masuk Log Aktivitas
        $this->assertStringNotContainsString('rahasia123', LogAktivitas::all()->toJson() . LogPerubahan::all()->toJson());
    }

    public function test_sandi_salah_ditolak_kecuali_ditetapkan_sebagai_sandi_baru(): void
    {
        $this->jamEfektif();
        $this->siapkan(['password' => 'salah9999'])->assertStatus(422)->assertJsonValidationErrors('password');
        $this->assertSame(0, KirimAkses::count());

        $this->siapkan(['password' => 'pendek', 'tetapkan' => true])->assertStatus(422);
        $res = $this->siapkan(['password' => 'SandiBaru88', 'tetapkan' => true])->assertOk();
        $this->assertStringContainsString('diminta mengganti kata sandi', $res->json('teks'));
        $guru = $this->sekolah->guruA->fresh();
        $this->assertTrue(Hash::check('SandiBaru88', $guru->password));
        $this->assertTrue($guru->wajib_ganti_password);
        $this->assertSame('BARU', KirimAkses::sole()->sandi);
    }

    public function test_di_luar_jam_efektif_ditolak(): void
    {
        // Senin 12:00 WIT tepat → tutup, dibuka Selasa 07:30
        $this->travelTo(CarbonImmutable::parse('2030-01-07 12:00', 'Asia/Jayapura'));
        $this->siapkan()->assertStatus(422)->assertJsonValidationErrors('jam');
        $this->assertStringContainsString('Selasa 08/01', $this->getJson('/api/akses-wa/riwayat')->json('jendela.keterangan'));

        // Sabtu 09:00 WIT → tutup, dibuka Senin
        $this->travelTo(CarbonImmutable::parse('2030-01-12 09:00', 'Asia/Jayapura'));
        $this->siapkan()->assertStatus(422);
        $this->assertStringContainsString('Senin 14/01', $this->getJson('/api/akses-wa/riwayat')->json('jendela.keterangan'));

        // Senin 07:29 WIT → belum buka; 07:30 → buka
        $this->travelTo(CarbonImmutable::parse('2030-01-14 07:29', 'Asia/Jayapura'));
        $this->siapkan()->assertStatus(422);
        $this->travelTo(CarbonImmutable::parse('2030-01-14 07:30', 'Asia/Jayapura'));
        $this->siapkan()->assertOk();
    }

    public function test_siswa_disapa_ananda_dan_hanya_admin_yang_boleh(): void
    {
        $this->jamEfektif();
        $res = $this->postJson("/api/users/{$this->sekolah->siswa->id}/akses-wa", ['no_wa' => '081200001111', 'password' => 'rahasia123'])->assertOk();
        $this->assertStringContainsString('Salam hormat, Ananda', $res->json('teks'));

        Sanctum::actingAs($this->sekolah->kepsek);
        $this->siapkan()->assertForbidden();
        $this->getJson('/api/akses-wa/riwayat')->assertForbidden();
    }
}

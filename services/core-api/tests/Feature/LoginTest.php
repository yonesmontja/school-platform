<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Login dan pengamannya: batas percobaan per akun+IP dan per akun, IP asli di balik proxy
 * tepercaya (Next.js/cloudflared), serta masa berlaku token.
 */
class LoginTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();
        $this->user = User::create(['name' => 'Guru', 'username' => 'guru.uji', 'password' => 'rahasia123', 'role' => 'guru', 'aktif' => true]);
    }

    /** Login dari alamat tertentu; $lewat = IP proxy yang meneruskan (tanpa proxy bila null). */
    private function login(string $password, string $ip = '203.0.113.10', ?string $lewat = null)
    {
        $server = $lewat ? ['REMOTE_ADDR' => $lewat, 'HTTP_X_FORWARDED_FOR' => $ip] : ['REMOTE_ADDR' => $ip];
        return $this->withServerVariables($server)->postJson('/api/login', ['login' => 'guru.uji', 'password' => $password]);
    }

    private function pesan($res): string
    {
        return (string) $res->json('errors.login.0');
    }

    public function test_login_berhasil_dengan_username(): void
    {
        $res = $this->login('rahasia123')->assertOk();
        $this->assertNotEmpty($res->json('access_token'));
        $this->assertNotNull($this->user->fresh()->login_terakhir);
    }

    public function test_sandi_salah_dan_akun_nonaktif_ditolak(): void
    {
        $this->assertSame('Email/username atau kata sandi salah.', $this->pesan($this->login('salah')->assertUnprocessable()));

        $this->user->update(['aktif' => false]);
        $this->assertStringContainsString('dinonaktifkan', $this->pesan($this->login('rahasia123')->assertUnprocessable()));
    }

    public function test_lima_kali_salah_dari_satu_ip_ditahan_tanpa_mengunci_ip_lain(): void
    {
        for ($i = 0; $i < 5; $i++) $this->login('salah');
        $this->assertStringContainsString('Terlalu banyak', $this->pesan($this->login('rahasia123')));

        // Pemilik akun dari perangkat lain tetap bisa masuk
        $this->login('rahasia123', '198.51.100.7')->assertOk();
    }

    public function test_dua_puluh_kali_salah_dari_banyak_ip_mengunci_akun(): void
    {
        for ($i = 1; $i <= 20; $i++) $this->login('salah', "198.51.100.$i");
        $this->assertStringContainsString('Terlalu banyak', $this->pesan($this->login('rahasia123', '192.0.2.99')));
    }

    public function test_ip_asli_dibaca_dari_proxy_tepercaya_saja(): void
    {
        // Lewat proxy Docker (jaringan privat): tiap pengguna dihitung dari IP aslinya
        for ($i = 0; $i < 5; $i++) $this->login('salah', '203.0.113.10', '172.18.0.5');
        $this->assertStringContainsString('Terlalu banyak', $this->pesan($this->login('rahasia123', '203.0.113.10', '172.18.0.5')));
        $this->login('rahasia123', '198.51.100.7', '172.18.0.5')->assertOk();

        // Dari alamat publik, X-Forwarded-For palsu diabaikan: tetap dihitung sebagai IP pengirim
        for ($i = 0; $i < 5; $i++) $this->login('salah', "192.0.2.$i", '198.51.100.200');
        $this->assertStringContainsString('Terlalu banyak', $this->pesan($this->login('rahasia123', '192.0.2.50', '198.51.100.200')));
    }

    public function test_token_kedaluwarsa_ditolak_dan_dibersihkan_saat_login(): void
    {
        $lama = $this->user->createToken('lama');
        $lama->accessToken->forceFill(['created_at' => now()->subDays(8)])->save();

        $this->withToken($lama->plainTextToken)->getJson('/api/me')->assertUnauthorized();

        $baru = $this->login('rahasia123')->assertOk()->json('access_token');
        $this->assertDatabaseMissing('personal_access_tokens', ['id' => $lama->accessToken->id]);

        $this->app['auth']->forgetGuards();
        $this->withToken($baru)->getJson('/api/me')->assertOk();
    }
}

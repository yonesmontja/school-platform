<?php

namespace App\Services;

use App\Models\CanvaToken;
use App\Models\SchoolSetting;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;
use RuntimeException;

/**
 * Canva Connect API (E3): sambungkan akun Canva tiap pengguna lewat OAuth 2.0 + PKCE, lalu daftar desain dan ekspor
 * desain menjadi PNG/JPG untuk dipakai sebagai aset Studio. Client ID & Client Secret milik integrasi Canva sekolah
 * diisi admin di Pengaturan (secret terenkripsi). Token per pengguna terenkripsi; refresh token Canva sekali pakai.
 */
class CanvaService
{
    public const OTORISASI = 'https://www.canva.com/api/oauth/authorize';
    public const API = 'https://api.canva.com/rest/v1';
    public const CAKUPAN = 'design:meta:read design:content:read profile:read';
    public const MAKS_HALAMAN = 10;

    public static function kredensial(): ?array
    {
        $s = SchoolSetting::first();
        return $s?->canva_client_id && $s?->canva_client_secret ? [$s->canva_client_id, $s->canva_client_secret] : null;
    }

    public static function redirectUri(string $asal): string
    {
        return rtrim($asal, '/') . '/api/video-belajar/canva/kembali';
    }

    /** URL otorisasi Canva; verifier PKCE & asal halaman disimpan 10 menit dengan kunci `state`. */
    public function urlSambung(int $idUser, string $asal): string
    {
        [$clientId] = self::kredensial() ?? throw new RuntimeException('Integrasi Canva belum diatur admin (Pengaturan → Canva).');
        $verifier = Str::random(96);
        $state = Str::random(40);
        Cache::put("canva_state_{$state}", ['id_user' => $idUser, 'verifier' => $verifier, 'asal' => $asal], now()->addMinutes(10));
        return self::OTORISASI . '?' . http_build_query([
            'code_challenge' => rtrim(strtr(base64_encode(hash('sha256', $verifier, true)), '+/', '-_'), '='),
            'code_challenge_method' => 'S256',
            'scope' => self::CAKUPAN,
            'response_type' => 'code',
            'client_id' => $clientId,
            'state' => $state,
            'redirect_uri' => self::redirectUri($asal),
        ], '', '&', PHP_QUERY_RFC3986);
    }

    /** Callback OAuth: tukar kode dengan token. Mengembalikan asal halaman untuk dialihkan kembali. */
    public function selesaikan(string $state, string $kode): string
    {
        $data = Cache::pull("canva_state_{$state}");
        if (!$data) throw new RuntimeException('Sesi penyambungan Canva kedaluwarsa. Ulangi dari Studio.');
        $token = $this->mintaToken(['grant_type' => 'authorization_code', 'code' => $kode, 'code_verifier' => $data['verifier'], 'redirect_uri' => self::redirectUri($data['asal'])]);
        $simpan = CanvaToken::updateOrCreate(['id_user' => $data['id_user']], $this->kolomToken($token));
        $nama = Http::withToken($simpan->access_token)->timeout(15)->get(self::API . '/users/me/profile')->json('profile.display_name');
        $simpan->update(['nama_canva' => $nama ? mb_substr($nama, 0, 150) : null]);
        return $data['asal'];
    }

    private function mintaToken(array $isi): array
    {
        [$id, $rahasia] = self::kredensial() ?? throw new RuntimeException('Integrasi Canva belum diatur admin.');
        $r = Http::asForm()->withBasicAuth($id, $rahasia)->timeout(20)->post(self::API . '/oauth/token', $isi);
        if (!$r->successful() || !$r->json('access_token')) {
            throw new RuntimeException('Canva menolak penyambungan: ' . ($r->json('error_description') ?? $r->json('message') ?? $r->json('error') ?? "HTTP {$r->status()}"));
        }
        return $r->json();
    }

    private function kolomToken(array $t): array
    {
        return ['access_token' => $t['access_token'], 'refresh_token' => $t['refresh_token'] ?? null, 'kedaluwarsa' => now()->addSeconds(max(60, (int) ($t['expires_in'] ?? 14400)) - 60)];
    }

    /** Token akses yang masih berlaku (diperbarui bila perlu; refresh token baru disimpan karena yang lama hangus). */
    public function token(int $idUser): string
    {
        $t = CanvaToken::where('id_user', $idUser)->first() ?? throw new RuntimeException('Akun Canva belum tersambung.');
        if ($t->kedaluwarsa && $t->kedaluwarsa->isFuture()) return $t->access_token;
        if (!$t->refresh_token) throw new RuntimeException('Sambungan Canva kedaluwarsa. Sambungkan ulang.');
        return Cache::lock("canva_segar_{$idUser}", 20)->block(15, function () use ($idUser) {
            $t = CanvaToken::where('id_user', $idUser)->firstOrFail();
            if ($t->kedaluwarsa && $t->kedaluwarsa->isFuture()) return $t->access_token;
            try {
                $baru = $this->mintaToken(['grant_type' => 'refresh_token', 'refresh_token' => $t->refresh_token]);
            } catch (RuntimeException $e) {
                $t->delete();
                throw new RuntimeException('Sambungan Canva kedaluwarsa. Sambungkan ulang.');
            }
            $t->update($this->kolomToken($baru));
            return $t->access_token;
        });
    }

    private function api(int $idUser)
    {
        return Http::withToken($this->token($idUser))->acceptJson()->timeout(25);
    }

    private static function galat($r): RuntimeException
    {
        $kode = $r->json('code') ?? $r->json('error.code');
        return new RuntimeException(match ($kode) {
            'too_many_requests' => 'Terlalu banyak permintaan ke Canva. Coba lagi sebentar lagi.',
            'license_required' => 'Fitur ini butuh lisensi Canva berbayar (mis. latar transparan).',
            'design_not_found' => 'Desain tidak ditemukan di akun Canva ini.',
            'permission_denied' => 'Akun Canva ini tidak punya akses ke desain tersebut.',
            default => 'Canva: ' . ($r->json('message') ?? "HTTP {$r->status()}"),
        });
    }

    public function daftarDesain(int $idUser, ?string $cari, ?string $lanjutan): array
    {
        $r = $this->api($idUser)->get(self::API . '/designs', array_filter([
            'query' => $cari ? mb_substr($cari, 0, 255) : null, 'continuation' => $lanjutan, 'limit' => 30,
            'sort_by' => $cari ? 'relevance' : 'modified_descending',
        ]));
        if (!$r->successful()) throw self::galat($r);
        return [
            'items' => collect($r->json('items') ?? [])->map(fn($d) => [
                'id' => $d['id'], 'judul' => $d['title'] ?? 'Tanpa judul', 'thumbnail' => $d['thumbnail']['url'] ?? null,
                'halaman' => $d['page_count'] ?? null, 'diubah' => $d['updated_at'] ?? null,
            ])->values()->all(),
            'lanjutan' => $r->json('continuation'),
        ];
    }

    /**
     * Ekspor desain ke PNG/JPG dan unduh per halaman (maks. 10). Mengembalikan isi biner tiap halaman.
     * @return array<int, string>
     */
    public function ekspor(int $idUser, string $idDesain, string $format, array $halaman, bool $transparan, bool $tegak = false): array
    {
        $fmt = match ($format) {
            'jpg' => ['type' => 'jpg', 'quality' => 90],
            // Video: satu MP4 untuk halaman terpilih (animasi Canva ikut), kualitas 1080p sesuai orientasi
            'mp4' => ['type' => 'mp4', 'quality' => ($tegak ? 'vertical' : 'horizontal') . '_1080p'],
            default => array_filter(['type' => 'png', 'transparent_background' => $transparan ?: null]),
        };
        if ($halaman) $fmt['pages'] = array_values(array_slice($halaman, 0, self::MAKS_HALAMAN));
        $r = $this->api($idUser)->post(self::API . '/exports', ['design_id' => $idDesain, 'format' => $fmt]);
        if (!$r->successful()) throw self::galat($r);
        $id = $r->json('job.id');
        $job = $r->json('job');
        for ($i = 0; $i < ($format === 'mp4' ? 75 : 30) && ($job['status'] ?? '') === 'in_progress'; $i++) {
            usleep(min(4000, 800 + $i * 300) * 1000);
            $c = $this->api($idUser)->get(self::API . "/exports/{$id}");
            if (!$c->successful()) throw self::galat($c);
            $job = $c->json('job');
        }
        if (($job['status'] ?? '') !== 'success') {
            throw new RuntimeException(($job['status'] ?? '') === 'failed'
                ? 'Ekspor Canva gagal: ' . ($job['error']['message'] ?? $job['error']['code'] ?? 'tanpa keterangan')
                : 'Ekspor Canva belum selesai. Coba lagi sebentar lagi.');
        }
        $hasil = [];
        foreach (array_slice($job['urls'] ?? [], 0, self::MAKS_HALAMAN) as $url) {
            if (!preg_match('#^https://[^/]+\.(canva\.com|canva-export\.com|canva\.cn|amazonaws\.com|cloudfront\.net)/#', $url)) {
                throw new RuntimeException('Alamat unduhan Canva tidak dikenal.');
            }
            $f = Http::timeout($format === 'mp4' ? 240 : 60)->withOptions(['stream' => false])->get($url);
            if (!$f->successful()) throw new RuntimeException('Gagal mengunduh hasil ekspor Canva.');
            $hasil[] = $f->body();
        }
        return $hasil;
    }

    public function putuskan(int $idUser): void
    {
        CanvaToken::where('id_user', $idUser)->delete();
    }
}

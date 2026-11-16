<?php

namespace Tests\Feature;

use App\Models\BankSoal;
use App\Models\MasterIndikator;
use App\Models\PaketSoalJawaban;
use App\Models\UjianSesi;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Laravel\Sanctum\Sanctum;
use Tests\Concerns\MembuatDataSekolah;
use Tests\TestCase;

/**
 * CBT/ANBK Tahap A: sesi ujian lintas kelas dengan token sesi (berganti otomatis), mode ujian (satu perangkat, log peristiwa,
 * kunci setelah batas pelanggaran), pantau pengawas (izinkan masuk ulang, tambah waktu, akhiri), kartu peserta,
 * dan koreksi/kirim nilai yang mencakup semua kelas sesi.
 */
class SesiUjianTest extends TestCase
{
    use RefreshDatabase, MembuatDataSekolah;

    private string $paket;
    private string $butir;
    private User $siswaB;

    protected function setUp(): void
    {
        parent::setUp();
        $this->buatSekolah();
        MasterIndikator::create(['id_indikator' => 'IND-1', 'id_materi' => 'MTR-T', 'deskripsi' => 'Pecahan senilai', 'urutan' => 1]);
        $soal = BankSoal::create([
            'id_soal' => 'SOAL-' . Str::uuid(), 'id_mapel' => 'MPL-A', 'id_materi' => 'MTR-T', 'id_indikator' => 'IND-1',
            'level_kognitif' => 'C2', 'tingkat_kesulitan' => 'SEDANG', 'dim_T' => 1, 'status' => 'DISETUJUI', 'sumber' => 'MANUAL',
            'dibuat_oleh' => $this->sekolah->guruA->id, 'skor_maks' => 1,
            'bentuk' => 'PG', 'pertanyaan' => '1/2 = ?', 'isi' => ['pilihan' => ['2/4', '1/3', '3/4']], 'kunci' => ['jawaban' => 0],
        ]);
        Sanctum::actingAs($this->sekolah->guruA);
        $this->paket = $this->postJson('/api/paket-soal', ['judul' => 'PTS Pecahan', 'id_mapel' => 'MPL-A', 'id_kelas' => 'KLS-A', 'id_jenis' => 'JNS-T', 'tanggal' => '2030-03-02'])->json('data.id_paket');
        $this->butir = (string) $this->postJson("/api/paket-soal/{$this->paket}/butir", ['id_soal' => [$soal->id_soal]])->json('data.butir.0.id');
        $this->siswaB = User::create(['name' => 'Dodi', 'username' => 'dodi_' . uniqid(), 'password' => 'rahasia123', 'role' => 'siswa', 'aktif' => true, 'id_siswa' => 'SIS-4']);
    }

    private function sebagai(User $user): static
    {
        Sanctum::actingAs($user);
        return $this;
    }

    private function sesi(array $extra = []): string
    {
        return $this->sebagai($this->sekolah->kepsek)->postJson('/api/sesi-ujian', $extra + [
            'nama' => 'PTS Matematika Sesi 1', 'id_paket' => $this->paket, 'kelas' => ['KLS-A', 'KLS-B'],
            'mulai' => now()->subMinutes(5)->toIso8601String(), 'selesai' => now()->addHours(2)->toIso8601String(),
            'durasi_menit' => 60, 'token' => 'abcd12', 'batas_pelanggaran' => 3, 'ruang' => 'Lab 1', 'id_pengawas' => 'GR-B',
        ])->assertCreated()->json('data.id_sesi');
    }

    public function test_sesi_lintas_kelas_token_perangkat_kunci_dan_izin_masuk_ulang(): void
    {
        $s = $this->sekolah;
        // Guru B bukan pemilik paket: tidak bisa membuat sesi; tetapi sebagai pengawas boleh memantau
        $this->sebagai($s->guruB)->postJson('/api/sesi-ujian', ['nama' => 'X', 'id_paket' => $this->paket, 'kelas' => ['KLS-B'], 'mulai' => now()->toIso8601String(), 'selesai' => now()->addHour()->toIso8601String()])->assertForbidden();
        $id = $this->sesi();

        // Siswa kelas lain (KLS-B) melihat paket lewat sesi walau paket untuk KLS-A dan tidak dibuka online
        $this->sebagai($this->siswaB)->getJson('/api/ujian')->assertOk()->assertJsonPath('data.0.id_paket', $this->paket)
            ->assertJsonPath('data.0.status', 'TERSEDIA')->assertJsonPath('data.0.butuh_token', true)->assertJsonPath('data.0.sesi.ruang', 'Lab 1');
        $this->postJson("/api/ujian/{$this->paket}/mulai", ['token' => 'salah', 'perangkat' => 'HP-1'])->assertUnprocessable();
        $this->postJson("/api/ujian/{$this->paket}/mulai", ['token' => 'ABCD12', 'perangkat' => 'HP-1'])->assertOk()
            ->assertJsonPath('data.status', 'MENGERJAKAN')->assertJsonPath('data.mode.layar_penuh', true)->assertJsonPath('data.mode.batas_pelanggaran', 3);
        $this->assertSame($id, PaketSoalJawaban::where('id_siswa', 'SIS-4')->value('id_sesi'));

        // Perangkat lain ditolak (423) dan soal tidak dikirim
        $this->postJson("/api/ujian/{$this->paket}/mulai", ['token' => 'ABCD12', 'perangkat' => 'HP-2'])->assertStatus(423);
        $this->getJson("/api/ujian/{$this->paket}?perangkat=HP-2")->assertOk()->assertJsonPath('data.status', 'TERKUNCI')->assertJsonMissingPath('data.soal');
        $this->putJson("/api/ujian/{$this->paket}/jawaban", ['perangkat' => 'HP-2', 'jawaban' => [$this->butir => 0]])->assertStatus(423);

        // Log peristiwa: 3 pelanggaran → terkunci
        $this->putJson("/api/ujian/{$this->paket}/jawaban", ['perangkat' => 'HP-1', 'jawaban' => [$this->butir => 0],
            'peristiwa' => [['jenis' => 'KELUAR_TAB'], ['jenis' => 'OFFLINE'], ['jenis' => 'ONLINE'], ['jenis' => 'KELUAR_LAYAR_PENUH']]])
            ->assertOk()->assertJsonPath('terkunci', false);
        $this->putJson("/api/ujian/{$this->paket}/jawaban", ['perangkat' => 'HP-1', 'peristiwa' => [['jenis' => 'KELUAR_TAB']]])->assertOk()->assertJsonPath('terkunci', true);
        $this->putJson("/api/ujian/{$this->paket}/jawaban", ['perangkat' => 'HP-1', 'jawaban' => [$this->butir => 1]])->assertStatus(423);
        $j = PaketSoalJawaban::where('id_siswa', 'SIS-4')->first();
        $this->assertSame(3, $j->pelanggaran);
        $this->assertSame(['MASUK', 'PERANGKAT_LAIN', 'KELUAR_TAB', 'OFFLINE', 'ONLINE', 'KELUAR_LAYAR_PENUH', 'KELUAR_TAB', 'TERKUNCI'], array_column($j->log, 'jenis'));

        // Pengawas (Guru B) memantau semua kelas; token tampil; siswa lain belum masuk
        $p = $this->sebagai($s->guruB)->getJson("/api/sesi-ujian/{$id}/pantau")->assertOk()
            ->assertJsonPath('token', 'ABCD12')->assertJsonPath('ringkasan.total', 4)->assertJsonPath('ringkasan.TERKUNCI', 1)->assertJsonPath('ringkasan.BELUM', 3)->json('data');
        $dodi = collect($p)->firstWhere('id_siswa', 'SIS-4');
        $this->assertSame('4B', $dodi['kelas']);
        $this->assertSame(1, $dodi['terjawab']);
        $this->sebagai($s->siswa)->getJson("/api/sesi-ujian/{$id}/pantau")->assertForbidden();

        // Izinkan masuk ulang di perangkat baru + tambah waktu 10 menit
        $sisaAwal = $dodi['sisa_detik'];
        $this->sebagai($s->guruB)->postJson("/api/sesi-ujian/{$id}/siswa/SIS-4/izinkan", ['tambah_menit' => 10])->assertOk();
        $lanjut = $this->sebagai($this->siswaB)->getJson("/api/ujian/{$this->paket}?perangkat=HP-2")->assertOk()->assertJsonPath('data.status', 'MENGERJAKAN')->json('data');
        $this->assertGreaterThan($sisaAwal + 500, $lanjut['sisa_detik']);
        $this->putJson("/api/ujian/{$this->paket}/jawaban", ['perangkat' => 'HP-2', 'jawaban' => [$this->butir => 0]])->assertOk();
        $this->assertSame('HP-2', PaketSoalJawaban::where('id_siswa', 'SIS-4')->value('perangkat'));
        $this->putJson("/api/ujian/{$this->paket}/jawaban", ['perangkat' => 'HP-1', 'jawaban' => [$this->butir => 0]])->assertStatus(423);

        // Log & akhiri oleh pengawas
        $this->sebagai($s->guruB)->getJson("/api/sesi-ujian/{$id}/siswa/SIS-4/log")->assertOk()->assertJsonPath('data.0.jenis', 'TAMBAH_WAKTU');
        $this->postJson("/api/sesi-ujian/{$id}/siswa/SIS-4/akhiri")->assertOk();
        $this->getJson("/api/sesi-ujian/{$id}/pantau")->assertJsonPath('ringkasan.SELESAI', 1);

        // Koreksi paket mencakup siswa dari semua kelas sesi
        $this->sebagai($s->guruA)->getJson("/api/paket-soal/{$this->paket}/jawaban")->assertOk()->assertJsonCount(4, 'siswa')->assertJsonPath('lintas_kelas', true);

        // Kartu peserta: username akun siswa, tanpa sandi
        $kartu = $this->sebagai($s->kepsek)->getJson("/api/sesi-ujian/{$id}/kartu")->assertOk()->assertJsonCount(4, 'peserta')->json();
        $this->assertSame($this->siswaB->username, collect($kartu['peserta'])->firstWhere('nama_siswa', 'Dodi')['username']);
        $this->assertStringNotContainsString('password', json_encode($kartu));

        // Sesi yang sudah dikerjakan tidak bisa dihapus
        $this->deleteJson("/api/sesi-ujian/{$id}")->assertStatus(422);
    }

    public function test_token_berganti_otomatis_dan_daftar_sesi_per_peran(): void
    {
        $s = $this->sekolah;
        $id = $this->sesi(['token_ganti_menit' => 15, 'kelas' => ['KLS-A']]);
        $sesi = UjianSesi::find($id);
        $token = $sesi->tokenPada();
        $this->assertMatchesRegularExpression('/^[A-Z2-9]{6}$/', $token);
        $this->assertNotSame('ABCD12', $token);
        $this->assertSame($token, $this->getJson("/api/sesi-ujian/{$id}")->json('data.token'));
        $this->assertTrue($sesi->tokenSah(strtolower($token)));
        $this->assertTrue($sesi->tokenSah($sesi->tokenPada(now()->subMinutes(15)))); // token selang sebelumnya masih diterima
        $this->assertFalse($sesi->tokenSah($sesi->tokenPada(now()->subMinutes(30))));
        $this->assertFalse($sesi->tokenSah('ABCD12'));

        $this->sebagai($s->siswa)->postJson("/api/ujian/{$this->paket}/mulai", ['token' => $token, 'perangkat' => 'HP-A'])->assertOk();
        // Siswa kelas di luar sesi tidak melihat paket
        $this->sebagai($this->siswaB)->getJson('/api/ujian')->assertJsonCount(0, 'data');
        $this->getJson("/api/ujian/{$this->paket}")->assertNotFound();

        // Daftar sesi: pengelola semua, guru pemilik paket & pengawas melihatnya, token dasar tidak bocor di daftar
        $this->sebagai($s->guruA)->getJson('/api/sesi-ujian')->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.jumlah_mulai', 1)->assertJsonMissingPath('data.0.token');
        $this->sebagai($s->guruB)->getJson('/api/sesi-ujian')->assertJsonCount(1, 'data');
        $this->sebagai($s->kepsek)->getJson('/api/sesi-ujian/referensi')->assertOk()->assertJsonPath('paket.0.id_paket', $this->paket);
    }
}

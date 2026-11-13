<?php

namespace Tests\Feature;

use App\Models\MasterKategoriPenilaian;
use App\Models\TransJadwal;
use App\Models\TransJurnal;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\Concerns\MembuatDataSekolah;
use Tests\TestCase;

/**
 * Hak akses per peran: rute khusus admin/kepsek, batas guru (mapel diampu, kelas binaan,
 * data milik sendiri), dan portal siswa yang hanya melihat datanya sendiri.
 */
class AksesPeranTest extends TestCase
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

    public function test_rute_khusus_peran_menolak_peran_lain(): void
    {
        $s = $this->sekolah;
        $this->sebagai($s->siswa)->getJson('/api/students')->assertForbidden();
        $this->sebagai($s->guruA)->postJson('/api/students', [])->assertForbidden();
        $this->sebagai($s->guruA)->postJson('/api/settings', [])->assertForbidden();
        $this->sebagai($s->guruA)->getJson('/api/portal/anak')->assertForbidden();
        $this->sebagai($s->kepsek)->postJson('/api/teachers', [])->assertForbidden();
        $this->sebagai($s->kepsek)->getJson('/api/users')->assertForbidden();
    }

    public function test_rute_terbuka_untuk_peran_yang_berhak(): void
    {
        $s = $this->sekolah;
        $this->sebagai($s->admin)->getJson('/api/users')->assertOk();
        $this->sebagai($s->guruA)->getJson('/api/students')->assertOk();
        $this->sebagai($s->siswa)->getJson('/api/settings')->assertOk();
    }

    public function test_akun_nonaktif_ditolak(): void
    {
        $nonaktif = User::create(['name' => 'Lama', 'username' => 'lama', 'password' => 'rahasia123', 'role' => 'guru', 'id_guru' => 'GR-A', 'aktif' => false]);
        $this->sebagai($nonaktif)->getJson('/api/me')->assertUnauthorized();
    }

    public function test_ruangan_dikelola_admin_dan_kepsek_saja(): void
    {
        $this->sebagai($this->sekolah->kepsek)->postJson('/api/ruangan', ['nama_ruangan' => 'Lab Tes'])->assertSuccessful();
        $this->sebagai($this->sekolah->guruA)->postJson('/api/ruangan', ['nama_ruangan' => 'Lab Lain'])->assertForbidden();
    }

    public function test_guru_hanya_menilai_mapel_yang_diampu(): void
    {
        $res = $this->sebagai($this->sekolah->guruA)->getJson('/api/nilai/filters')->assertOk();
        $mapel = collect($res->json('subjects') ?? $res->json('data.subjects'))->pluck('id_mapel')->all();
        $this->assertSame(['MPL-A'], $mapel);

        $this->getJson('/api/nilai/students?' . http_build_query(['id_mapel' => 'MPL-B', 'tanggal' => '2030-01-05'] + $this->sekolah->meta))
            ->assertForbidden();
    }

    public function test_saran_parameter_nilai_dari_jadwal_guru_hari_ini(): void
    {
        $this->travelTo(now(config('app.zona_sekolah'))->setTime(9, 0));
        $hari = now(config('app.zona_sekolah'))->toDateString();
        $sesi = fn($id, $kelas, $mulai, $selesai, $materi = null) => TransJadwal::create([
            'id_jadwal' => $id, 'id_periode' => 'PER-T', 'id_kelas' => $kelas, 'id_guru' => 'GR-A', 'id_mapel' => 'MPL-A',
            'id_materi' => $materi, 'judul' => 'Matematika', 'mulai' => "{$hari} {$mulai}", 'selesai' => "{$hari} {$selesai}",
        ]);
        $sesi('JDW-1', 'KLS-B', '07:00', '08:00');
        $sesi('JDW-2', 'KLS-A', '08:30', '09:30', 'MTR-T');
        $sesi('JDW-3', 'KLS-B', '10:00', '11:00');

        // Sesi yang sedang berjalan diutamakan
        $saran = $this->sebagai($this->sekolah->guruA)->getJson('/api/nilai/filters')->json('saran');
        $this->assertSame(['id_kelas' => 'KLS-A', 'id_mapel' => 'MPL-A', 'id_materi' => 'MTR-T', 'mulai' => '08:30'], $saran);

        // Guru tanpa jadwal hari ini dan akun tanpa data guru tidak mendapat saran
        $this->assertNull($this->sebagai($this->sekolah->guruB)->getJson('/api/nilai/filters')->json('saran'));
        $this->assertNull($this->sebagai($this->sekolah->admin)->getJson('/api/nilai/filters')->json('saran'));
    }

    public function test_guru_hanya_mengelola_kelas_binaan(): void
    {
        $s = $this->sekolah;
        $this->sebagai($s->guruA)->getJson("/api/rapor/data?id_kelas=KLS-A&id_periode={$s->periode}")->assertOk();
        $this->getJson("/api/rapor/data?id_kelas=KLS-B&id_periode={$s->periode}")->assertForbidden();
        $this->getJson("/api/p5?id_kelas=KLS-A&id_periode={$s->periode}")->assertOk();
        $this->getJson("/api/p5?id_kelas=KLS-B&id_periode={$s->periode}")->assertForbidden();
        $this->deleteJson('/api/presensi/tanggal', ['id_kelas' => 'KLS-A', 'tanggal' => '2020-01-01'])->assertOk();
        $this->deleteJson('/api/presensi/tanggal', ['id_kelas' => 'KLS-B', 'tanggal' => '2020-01-01'])->assertForbidden();

        $this->sebagai($s->kepsek)->getJson("/api/rapor/data?id_kelas=KLS-B&id_periode={$s->periode}")->assertOk();
    }

    public function test_guru_hanya_mengubah_jadwal_miliknya(): void
    {
        $s = $this->sekolah;
        $sendiri = $this->sebagai($s->guruA)->postJson('/api/jadwal', [
            'judul' => 'Tes', 'mulai' => '2030-01-07T08:00', 'selesai' => '2030-01-07T09:00', 'pola' => 'sekali', 'id_guru' => 'GR-B',
        ])->assertCreated();
        // id_guru kiriman guru diabaikan: jadwal selalu milik guru itu sendiri
        $this->assertSame('GR-A', $sendiri->json('data.0.id_guru'));

        $milikLain = $this->sebagai($s->kepsek)->postJson('/api/jadwal', [
            'judul' => 'Lain', 'mulai' => '2030-01-08T08:00', 'selesai' => '2030-01-08T09:00', 'pola' => 'sekali', 'id_guru' => 'GR-B',
        ])->assertCreated()->json('data.0.id_jadwal');

        $this->sebagai($s->guruA)->patchJson("/api/jadwal/$milikLain/status", ['status_sesi' => 'Selesai'])->assertForbidden();
        $this->deleteJson("/api/jadwal/$milikLain")->assertForbidden();
        $this->deleteJson('/api/jadwal/' . $sendiri->json('data.0.id_jadwal'))->assertOk();
    }

    public function test_guru_tidak_bisa_menghapus_jurnal_guru_lain(): void
    {
        TransJurnal::unguarded(fn () => TransJurnal::create([
            'id_jurnal' => 'JRN-T', 'tanggal' => '2030-01-07', 'id_siswa' => 'SIS-4', 'id_kelas' => 'KLS-B', 'id_guru' => 'GR-B', 'narasi_kejadian' => 'Membantu teman',
        ]));
        $this->sebagai($this->sekolah->guruA)->deleteJson('/api/jurnal/JRN-T')->assertForbidden();
        $this->assertDatabaseHas('trans_jurnal', ['id_jurnal' => 'JRN-T']);
    }

    public function test_guru_menambah_dan_mengubah_materi_mapel_diampu_tanpa_bisa_menghapus(): void
    {
        MasterKategoriPenilaian::create(['id_kategori' => 'KTG-T', 'nama_kategori' => 'Pengetahuan']);
        $materi = fn (string $mapel, string $nama) => [
            'id_mapel' => $mapel, 'id_kelas' => 'KLS-A', 'id_periode' => 'PER-T', 'id_kategori' => 'KTG-T', 'nama_materi' => $nama,
            'mat_S' => 0.2, 'mat_T' => 0.2, 'mat_N' => 0.2, 'mat_K' => 0.2, 'mat_M' => 0.2,
        ];

        $this->sebagai($this->sekolah->guruA)->postJson('/api/materi', $materi('MPL-A', 'Desimal'))->assertCreated();
        $this->putJson('/api/materi/MTR-T', $materi('MPL-A', 'Pecahan Campuran'))->assertOk();
        $this->assertDatabaseHas('master_materi', ['id_materi' => 'MTR-T', 'nama_materi' => 'Pecahan Campuran']);

        // Mapel yang tidak diampu: tidak boleh ditambah, dan materi MPL-A tidak boleh dipindah ke sana
        $this->postJson('/api/materi', $materi('MPL-B', 'Ekosistem'))->assertForbidden();
        $this->putJson('/api/materi/MTR-T', $materi('MPL-B', 'Pindah'))->assertForbidden();
        $this->sebagai($this->sekolah->guruB)->putJson('/api/materi/MTR-T', $materi('MPL-B', 'Ambil'))->assertForbidden();

        $this->sebagai($this->sekolah->guruA)->deleteJson('/api/materi/MTR-T')->assertForbidden();
        $this->sebagai($this->sekolah->kepsek)->deleteJson('/api/materi/MTR-T')->assertForbidden();
        $this->sebagai($this->sekolah->admin)->deleteJson('/api/materi/MTR-T')->assertOk();
    }

    public function test_referensi_lain_tetap_hanya_dibaca_guru(): void
    {
        $this->sebagai($this->sekolah->guruA)->getJson('/api/kategori-penilaian')->assertOk();
        $this->getJson('/api/mbk')->assertOk();
        $this->postJson('/api/kategori-penilaian', ['nama_kategori' => 'X'])->assertForbidden();
        $this->putJson('/api/mbk/JNS-T', ['kategori_penilaian' => 'X'])->assertForbidden();
        $this->postJson('/api/periodes', [])->assertForbidden();
    }

    public function test_portal_siswa_hanya_melihat_data_sendiri(): void
    {
        $s = $this->sekolah;
        $this->sebagai($s->siswa)->getJson('/api/portal/anak')->assertOk();
        $this->getJson("/api/portal/rapor?id_siswa=SIS-1&id_periode={$s->periode}")->assertOk();
        $this->getJson("/api/portal/rapor?id_siswa=SIS-4&id_periode={$s->periode}")->assertForbidden();
    }

    public function test_admin_membuat_akun_guru_massal(): void
    {
        $this->sebagai($this->sekolah->admin)->postJson('/api/users/generate', ['jenis' => 'guru'])->assertOk();
        // GR-A & GR-B sudah punya akun di data uji, jadi tidak boleh dibuat ganda
        $this->assertSame(1, User::where('id_guru', 'GR-A')->where('aktif', true)->count());
    }

    public function test_peninjau_melihat_semua_menu_tanpa_bisa_mengubah(): void
    {
        foreach (User::PENINJAU as $peran) {
            $u = User::factory()->create(['role' => $peran, 'username' => "uji.$peran", 'aktif' => true]);
            $this->sebagai($u);

            // Membaca rute milik admin & kepala sekolah serta data seluruh kelas
            $this->getJson('/api/users')->assertOk();
            $this->getJson('/api/pemakaian')->assertOk();
            $this->getJson('/api/me')->assertOk()->assertJsonPath('data.peninjau', true);
            $this->getJson('/api/log-aktivitas')->assertOk();
            // Portal siswa/ortu bukan untuk peninjau
            $this->getJson('/api/portal/anak')->assertForbidden();

            // Setiap perubahan ditolak, termasuk rute admin dan rute guru
            $this->postJson('/api/hari-libur', ['tanggal' => '2030-01-07', 'nama' => 'Uji'])->assertForbidden()
                ->assertJsonPath('message', 'Akun peninjau hanya dapat melihat data. Perubahan tidak disimpan.');
            $this->putJson("/api/users/{$u->id}", ['name' => 'X', 'role' => 'admin', 'username' => 'x', 'aktif' => true])->assertForbidden();
            $this->postJson('/api/nilai/batch', [])->assertForbidden();
            $this->postJson('/api/users/generate', ['jenis' => 'guru'])->assertForbidden();
            $this->assertSame($peran, $u->fresh()->role);

            // Urusan akun sendiri tetap boleh
            $this->assertNotSame(403, $this->postJson('/api/notifikasi/baca', ['kunci' => ['x']])->status());
            $this->assertNotSame(403, $this->postJson('/api/akun/password', ['password_lama' => 'salah', 'password' => 'SandiBaru2026', 'password_confirmation' => 'SandiBaru2026'])->status());
        }
    }

    public function test_kata_sandi_baru_dari_admin_dikembalikan_sekali_untuk_surat_akun(): void
    {
        $guru = $this->sekolah->guruA;
        $data = ['name' => $guru->name, 'role' => 'guru', 'id_guru' => $guru->id_guru, 'username' => 'guru.surat', 'email' => null, 'aktif' => true];

        // Ubah tanpa kata sandi: tidak ada kredensial
        $this->sebagai($this->sekolah->admin)->putJson("/api/users/{$guru->id}", $data)->assertOk()->assertJsonMissingPath('kredensial');

        // Kata sandi baru tanpa wajib ganti: kredensial memuat peran dan status wajib ganti
        $this->putJson("/api/users/{$guru->id}", $data + ['password' => 'sandiBaru2026', 'wajib_ganti_password' => false])->assertOk()
            ->assertJsonPath('kredensial.login', 'guru.surat')
            ->assertJsonPath('kredensial.password', 'sandiBaru2026')
            ->assertJsonPath('kredensial.role', 'guru')
            ->assertJsonPath('kredensial.wajib_ganti_password', false);

        $this->postJson("/api/users/{$guru->id}/reset-password")->assertOk()->assertJsonPath('kredensial.wajib_ganti_password', true);
        $this->postJson('/api/users/generate', ['jenis' => 'siswa'])->assertOk()
            ->assertJsonPath('kredensial.0.role', 'siswa')->assertJsonPath('kredensial.0.wajib_ganti_password', true);
    }
}

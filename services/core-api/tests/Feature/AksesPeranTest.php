<?php

namespace Tests\Feature;

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
}

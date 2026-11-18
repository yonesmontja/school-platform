<?php

namespace Tests\Feature;

use App\Models\LogAktivitas;
use App\Models\OperatorSekolah;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Route;
use Laravel\Sanctum\Sanctum;
use Tests\Concerns\MembuatDataSekolah;
use Tests\TestCase;

/** Fase 26 Tahap A: operator administrasi ditunjuk kepala sekolah dan hanya membuka submodul yang diberikan. */
class AdministrasiTest extends TestCase
{
    use RefreshDatabase, MembuatDataSekolah;

    private User $operator;

    protected function setUp(): void
    {
        parent::setUp();
        $this->buatSekolah();
        $this->operator = User::create(['name' => 'Staf TU', 'username' => 'staf.tu', 'password' => 'rahasia123', 'role' => 'operator', 'aktif' => true]);
        // Rute contoh submodul (Tahap B–E nanti memakai pola yang sama)
        Route::middleware(['api', 'auth:sanctum', 'role', 'administrasi:SURAT'])->get('/api/uji-administrasi-surat', fn() => ['ok' => true]);
    }

    public function test_kepsek_menunjuk_guru_dan_guru_hanya_mendapat_submodul_yang_dicentang(): void
    {
        Sanctum::actingAs($this->sekolah->kepsek);
        $this->getJson('/api/administrasi/kandidat')->assertOk()
            ->assertJsonFragment(['username' => 'staf.tu'])
            ->assertJsonMissing(['role' => 'admin'])->assertJsonMissing(['role' => 'siswa']);
        $id = $this->postJson('/api/administrasi/operator', ['id_user' => $this->sekolah->guruA->id, 'submodul' => ['SURAT', 'SPMB', 'SURAT'], 'catatan' => 'Urusan surat'])
            ->assertCreated()->json('data.id');
        // Duplikat dibuang, urutan mengikuti daftar resmi
        $this->assertSame(['SPMB', 'SURAT'], OperatorSekolah::find($id)->submodul);

        Sanctum::actingAs(User::find($this->sekolah->guruA->id));
        $this->getJson('/api/me')->assertJsonPath('data.administrasi', ['SPMB', 'SURAT']);
        $r = $this->getJson('/api/administrasi')->assertOk()->assertJsonPath('data.kelola_operator', false)
            ->assertJsonPath('data.penunjukan.catatan', 'Urusan surat');
        $this->assertSame(['SPMB', 'SURAT'], collect($r->json('data.submodul'))->where('boleh', true)->pluck('kode')->all());
        $this->getJson('/api/uji-administrasi-surat')->assertOk();
        $this->postJson('/api/administrasi/operator', ['id_user' => $this->operator->id, 'submodul' => ['SPMB']])->assertForbidden();
        $this->getJson('/api/administrasi/operator')->assertForbidden();

        // Guru lain tanpa penunjukan tidak punya menu administrasi
        Sanctum::actingAs($this->sekolah->guruB);
        $this->getJson('/api/me')->assertJsonPath('data.administrasi', []);
        $this->getJson('/api/administrasi')->assertForbidden();
        $this->getJson('/api/uji-administrasi-surat')->assertForbidden();
    }

    public function test_akun_operator_hanya_membuka_administrasi_yang_diberikan(): void
    {
        Sanctum::actingAs($this->operator);
        $this->getJson('/api/me')->assertOk()->assertJsonPath('data.administrasi', []);
        $this->getJson('/api/administrasi')->assertForbidden();
        // Menu pembelajaran tertutup; urusan akun sendiri tetap jalan
        $this->getJson('/api/classes')->assertForbidden();
        $this->getJson('/api/notifikasi')->assertOk();
        $this->getJson('/api/panduan/kerja')->assertOk();

        OperatorSekolah::create(['id_user' => $this->operator->id, 'submodul' => ['INVENTARIS'], 'ditunjuk_oleh' => $this->sekolah->kepsek->id]);
        Sanctum::actingAs(User::find($this->operator->id));
        $this->getJson('/api/administrasi')->assertOk();
        $this->getJson('/api/uji-administrasi-surat')->assertForbidden();
        $this->getJson('/api/classes')->assertForbidden();
    }

    public function test_hanya_kepsek_yang_menunjuk_admin_dan_peninjau_hanya_melihat(): void
    {
        $peninjau = User::create(['name' => 'Yayasan', 'username' => 'yayasan.uji', 'password' => 'rahasia123', 'role' => 'yayasan', 'aktif' => true]);
        foreach ([$this->sekolah->admin, $peninjau] as $akun) {
            Sanctum::actingAs($akun);
            $this->getJson('/api/administrasi')->assertOk()->assertJsonPath('data.lihat_operator', true)->assertJsonPath('data.kelola_operator', false);
            $this->getJson('/api/administrasi/operator')->assertOk();
            $this->postJson('/api/administrasi/operator', ['id_user' => $this->operator->id, 'submodul' => ['SPMB']])->assertForbidden();
            $this->getJson('/api/uji-administrasi-surat')->assertOk();
        }
        // Akun portal tidak pernah punya administrasi
        Sanctum::actingAs($this->sekolah->siswa);
        $this->getJson('/api/administrasi')->assertForbidden();
        $this->getJson('/api/me')->assertJsonPath('data.administrasi', []);
    }

    public function test_validasi_penunjukan(): void
    {
        Sanctum::actingAs($this->sekolah->kepsek);
        $this->postJson('/api/administrasi/operator', ['id_user' => $this->sekolah->admin->id, 'submodul' => ['SPMB']])->assertUnprocessable()->assertJsonValidationErrors('id_user');
        $this->postJson('/api/administrasi/operator', ['id_user' => $this->sekolah->siswa->id, 'submodul' => ['SPMB']])->assertUnprocessable();
        $this->postJson('/api/administrasi/operator', ['id_user' => $this->operator->id, 'submodul' => []])->assertUnprocessable()->assertJsonValidationErrors('submodul');
        $this->postJson('/api/administrasi/operator', ['id_user' => $this->operator->id, 'submodul' => ['GAJI']])->assertUnprocessable()->assertJsonValidationErrors('submodul.0');

        $this->operator->update(['aktif' => false]);
        $this->postJson('/api/administrasi/operator', ['id_user' => $this->operator->id, 'submodul' => ['SPMB']])->assertUnprocessable();
        $this->operator->update(['aktif' => true]);

        $this->postJson('/api/administrasi/operator', ['id_user' => $this->operator->id, 'submodul' => ['SPMB']])->assertCreated();
        $this->postJson('/api/administrasi/operator', ['id_user' => $this->operator->id, 'submodul' => ['SURAT']])->assertUnprocessable()->assertJsonValidationErrors('id_user');
        $this->getJson('/api/administrasi/kandidat')->assertOk()->assertJsonMissing(['username' => 'staf.tu']);
    }

    public function test_ubah_dan_cabut_tercatat_di_log_aktivitas(): void
    {
        Sanctum::actingAs($this->sekolah->kepsek);
        $id = $this->postJson('/api/administrasi/operator', ['id_user' => $this->operator->id, 'submodul' => ['SPMB']])->json('data.id');
        $this->putJson("/api/administrasi/operator/{$id}", ['submodul' => ['KEUANGAN', 'SPMB']])->assertOk()->assertJsonPath('data.submodul', ['SPMB', 'KEUANGAN']);
        $this->deleteJson("/api/administrasi/operator/{$id}")->assertOk();
        $this->assertDatabaseMissing('operator_sekolah', ['id' => $id]);

        $log = LogAktivitas::with('perubahan')->where('modul', 'Administrasi')->orderBy('id')->get();
        $this->assertSame(['TAMBAH', 'UBAH', 'HAPUS'], $log->pluck('aksi')->unique()->values()->all());
        $this->assertSame('Menunjuk operator administrasi', $log->firstWhere('aksi', 'TAMBAH')->deskripsi);
        $this->assertSame('Staf TU', $log->firstWhere('aksi', 'TAMBAH')->perubahan->first()->label);

        Sanctum::actingAs(User::find($this->operator->id));
        $this->getJson('/api/me')->assertJsonPath('data.administrasi', []);
    }
}

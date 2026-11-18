<?php

namespace Tests\Feature;

use App\Models\LogAktivitas;
use App\Models\MasterOrtu;
use App\Models\OperatorSekolah;
use App\Models\SpmbGelombang;
use App\Models\SpmbPendaftar;
use App\Models\Student;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\Concerns\MembuatDataSekolah;
use Tests\TestCase;

/** Fase 26 Tahap B: SPMB daring dari formulir publik sampai menjadi siswa + orang tua. */
class SpmbTest extends TestCase
{
    use RefreshDatabase, MembuatDataSekolah;

    private User $operator;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('local');
        $this->buatSekolah();
        $this->operator = User::create(['name' => 'Staf SPMB', 'username' => 'staf.spmb', 'password' => 'rahasia123', 'role' => 'operator', 'aktif' => true]);
        OperatorSekolah::create(['id_user' => $this->operator->id, 'submodul' => ['SPMB'], 'ditunjuk_oleh' => $this->sekolah->kepsek->id]);
    }

    private function gelombang(array $lain = []): SpmbGelombang
    {
        return SpmbGelombang::create($lain + [
            'nama' => 'Gelombang 1', 'tahun_ajaran' => '2027/2028', 'tgl_buka' => now()->subDay()->toDateString(),
            'tgl_tutup' => now()->addWeek()->toDateString(), 'berkas_wajib' => ['AKTA', 'KK'],
        ]);
    }

    private function daftar(SpmbGelombang $g, array $lain = []): array
    {
        return $this->postJson('/api/spmb/daftar', $lain + [
            'id_gelombang' => $g->id, 'nama_siswa' => 'Yohana Pigai', 'jenis_kelamin' => 'P', 'tempat_lahir' => 'Nabire',
            'tgl_lahir' => '2020-03-04', 'alamat' => 'Jl. Merdeka 1, Nabire', 'nama_ibu' => 'Maria Pigai', 'no_wa' => '081234567890',
        ])->assertCreated()->json('data');
    }

    /** PNG 1×1 sungguhan (container tanpa GD, jadi tidak memakai fake()->image). */
    private function foto(string $nama): UploadedFile
    {
        return UploadedFile::fake()->createWithContent($nama, base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='));
    }

    private function akses(array $d): array
    {
        return ['nomor_daftar' => $d['nomor_daftar'], 'kode_akses' => $d['kode_akses']];
    }

    public function test_alur_lengkap_dari_formulir_sampai_menjadi_siswa(): void
    {
        $g = $this->gelombang();
        $this->getJson('/api/spmb/info')->assertOk()->assertJsonPath('data.gelombang.0.buka', true)->assertJsonPath('data.gelombang.0.berkas_wajib', ['AKTA', 'KK']);

        $d = $this->daftar($g);
        $this->assertSame('SPMB-2027-0001', $d['nomor_daftar']);
        $this->assertSame(6, strlen($d['kode_akses']));
        $this->postJson('/api/spmb/status', ['nomor_daftar' => $d['nomor_daftar'], 'kode_akses' => 'SALAH1'])->assertUnprocessable();
        $a = $this->akses($d);
        // Nomor ditulis huruf kecil tetap dikenali
        $this->postJson('/api/spmb/status', ['nomor_daftar' => strtolower($d['nomor_daftar']), 'kode_akses' => strtolower($d['kode_akses'])])
            ->assertOk()->assertJsonPath('data.status', 'DIAJUKAN')->assertJsonMissingPath('data.kode_akses');

        $this->post('/api/spmb/berkas', $a + ['jenis' => 'AKTA', 'berkas' => $this->foto('akta.png')], ['Accept' => 'application/json'])->assertCreated();
        $this->post('/api/spmb/berkas', $a + ['jenis' => 'KK', 'berkas' => UploadedFile::fake()->create('kk.txt', 2, 'text/plain')], ['Accept' => 'application/json'])->assertUnprocessable();
        $this->post('/api/spmb/berkas', $a + ['jenis' => 'KK', 'berkas' => $this->foto('kk.png')], ['Accept' => 'application/json'])->assertCreated();

        // Operator: berkas belum disahkan → belum bisa terverifikasi; minta perbaikan
        Sanctum::actingAs($this->operator);
        $id = SpmbPendaftar::where('nomor_daftar', $d['nomor_daftar'])->value('id');
        $berkas = collect($this->getJson("/api/administrasi/spmb/pendaftar/{$id}")->assertOk()->assertJsonMissingPath('data.berkas.0.path')->json('data.berkas'));
        $this->postJson("/api/administrasi/spmb/pendaftar/{$id}/verifikasi", ['keputusan' => 'TERVERIFIKASI'])->assertUnprocessable()->assertJsonValidationErrors('keputusan');
        $this->get("/api/administrasi/spmb/berkas/{$berkas[0]['id']}")->assertOk();
        $this->postJson("/api/administrasi/spmb/pendaftar/{$id}/verifikasi", [
            'keputusan' => 'PERLU_PERBAIKAN', 'catatan' => 'Tanggal lahir berbeda dengan akta.',
            'berkas' => [['id' => $berkas[0]['id'], 'status' => 'SAH'], ['id' => $berkas[1]['id'], 'status' => 'SAH']],
        ])->assertOk();

        // Pendaftar memperbaiki lalu mengirim ulang
        $this->app['auth']->forgetGuards();
        $this->postJson('/api/spmb/status', $a)->assertJsonPath('data.status', 'PERLU_PERBAIKAN')->assertJsonPath('data.catatan_verifikasi', 'Tanggal lahir berbeda dengan akta.');
        $this->putJson('/api/spmb/data', $a + ['tgl_lahir' => '2020-04-03'])->assertOk()->assertJsonPath('data.data.tgl_lahir', '2020-04-03');
        $this->postJson('/api/spmb/ajukan-ulang', $a)->assertOk()->assertJsonPath('data.status', 'DIAJUKAN');

        Sanctum::actingAs($this->operator);
        $this->postJson("/api/administrasi/spmb/pendaftar/{$id}/verifikasi", ['keputusan' => 'TERVERIFIKASI'])->assertOk();
        $this->postJson("/api/administrasi/spmb/pendaftar/{$id}/hasil", ['hasil' => 'DITERIMA', 'skor' => 88])->assertOk();

        // Hasil belum terlihat sebelum diumumkan; data tidak bisa diubah lagi
        $this->app['auth']->forgetGuards();
        $this->postJson('/api/spmb/status', $a)->assertJsonPath('data.status', 'TERVERIFIKASI')->assertJsonPath('data.boleh_daftar_ulang', false);
        $this->putJson('/api/spmb/data', $a + ['nama_siswa' => 'Ganti'])->assertUnprocessable();
        $this->postJson('/api/spmb/daftar-ulang', $a)->assertUnprocessable();

        Sanctum::actingAs($this->operator);
        $this->postJson("/api/administrasi/spmb/gelombang/{$g->id}/umumkan", ['umumkan' => true])->assertOk();

        $this->app['auth']->forgetGuards();
        $this->postJson('/api/spmb/status', $a)->assertJsonPath('data.status', 'DITERIMA')->assertJsonPath('data.boleh_daftar_ulang', true);
        $this->postJson('/api/spmb/daftar-ulang', $a)->assertOk()->assertJsonPath('data.status', 'DAFTAR_ULANG');

        Sanctum::actingAs($this->operator);
        $idSiswa = $this->postJson("/api/administrasi/spmb/pendaftar/{$id}/selesaikan", ['id_kelas' => 'KLS-A'])->assertOk()->json('data.id_siswa');
        $siswa = Student::with('ortu')->find($idSiswa);
        $this->assertSame('Yohana Pigai', $siswa->nama_siswa);
        $this->assertSame('KLS-A', $siswa->id_kelas);
        $this->assertSame('2020-04-03', $siswa->tgl_lahir);
        $this->assertSame('Maria Pigai', $siswa->ortu->nama_ibu);
        $this->assertSame('SELESAI', SpmbPendaftar::find($id)->status);
        $this->postJson("/api/administrasi/spmb/pendaftar/{$id}/selesaikan")->assertUnprocessable();

        // Lupa kode akses: operator membuat kode baru, kode lama tidak berlaku
        $kodeBaru = $this->postJson("/api/administrasi/spmb/pendaftar/{$id}/kode-baru")->assertOk()->json('data.kode_akses');
        $this->app['auth']->forgetGuards();
        $this->postJson('/api/spmb/status', $a)->assertUnprocessable();
        $this->postJson('/api/spmb/status', ['nomor_daftar' => $d['nomor_daftar'], 'kode_akses' => $kodeBaru])->assertOk()->assertJsonPath('data.status', 'SELESAI');
        Sanctum::actingAs($this->operator);

        // Log: aksi pendaftar tanpa akun + aksi operator, modul SPMB; kode akses tidak tercatat
        $log = LogAktivitas::with('perubahan')->where('modul', 'SPMB')->get();
        $this->assertTrue($log->contains(fn($l) => $l->user_id === null && str_contains($l->deskripsi, 'Formulir SPMB dikirim')));
        $this->assertTrue($log->contains(fn($l) => $l->user_id === $this->operator->id && $l->deskripsi === 'Menyelesaikan daftar ulang SPMB menjadi siswa'));
        $this->assertFalse($log->flatMap->perubahan->contains(fn($p) => array_key_exists('kode_akses', (array) $p->data_baru)));
    }

    public function test_kuota_dan_syarat_pengumuman(): void
    {
        $g = $this->gelombang(['kuota' => 1, 'berkas_wajib' => []]);
        $d1 = $this->daftar($g);
        $d2 = $this->daftar($g, ['nama_siswa' => 'Petrus Gobai', 'nama_ibu' => 'Ance Gobai', 'no_wa' => '081200000000']);
        $this->assertSame('SPMB-2027-0002', $d2['nomor_daftar']);

        Sanctum::actingAs($this->sekolah->kepsek);
        [$id1, $id2] = SpmbPendaftar::orderBy('id')->pluck('id')->all();
        foreach ([$id1, $id2] as $id) $this->postJson("/api/administrasi/spmb/pendaftar/{$id}/verifikasi", ['keputusan' => 'TERVERIFIKASI'])->assertOk();
        $this->postJson("/api/administrasi/spmb/pendaftar/{$id1}/hasil", ['hasil' => 'DITERIMA'])->assertOk();
        $this->postJson("/api/administrasi/spmb/pendaftar/{$id2}/hasil", ['hasil' => 'DITERIMA'])->assertUnprocessable()->assertJsonValidationErrors('hasil');
        // Belum diumumkan: masih ada yang terverifikasi tanpa hasil
        $this->postJson("/api/administrasi/spmb/gelombang/{$g->id}/umumkan", ['umumkan' => true])->assertUnprocessable();
        $this->postJson("/api/administrasi/spmb/pendaftar/{$id2}/hasil", ['hasil' => 'CADANGAN', 'catatan' => 'Menunggu kursi kosong'])->assertOk();
        $this->postJson("/api/administrasi/spmb/gelombang/{$g->id}/umumkan", ['umumkan' => true])->assertOk();
        // Gelombang berisi pendaftar tidak bisa dihapus
        $this->deleteJson("/api/administrasi/spmb/gelombang/{$g->id}")->assertUnprocessable();

        $this->app['auth']->forgetGuards();
        $this->postJson('/api/spmb/status', $this->akses($d2))->assertJsonPath('data.status', 'CADANGAN')->assertJsonPath('data.catatan_verifikasi', 'Menunggu kursi kosong');
        // Langsung selesaikan tanpa konfirmasi daring (daftar ulang di sekolah) juga boleh bagi yang diterima
        Sanctum::actingAs($this->sekolah->kepsek);
        $this->postJson("/api/administrasi/spmb/pendaftar/{$id1}/selesaikan")->assertOk();
        $this->postJson("/api/administrasi/spmb/pendaftar/{$id2}/selesaikan")->assertUnprocessable();
    }

    public function test_akses_dan_validasi_formulir(): void
    {
        $tutup = $this->gelombang(['tgl_buka' => now()->addWeek()->toDateString(), 'tgl_tutup' => now()->addWeeks(2)->toDateString()]);
        $this->postJson('/api/spmb/daftar', ['id_gelombang' => $tutup->id, 'nama_siswa' => 'X', 'jenis_kelamin' => 'L', 'tempat_lahir' => 'Nabire',
            'tgl_lahir' => '2020-01-01', 'alamat' => 'A', 'nama_ibu' => 'B', 'no_wa' => '0812345678'])->assertUnprocessable()->assertJsonValidationErrors('id_gelombang');

        $g = $this->gelombang();
        Student::where('id_siswa', 'SIS-1')->update(['nisn' => '0123456789']);
        $dasar = ['id_gelombang' => $g->id, 'nama_siswa' => 'X', 'jenis_kelamin' => 'L', 'tempat_lahir' => 'Nabire', 'tgl_lahir' => '2020-01-01', 'alamat' => 'A', 'no_wa' => '0812345678'];
        $this->postJson('/api/spmb/daftar', $dasar)->assertUnprocessable()->assertJsonValidationErrors('nama_ibu');
        $this->postJson('/api/spmb/daftar', $dasar + ['nama_ayah' => 'Y', 'nisn' => '0123456789'])->assertUnprocessable()->assertJsonValidationErrors('nisn');
        $this->postJson('/api/spmb/daftar', array_merge($dasar, ['nama_ayah' => 'Y', 'no_wa' => '08-12']))->assertUnprocessable()->assertJsonValidationErrors('no_wa');

        // Guru tanpa penunjukan & operator submodul lain: ditolak
        $surat = User::create(['name' => 'Staf Surat', 'username' => 'staf.surat', 'password' => 'rahasia123', 'role' => 'operator', 'aktif' => true]);
        OperatorSekolah::create(['id_user' => $surat->id, 'submodul' => ['SURAT']]);
        foreach ([$this->sekolah->guruA, $surat] as $akun) {
            Sanctum::actingAs($akun);
            $this->getJson('/api/administrasi/spmb/gelombang')->assertForbidden();
        }
        // Peninjau hanya membaca
        $peninjau = User::create(['name' => 'Yayasan', 'username' => 'yayasan.spmb', 'password' => 'rahasia123', 'role' => 'yayasan', 'aktif' => true]);
        Sanctum::actingAs($peninjau);
        $this->getJson('/api/administrasi/spmb/pendaftar')->assertOk();
        $this->postJson('/api/administrasi/spmb/gelombang', ['nama' => 'G2', 'tahun_ajaran' => '2027/2028', 'tgl_buka' => '2027-01-01', 'tgl_tutup' => '2027-02-01'])->assertForbidden();

        // Operator SPMB membuat gelombang; validasi tahun ajaran & tanggal
        Sanctum::actingAs($this->operator);
        $this->postJson('/api/administrasi/spmb/gelombang', ['nama' => 'G2', 'tahun_ajaran' => '2027', 'tgl_buka' => '2027-02-01', 'tgl_tutup' => '2027-01-01'])
            ->assertUnprocessable()->assertJsonValidationErrors(['tahun_ajaran', 'tgl_tutup']);
        $this->postJson('/api/administrasi/spmb/gelombang', ['nama' => 'G2', 'tahun_ajaran' => '2027/2028', 'tgl_buka' => '2027-01-01', 'tgl_tutup' => '2027-02-01', 'berkas_wajib' => ['KK', 'AKTA', 'KK']])
            ->assertCreated()->assertJsonPath('data.berkas_wajib', ['AKTA', 'KK']);
        $this->getJson('/api/administrasi')->assertJsonPath('data.submodul.0.tersedia', true);
    }

    public function test_selesaikan_menghubungkan_ke_orang_tua_yang_sudah_ada(): void
    {
        MasterOrtu::create(['id_ortu' => 'ORT-KAKAK', 'nama_ibu' => 'Maria Pigai', 'no_wa' => '081234567890']);
        $g = $this->gelombang(['berkas_wajib' => []]);
        $this->daftar($g, ['nama_ibu' => 'maria pigai', 'nama_wali' => 'Om Yakob', 'sekolah_asal' => 'TK Kasih']);

        Sanctum::actingAs($this->sekolah->admin);
        $id = SpmbPendaftar::value('id');
        $this->postJson("/api/administrasi/spmb/pendaftar/{$id}/verifikasi", ['keputusan' => 'TERVERIFIKASI'])->assertOk();
        $this->postJson("/api/administrasi/spmb/pendaftar/{$id}/hasil", ['hasil' => 'DITERIMA'])->assertOk();
        $this->postJson("/api/administrasi/spmb/gelombang/{$g->id}/umumkan", ['umumkan' => true])->assertOk();
        $this->postJson("/api/administrasi/spmb/pendaftar/{$id}/selesaikan")->assertOk()->assertJsonFragment(['message' => 'Yohana Pigai kini tercatat sebagai siswa (dihubungkan ke data orang tua yang sudah ada).']);

        $siswa = Student::with(['wali', 'sekolahAsal'])->where('nama_siswa', 'Yohana Pigai')->first();
        $this->assertSame('ORT-KAKAK', $siswa->id_ortu);
        $this->assertSame('Om Yakob', $siswa->wali->nama_wali);
        $this->assertSame('TK Kasih', $siswa->sekolahAsal->nama_sekolah);
        $this->assertSame(1, MasterOrtu::count());
    }
}

<?php

namespace Tests\Feature;

use App\Models\MasterPeriode;
use App\Models\MasterOrtu;
use App\Models\Student;
use App\Models\TransNilai;
use App\Models\TransRaporTerbit;
use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\Concerns\MembuatDataSekolah;
use Tests\TestCase;

/**
 * Rapor digital terverifikasi: terbit (versi, kode QR, sidik data), terbit ulang hanya bila berubah, pengesahan kepala
 * sekolah, verifikasi publik (berlaku/berubah/diganti), tanda terima orang tua, kunci semester, dan akses.
 */
class RaporTerbitTest extends TestCase
{
    use RefreshDatabase, MembuatDataSekolah;

    protected function setUp(): void
    {
        parent::setUp();
        $this->buatSekolah();
        Model::unguarded(fn() => TransNilai::create(['id_nilai' => 'N1', 'tanggal' => '2030-02-10', 'id_siswa' => 'SIS-1', 'id_mapel' => 'MPL-A',
            'id_periode' => 'PER-T', 'id_jenis' => 'JNS-T', 'id_materi' => 'MTR-T', 'id_kelas' => 'KLS-A', 'nilai' => 80]));
    }

    private function sebagai(User $user): static
    {
        Sanctum::actingAs($user);
        return $this;
    }

    private function kiriman(float $nilai = 80): array
    {
        return [
            'id_kelas' => 'KLS-A', 'id_periode' => 'PER-T', 'mode_kalkulasi' => '2', 'tanggal_rapor' => '2030-06-20',
            'siswa' => [
                ['id_siswa' => 'SIS-1', 'rata_umum' => $nilai, 'mapel' => [['nama' => 'Matematika', 'kkm' => 75, 'nilai' => $nilai]]],
                ['id_siswa' => 'SIS-2', 'rata_umum' => null, 'mapel' => [['nama' => 'Matematika', 'kkm' => 75, 'nilai' => null]]],
            ],
        ];
    }

    public function test_terbit_sahkan_verifikasi_dan_terbit_ulang(): void
    {
        $s = $this->sekolah;
        // Wali kelas 4A menerbitkan
        $this->sebagai($s->guruA)->postJson('/api/rapor/terbit', $this->kiriman())->assertOk()->assertJsonPath('hasil.baru', 2);
        $t = TransRaporTerbit::where('id_siswa', 'SIS-1')->first();
        $this->assertSame(['BERLAKU', 1, 'Guru A'], [$t->status, $t->versi, $t->nama_wali]);
        $this->assertSame(10, strlen($t->kode_verifikasi));

        // Terbit lagi tanpa perubahan → tetap
        $this->postJson('/api/rapor/terbit', $this->kiriman())->assertOk()->assertJsonPath('hasil.tetap', 2);

        // Verifikasi publik
        $v = $this->getJson("/api/verifikasi-rapor/{$t->kode_verifikasi}")->assertOk();
        $v->assertJsonPath('data.status', 'BERLAKU')->assertJsonPath('data.berubah', false)->assertJsonPath('data.nama_siswa', 'Ani')
            ->assertJsonPath('data.disahkan_pada', null)->assertJsonPath('data.kode', $t->kode_verifikasi)->assertJsonPath('data.kop.nama', \App\Models\SchoolSetting::first()?->nama_sekolah)
            // Nilai disembunyikan sampai dua huruf awal nama siswa cocok
            ->assertJsonPath('data.perlu_inisial', true)->assertJsonPath('data.mapel', [])->assertJsonPath('data.rata_umum', null)->assertJsonPath('data.inisial_salah', false);
        $this->assertArrayNotHasKey('sidik', $v->json('data'));
        $this->assertNotNull($v->json('data.diperiksa_pada'));
        $this->getJson("/api/verifikasi-rapor/{$t->kode_verifikasi}?inisial=BU")->assertJsonPath('data.inisial_salah', true)->assertJsonPath('data.mapel', []);
        $this->getJson("/api/verifikasi-rapor/{$t->kode_verifikasi}?inisial=a")->assertJsonPath('data.perlu_inisial', true);
        $this->getJson("/api/verifikasi-rapor/{$t->kode_verifikasi}?inisial=an")->assertJsonPath('data.perlu_inisial', false)
            ->assertJsonPath('data.mapel.0.nilai', 80)->assertJsonPath('data.nip_kepsek', null);
        $this->getJson('/api/verifikasi-rapor/ZZZZZZZZZZ')->assertNotFound();

        // Wali kelas tidak bisa mengesahkan; kepala sekolah bisa
        $this->postJson('/api/rapor/terbit/sahkan', ['id_kelas' => 'KLS-A', 'id_periode' => 'PER-T'])->assertForbidden();
        $this->sebagai($s->kepsek)->postJson('/api/rapor/terbit/sahkan', ['id_kelas' => 'KLS-A', 'id_periode' => 'PER-T'])->assertOk()->assertJsonPath('jumlah', 2);
        $this->assertNotNull($t->fresh()->disahkan_pada);
        $this->getJson("/api/verifikasi-rapor/{$t->kode_verifikasi}")->assertJsonPath('data.nama_kepsek', $t->fresh()->nama_kepsek)->assertJsonPath('data.mapel', []);

        // Nilai berubah setelah terbit → terdeteksi di status kelas & verifikasi
        TransNilai::whereKey('N1')->update(['nilai' => 60]);
        $this->getJson('/api/rapor/terbit?id_kelas=KLS-A&id_periode=PER-T')->assertOk()->assertJsonPath('ringkas.berubah', 1)->assertJsonPath('ringkas.disahkan', 2);
        $this->getJson("/api/verifikasi-rapor/{$t->kode_verifikasi}")->assertJsonPath('data.berubah', true);

        // Terbit ulang: versi 2, kode baru, pengesahan perlu diulang; kode lama berstatus DIGANTI
        $this->sebagai($s->guruA)->postJson('/api/rapor/terbit', $this->kiriman(60))->assertOk()->assertJsonPath('hasil.ulang', 1)->assertJsonPath('hasil.tetap', 1);
        $baru = TransRaporTerbit::berlaku()->where('id_siswa', 'SIS-1')->first();
        $this->assertSame(2, $baru->versi);
        $this->assertNotSame($t->kode_verifikasi, $baru->kode_verifikasi);
        $this->assertNull($baru->disahkan_pada);
        $this->getJson("/api/verifikasi-rapor/{$t->kode_verifikasi}")->assertJsonPath('data.status', 'DIGANTI');

        // Data rapor (dipakai halaman Rapor & portal) membawa rapor berlaku
        $this->getJson('/api/rapor/data?id_kelas=KLS-A&id_periode=PER-T')->assertOk()->assertJsonCount(2, 'terbit');
    }

    public function test_tanda_terima_orang_tua(): void
    {
        $s = $this->sekolah;
        Model::unguarded(fn() => MasterOrtu::create(['id_ortu' => 'ORT-1', 'nama_ayah' => 'Pak Ani']));
        Student::whereKey('SIS-1')->update(['id_ortu' => 'ORT-1']);
        $ortu = User::create(['name' => 'Ortu Ani', 'username' => 'ortu_ani', 'password' => 'rahasia123', 'role' => 'ortu', 'aktif' => true, 'id_ortu' => 'ORT-1']);

        // Belum terbit → 404
        $this->sebagai($ortu)->postJson('/api/portal/rapor/terima', ['id_siswa' => 'SIS-1', 'id_periode' => 'PER-T'])->assertNotFound();
        $this->sebagai($s->guruA)->postJson('/api/rapor/terbit', $this->kiriman())->assertOk();

        $this->sebagai($ortu)->postJson('/api/portal/rapor/terima', ['id_siswa' => 'SIS-1', 'id_periode' => 'PER-T', 'tanggapan' => 'Terima kasih, Bu.'])->assertOk();
        $this->postJson('/api/portal/rapor/terima', ['id_siswa' => 'SIS-2', 'id_periode' => 'PER-T'])->assertForbidden(); // bukan anaknya
        $this->sebagai($s->guruA)->postJson('/api/portal/rapor/terima', ['id_siswa' => 'SIS-1', 'id_periode' => 'PER-T'])->assertForbidden(); // staf tidak mengisi

        $st = collect($this->getJson('/api/rapor/terbit?id_kelas=KLS-A&id_periode=PER-T')->assertOk()->json('data'))->keyBy('id_siswa');
        $this->assertSame('Terima kasih, Bu.', $st['SIS-1']['terbit']['tanggapan_ortu']);
        $this->assertSame('ortu', $st['SIS-1']['terbit']['penerima']['role']);
        $this->assertNull($st['SIS-2']['terbit']['diterima_pada']);

        // Notifikasi portal hilang setelah diterima; kepala sekolah diingatkan untuk mengesahkan
        $notif = fn(User $u) => collect($this->sebagai($u)->getJson('/api/notifikasi')->assertOk()->json('data'))->pluck('jenis');
        $this->assertNotContains('portal-rapor', $notif($ortu)->all());
        $this->assertContains('rapor-sahkan', $notif($s->kepsek)->all());
    }

    public function test_akses_dan_kunci_semester(): void
    {
        $s = $this->sekolah;
        // Guru B bukan wali 4A
        $this->sebagai($s->guruB)->postJson('/api/rapor/terbit', $this->kiriman())->assertForbidden();
        $this->sebagai($s->guruB)->getJson('/api/rapor/terbit?id_kelas=KLS-A&id_periode=PER-T')->assertForbidden();
        // Siswa di luar rombel ditolak
        $k = $this->kiriman();
        $k['siswa'][] = ['id_siswa' => 'SIS-4', 'mapel' => []];
        $this->sebagai($s->guruA)->postJson('/api/rapor/terbit', $k)->assertStatus(422);
        // Semester terkunci: hanya admin
        MasterPeriode::whereKey('PER-T')->update(['terkunci' => true]);
        $this->postJson('/api/rapor/terbit', $this->kiriman())->assertStatus(423);
        $this->sebagai($s->admin)->postJson('/api/rapor/terbit', $this->kiriman())->assertOk();
    }
}

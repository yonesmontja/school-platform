<?php

namespace Tests\Feature;

use App\Models\Classes;
use App\Models\MasterOrtu;
use App\Models\MasterPeriode;
use App\Models\Student;
use App\Models\Subject;
use App\Models\TransNilai;
use App\Models\User;
use App\Services\KenaikanService;
use App\Services\PantauanKenaikan;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\Concerns\MembuatDataSekolah;
use Tests\TestCase;

/**
 * Pantauan kenaikan kelas sepanjang tahun: tingkat risiko dari rata-rata setahun (sama dengan usulan kenaikan),
 * target perkiraan, akses wali/pengelola, tindak lanjut, berbagi ke portal orang tua, peringatan dini, dan notifikasi.
 */
class PantauanKenaikanTest extends TestCase
{
    use RefreshDatabase, MembuatDataSekolah;

    private int $n = 0;

    protected function setUp(): void
    {
        parent::setUp();
        $this->buatSekolah();
        Model::unguarded(function () {
            MasterPeriode::create(['id_periode' => 'PER-G', 'tahun_ajaran' => '2029/2030', 'semester' => 'Ganjil', 'status_aktif' => 'TUTUP']);
            Subject::create(['id_mapel' => 'MPL-C', 'nama_mapel' => 'Bahasa Indonesia', 'kkm' => 75, 'id_guru' => 'GR-A']);
        });
        // Ani: 3 mapel di bawah KKM → TINGGI; Budi: 2 di bawah + 1 di tepi → WASPADA; Citra: 1 di bawah → PANTAU
        foreach (['MPL-A' => 60, 'MPL-B' => 60, 'MPL-C' => 60] as $m => $v) $this->nilai('SIS-1', $m, $v);
        foreach (['MPL-A' => 60, 'MPL-B' => 70, 'MPL-C' => 77] as $m => $v) $this->nilai('SIS-2', $m, $v);
        foreach (['MPL-A' => 70, 'MPL-B' => 90] as $m => $v) $this->nilai('SIS-3', $m, $v);
    }

    private function nilai(string $siswa, string $mapel, float $v, string $periode = 'PER-G'): void
    {
        $this->n++;
        Model::unguarded(fn() => TransNilai::create(['id_nilai' => "NP{$this->n}", 'tanggal' => '2029-10-10', 'id_siswa' => $siswa, 'id_mapel' => $mapel,
            'id_periode' => $periode, 'id_jenis' => 'JNS-T', 'id_materi' => 'MTR-T', 'id_kelas' => 'KLS-A', 'nilai' => $v]));
    }

    private function sebagai(User $u): static
    {
        Sanctum::actingAs($u);
        return $this;
    }

    public function test_tingkat_risiko_sama_dengan_usulan_kenaikan_dan_target(): void
    {
        $s = $this->sekolah;
        $r = $this->sebagai($s->guruA)->getJson('/api/pantauan-kenaikan')->assertOk();
        $data = collect($r->json('data'))->keyBy('id_siswa');
        $this->assertSame(['SIS-1', 'SIS-2', 'SIS-3'], collect($r->json('data'))->pluck('id_siswa')->all()); // terurut dari risiko tertinggi
        $this->assertSame(['TINGGI', 'WASPADA', 'PANTAU'], [$data['SIS-1']['tingkat'], $data['SIS-2']['tingkat'], $data['SIS-3']['tingkat']]);
        $this->assertSame([3, 2, 1], [$data['SIS-1']['mapel_bawah'], $data['SIS-2']['mapel_bawah'], $data['SIS-3']['mapel_bawah']]);
        $this->assertSame(1, $data['SIS-2']['mapel_tepi']);
        $this->assertTrue($data['SIS-1']['perlu_tindak']);
        $this->assertFalse($data['SIS-3']['perlu_tindak']);
        $this->assertNull($r->json('ringkasan')); // guru tidak melihat ringkasan sekolah

        // Semester Genap, satu nilai Ganjil per mapel dan belum ada nilai Genap: perlu rata-rata 90 pada satu penilaian lagi
        $mtk = collect($data['SIS-1']['mapel'])->firstWhere('id_mapel', 'MPL-A');
        $this->assertSame([60.0, null, 90, false], [(float) $mtk['rata_ganjil'], $mtk['rata_genap'], $mtk['target'], $mtk['sulit']]);

        // Konsisten dengan usulan kenaikan akhir tahun
        $usulan = KenaikanService::daftar(Classes::find('KLS-A'), MasterPeriode::find('PER-T'))->keyBy('id_siswa');
        $this->assertSame('TIDAK_NAIK', $usulan['SIS-1']['usulan']['keputusan']);
        $this->assertNotSame('TIDAK_NAIK', $usulan['SIS-2']['usulan']['keputusan']);

        // Nilai Genap yang membaik menurunkan risiko
        foreach (['MPL-A', 'MPL-B', 'MPL-C'] as $m) $this->nilai('SIS-1', $m, 95, 'PER-T');
        $this->assertSame('AMAN', PantauanKenaikan::hitungSiswa(['SIS-1'], MasterPeriode::find('PER-T'))['SIS-1']['tingkat']);

        // Kepala sekolah melihat ringkasan per rombel
        $ring = collect($this->sebagai($s->kepsek)->getJson('/api/pantauan-kenaikan')->assertOk()->json('ringkasan'))->keyBy('id_kelas');
        $this->assertSame([0, 1, 1, 1], [$ring['KLS-A']['tinggi'], $ring['KLS-A']['waspada'], $ring['KLS-A']['pantau'], $ring['KLS-A']['aman']]);
    }

    public function test_akses_tindak_lanjut_portal_dan_peringatan(): void
    {
        $s = $this->sekolah;
        // Guru B bukan wali 4A
        $this->sebagai($s->guruB)->getJson('/api/pantauan-kenaikan?id_kelas=KLS-A')->assertForbidden();
        $this->assertSame('KLS-B', $this->getJson('/api/pantauan-kenaikan')->assertOk()->json('kelas.id_kelas'));
        $this->postJson('/api/pantauan-kenaikan/tindak', ['id_siswa' => 'SIS-1', 'jenis' => 'CATATAN', 'catatan' => 'x'])->assertForbidden();

        // Peringatan dini & notifikasi wali kelas memuat risiko tidak naik
        $alasan = collect($this->sebagai($s->guruA)->getJson('/api/peringatan-dini')->assertOk()->json('data'))->firstWhere('id_siswa', 'SIS-1')['alasan'];
        $this->assertContains('risiko-kenaikan', array_column($alasan, 'kode'));
        $notif = fn() => collect($this->getJson('/api/notifikasi')->assertOk()->json('data'))->pluck('jenis')->all();
        $this->assertContains('kenaikan-risiko', $notif());

        // Orang tua belum melihat apa pun sebelum wali kelas membagikan
        Model::unguarded(fn() => MasterOrtu::create(['id_ortu' => 'ORT-1', 'nama_ayah' => 'Pak Ani']));
        Student::whereKey('SIS-1')->update(['id_ortu' => 'ORT-1']);
        $ortu = User::create(['name' => 'Ortu Ani', 'username' => 'ortu_ani', 'password' => 'rahasia123', 'role' => 'ortu', 'aktif' => true, 'id_ortu' => 'ORT-1']);
        $this->sebagai($ortu)->getJson('/api/portal/pantauan-kenaikan?id_siswa=SIS-1')->assertOk()->assertJsonPath('data', null);
        $this->getJson('/api/portal/pantauan-kenaikan?id_siswa=SIS-2')->assertForbidden();
        $this->postJson('/api/pantauan-kenaikan/tindak', ['id_siswa' => 'SIS-1', 'jenis' => 'CATATAN', 'catatan' => 'x'])->assertForbidden();

        // Wali kelas: jenis tidak dikenal ditolak; tindak lanjut "Kabari orang tua"
        $this->sebagai($s->guruA)->postJson('/api/pantauan-kenaikan/tindak', ['id_siswa' => 'SIS-1', 'jenis' => 'LAIN', 'catatan' => 'x'])->assertStatus(422);
        $this->getJson('/api/portal/pantauan-kenaikan?id_siswa=SIS-1')->assertOk()->assertJsonPath('data.dibagikan', false); // pratinjau staf
        $this->postJson('/api/pantauan-kenaikan/tindak', ['id_siswa' => 'SIS-1', 'jenis' => 'KABARI_ORTU', 'catatan' => 'Mari dampingi belajar Matematika.'])
            ->assertOk()->assertJsonPath('data.jenis', 'KABARI_ORTU')->assertJsonPath('data.pembuat.name', 'Guru');
        $baris = collect($this->getJson('/api/pantauan-kenaikan')->json('data'))->firstWhere('id_siswa', 'SIS-1');
        $this->assertTrue($baris['dikabarkan_ortu']);
        $this->assertFalse($baris['perlu_tindak']);
        $this->assertNotContains('kenaikan-risiko', $notif());

        $p = $this->sebagai($ortu)->getJson('/api/portal/pantauan-kenaikan?id_siswa=SIS-1')->assertOk();
        $p->assertJsonPath('data.dibagikan', true)->assertJsonPath('data.tingkat', 'TINGGI')->assertJsonPath('data.pesan.catatan', 'Mari dampingi belajar Matematika.')
            ->assertJsonCount(3, 'data.mapel');
        $this->assertArrayNotHasKey('rata_ganjil', $p->json('data.mapel.0'));
    }
}

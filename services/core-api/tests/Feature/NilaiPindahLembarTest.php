<?php

namespace Tests\Feature;

use App\Models\MasterIndikator;
use App\Models\MasterMateri;
use App\Models\MasterPeriode;
use App\Models\TransNilai;
use App\Models\TransNilaiIndikator;
use App\Models\TransRencanaRemedial;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\Concerns\MembuatDataSekolah;
use Tests\TestCase;

/**
 * Pindahkan lembar: membetulkan salah pilih materi/jenis/tanggal setelah nilai tersimpan (input atau import Excel).
 */
class NilaiPindahLembarTest extends TestCase
{
    use RefreshDatabase, MembuatDataSekolah;

    private array $meta;

    protected function setUp(): void
    {
        parent::setUp();
        $this->buatSekolah();
        $this->meta = $this->sekolah->meta;
        Model::unguarded(function () {
            MasterMateri::create(['id_materi' => 'MTR-B', 'nama_materi' => 'Desimal', 'id_mapel' => 'MPL-A', 'id_kelas' => 'KLS-A', 'id_periode' => 'PER-T']);
            MasterMateri::create(['id_materi' => 'MTR-IPA', 'nama_materi' => 'Cahaya', 'id_mapel' => 'MPL-B']);
            MasterIndikator::create(['id_indikator' => 'IND-1', 'id_materi' => 'MTR-T', 'deskripsi' => 'Menyederhanakan pecahan', 'aktif' => true]);
        });
    }

    private function simpan(array $nilai, string $materi = 'MTR-T', string $tanggal = '2030-01-07', array $indikator = [])
    {
        $records = array_map(fn ($s, $n) => ['id_siswa' => $s] + ($indikator ? ['nilai_indikator' => [$indikator[0] => $n]] : ['nilai' => $n]), array_keys($nilai), $nilai);
        return $this->postJson('/api/nilai/batch', ['id_materi' => $materi] + $this->meta + ['tanggal' => $tanggal, 'records' => $records])->assertOk();
    }

    private function pindah(array $tujuan, array $tambahan = [])
    {
        return $this->postJson('/api/nilai/pindah-lembar', $this->meta + ['tanggal' => '2030-01-07', 'tujuan' => $tujuan + ['id_jenis' => 'JNS-T', 'tanggal' => '2030-01-07']] + $tambahan);
    }

    public function test_salah_materi_dipindah_seluruh_lembar_dengan_rencana_dan_remedialnya(): void
    {
        Sanctum::actingAs($this->sekolah->guruA);
        $this->simpan(['SIS-1' => 60, 'SIS-2' => 80, 'SIS-3' => 90], 'MTR-T', '2030-01-07', ['IND-1']);
        $asal = TransNilai::where('id_siswa', 'SIS-1')->first();
        $rencana = TransRencanaRemedial::create(['id_rencana' => 'RR-1', 'id_nilai_asal' => $asal->id_nilai, 'id_siswa' => 'SIS-1', 'id_mapel' => 'MPL-A', 'opsi_tindakan' => 'Remedial', 'tanggal_rencana' => '2030-01-08']);
        $this->postJson('/api/nilai/batch', $this->meta + ['tanggal' => '2030-01-09', 'tipe_nilai' => 'REMEDIAL', 'records' => [['id_siswa' => 'SIS-1', 'nilai' => 78, 'id_rencana' => 'RR-1']]])->assertOk();

        // Pratinjau: menghitung tanpa menyimpan
        $p = $this->pindah(['id_materi' => 'MTR-B'], ['pratinjau' => true])->assertOk();
        $this->assertSame(3, $p->json('jumlah'));
        $this->assertSame(1, $p->json('remedial'));
        $this->assertSame(3, $p->json('indikator_dibuang'));
        $this->assertSame(3, TransNilai::where('id_materi', 'MTR-T')->where('tipe_nilai', 'NORMAL')->count());

        $res = $this->pindah(['id_materi' => 'MTR-B'])->assertOk();
        $this->assertStringContainsString('3 nilai dipindahkan ke Desimal', $res->json('message'));
        $this->assertSame(0, TransNilai::where('id_materi', 'MTR-T')->count());
        $this->assertEquals([60, 80, 90], TransNilai::where('id_materi', 'MTR-B')->where('tipe_nilai', 'NORMAL')->orderBy('nilai')->pluck('nilai')->map(fn ($v) => (float) $v)->all());
        // Nilai akhir tetap, nilai indikator materi lama dihapus, rencana & remedial ikut
        $this->assertSame(0, TransNilaiIndikator::count());
        $this->assertSame($asal->id_nilai, TransRencanaRemedial::find('RR-1')->id_nilai_asal);
        $rem = TransNilai::where('id_rencana', 'RR-1')->first();
        $this->assertSame('MTR-B', $rem->id_materi);
        $this->assertSame('2030-01-09', substr((string) $rem->tanggal, 0, 10));

        // Lembar tujuan kini terbaca di Input Nilai
        $lembar = $this->getJson('/api/nilai/students?' . http_build_query(['id_materi' => 'MTR-B'] + $this->meta + ['tanggal' => '2030-01-07']))->assertOk();
        $this->assertSame(3, collect($lembar->json('students'))->whereNotNull('id_nilai')->count());
    }

    public function test_lembar_tujuan_berisi_nilai_berhenti_lalu_bisa_ditimpa(): void
    {
        Sanctum::actingAs($this->sekolah->guruA);
        $this->simpan(['SIS-1' => 60, 'SIS-2' => 80]);
        $this->simpan(['SIS-1' => 95], 'MTR-B');

        $res = $this->pindah(['id_materi' => 'MTR-B'])->assertStatus(409);
        $this->assertCount(1, $res->json('bentrok'));
        $this->assertSame('Ani', $res->json('bentrok.0.nama_siswa'));
        $this->assertEquals(60, $res->json('bentrok.0.nilai_asal'));
        $this->assertEquals(95, $res->json('bentrok.0.nilai_tujuan'));
        $this->assertSame(2, TransNilai::where('id_materi', 'MTR-T')->count());

        $this->pindah(['id_materi' => 'MTR-B'], ['timpa' => true])->assertOk();
        $this->assertSame(2, TransNilai::where('id_materi', 'MTR-B')->count());
        $this->assertEquals(60, TransNilai::where('id_materi', 'MTR-B')->where('id_siswa', 'SIS-1')->value('nilai'));
    }

    public function test_pindah_tanggal_saja_mempertahankan_nilai_indikator(): void
    {
        Sanctum::actingAs($this->sekolah->guruA);
        $this->simpan(['SIS-1' => 70], 'MTR-T', '2030-01-07', ['IND-1']);
        $this->pindah(['id_materi' => 'MTR-T', 'tanggal' => '2030-01-08'])->assertOk();
        $n = TransNilai::first();
        $this->assertSame('2030-01-08', substr((string) $n->tanggal, 0, 10));
        $this->assertSame(1, TransNilaiIndikator::where('id_nilai', $n->id_nilai)->count());
    }

    public function test_ditolak_untuk_materi_mapel_lain_lembar_sama_guru_lain_dan_semester_terkunci(): void
    {
        Sanctum::actingAs($this->sekolah->guruA);
        $this->simpan(['SIS-1' => 70]);
        $this->pindah(['id_materi' => 'MTR-IPA'])->assertStatus(422);
        $this->pindah(['id_materi' => 'MTR-T'])->assertStatus(422);

        Sanctum::actingAs($this->sekolah->guruB);
        $this->pindah(['id_materi' => 'MTR-B'])->assertStatus(403);

        MasterPeriode::whereKey('PER-T')->update(['terkunci' => true]);
        Sanctum::actingAs($this->sekolah->guruA);
        $this->pindah(['id_materi' => 'MTR-B'])->assertStatus(423);
        $this->assertSame('MTR-T', TransNilai::first()->id_materi);
    }
}

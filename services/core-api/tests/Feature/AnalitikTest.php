<?php

namespace Tests\Feature;

use App\Models\MasterMateri;
use App\Models\MasterPeriode;
use App\Models\TransNilai;
use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\Concerns\MembuatDataSekolah;
use Tests\TestCase;

/**
 * Analitik lintas semester: TP lemah lintas angkatan (dicocokkan per mapel + tingkat + semester + nama),
 * kesenjangan rombel, siswa menurun dua semester berturut-turut, saran pengajaran ulang, lintasan rekam jejak, dan akses.
 */
class AnalitikTest extends TestCase
{
    use RefreshDatabase, MembuatDataSekolah;

    private int $n = 0;

    protected function setUp(): void
    {
        parent::setUp();
        $this->buatSekolah();
        Model::unguarded(function () {
            MasterPeriode::create(['id_periode' => 'PER-0', 'tahun_ajaran' => '2027/2028', 'semester' => 'Genap', 'status_aktif' => 'TUTUP']);
            MasterPeriode::create(['id_periode' => 'PER-1', 'tahun_ajaran' => '2028/2029', 'semester' => 'Ganjil', 'status_aktif' => 'TUTUP']);
            // "Pecahan" kelas 4 semester Genap, dua angkatan; nama ditulis sedikit berbeda tetap satu TP
            MasterMateri::create(['id_materi' => 'MTR-0', 'nama_materi' => ' pecahan. ', 'id_mapel' => 'MPL-A', 'id_kelas' => 'KLS-A', 'id_periode' => 'PER-0']);
            MasterMateri::create(['id_materi' => 'MTR-1', 'nama_materi' => 'Bilangan cacah', 'id_mapel' => 'MPL-A', 'id_kelas' => 'KLS-A', 'id_periode' => 'PER-1']);
            MasterMateri::create(['id_materi' => 'MTR-TB', 'nama_materi' => 'Pecahan', 'id_mapel' => 'MPL-A', 'id_kelas' => 'KLS-B', 'id_periode' => 'PER-T']);
        });
        // Angkatan lalu: Pecahan lemah (60, 65); Ani juga dipakai untuk deret menurun 90 → 80 → 60
        $this->nilai('SIS-1', 'PER-0', 'MTR-0', 'KLS-A', 90);
        $this->nilai('SIS-2', 'PER-0', 'MTR-0', 'KLS-A', 40);
        $this->nilai('SIS-3', 'PER-0', 'MTR-0', 'KLS-A', 55);
        $this->nilai('SIS-1', 'PER-1', 'MTR-1', 'KLS-A', 80);
        // Sekarang: 4A lemah di Pecahan, 4B tinggi → kesenjangan rombel
        $this->nilai('SIS-1', 'PER-T', 'MTR-T', 'KLS-A', 50);
        $this->nilai('SIS-1', 'PER-T', 'MTR-T', 'KLS-A', 70); // dua penilaian → satu nilai siswa (60)
        $this->nilai('SIS-2', 'PER-T', 'MTR-T', 'KLS-A', 62);
        $this->nilai('SIS-4', 'PER-T', 'MTR-TB', 'KLS-B', 95);
    }

    private function nilai(string $siswa, string $periode, string $materi, string $kelas, float $nilai): void
    {
        Model::unguarded(fn() => TransNilai::create([
            'id_nilai' => 'NA-' . (++$this->n), 'tanggal' => '2030-02-10', 'id_siswa' => $siswa, 'id_mapel' => 'MPL-A', 'id_periode' => $periode,
            'id_jenis' => 'JNS-T', 'id_materi' => $materi, 'id_kelas' => $kelas, 'nilai' => $nilai,
        ]));
    }

    private function sebagai(User $user): static
    {
        Sanctum::actingAs($user);
        return $this;
    }

    public function test_tp_lemah_lintas_angkatan_kesenjangan_rombel_dan_siswa_menurun(): void
    {
        $r = $this->sebagai($this->sekolah->kepsek)->getJson('/api/analitik/lintas-semester')->assertOk();
        $r->assertJsonPath('ringkasan.jumlah_semester', 3)->assertJsonPath('ringkasan.tp_selalu_rendah', 1);

        $pecahan = collect($r->json('tp'))->firstWhere('nama_tp', 'Pecahan');
        $this->assertNotNull($pecahan);
        $this->assertSame([4, 2, 2], [$pecahan['tingkat'], $pecahan['angkatan'], $pecahan['angkatan_lemah']]);
        $this->assertTrue($pecahan['selalu_rendah']);
        $akhir = end($pecahan['per_semester']);
        $this->assertSame('PER-T', $akhir['id_periode']);
        $this->assertSame(3, $akhir['siswa']);
        $rombel = collect($akhir['rombel'])->keyBy('nama_kelas');
        $this->assertEquals(61, $rombel['4A']['rata']);  // (60 + 62) / 2
        $this->assertEquals(95, $rombel['4B']['rata']);
        $this->assertTrue($pecahan['kesenjangan']);
        $this->assertEquals(34, $pecahan['selisih_rombel']);

        $turun = $r->json('siswa_turun');
        $this->assertCount(1, $turun);
        $this->assertSame('SIS-1', $turun[0]['id_siswa']);
        $this->assertEquals(30, $turun[0]['turun']);

        // Filter tingkat lain → kosong
        $this->getJson('/api/analitik/lintas-semester?tingkat=5')->assertOk()->assertJsonCount(0, 'tp');
    }

    public function test_saran_tp_tanpa_ai_dan_lintasan_rekam_jejak(): void
    {
        $this->sebagai($this->sekolah->admin);
        $kunci = collect($this->getJson('/api/analitik/lintas-semester')->json('tp'))->firstWhere('nama_tp', 'Pecahan')['kunci'];
        $saran = $this->postJson('/api/analitik/saran-tp', ['kunci' => $kunci, 'ai_mode' => 'LOKAL'])->assertOk()->json('data');
        $this->assertSame('LOKAL', $saran['mode']);
        $this->assertStringContainsString('2 dari 2 angkatan', $saran['diagnosis']);
        $this->assertStringContainsString('4A', $saran['untuk_rombel_rendah']);
        $this->postJson('/api/analitik/saran-tp', ['kunci' => 'MPL-A|9|Genap|tidak ada', 'ai_mode' => 'LOKAL'])->assertNotFound();

        $this->getJson('/api/siswa/SIS-1/rekam-jejak')->assertOk()->assertJsonStructure(['lintasan' => ['deret', 'turun_berturut']]);
        // Lintasan rekam jejak: urutan terbaru dulu → deret lama ke baru, kehadiran dalam persen
        $sem = fn($ta, $rata, $hadir, $alpa) => ['tahun_ajaran' => $ta, 'semester' => 'Ganjil', 'nama_kelas' => '4A', 'rata_rata' => $rata,
            'presensi' => ['hadir' => $hadir, 'sakit' => 0, 'izin' => 0, 'alpa' => $alpa]];
        $l = \App\Services\AnalitikLintasSemester::lintasan([$sem('2030', 70, 8, 2), $sem('2029', 80, 10, 0), $sem('2028', 88, 9, 1)]);
        $this->assertTrue($l['turun_berturut']);
        $this->assertSame([88, 80, 70], array_column($l['deret'], 'rata'));
        $this->assertSame([90, 100, 80], array_column($l['deret'], 'kehadiran'));
        $this->assertFalse(\App\Services\AnalitikLintasSemester::lintasan([$sem('2030', 79, 1, 0), $sem('2029', 80, 1, 0), $sem('2028', 81, 1, 0)])['turun_berturut']);
    }

    public function test_akses_guru_dibatasi_mapel_diampu(): void
    {
        $s = $this->sekolah;
        // Guru B mengampu IPA saja: tidak melihat TP Matematika, tidak bisa minta saran untuknya
        $r = $this->sebagai($s->guruB)->getJson('/api/analitik/lintas-semester')->assertOk()->assertJsonCount(0, 'tp');
        $this->assertSame(['MPL-B'], collect($r->json('pilihan.mapel'))->pluck('id_mapel')->all());
        $this->postJson('/api/analitik/saran-tp', ['kunci' => 'MPL-A|4|Genap|pecahan', 'ai_mode' => 'LOKAL'])->assertForbidden();

        // Guru A (Matematika, wali 4A) melihat TP-nya dan siswa menurun di kelasnya
        $this->sebagai($s->guruA)->getJson('/api/analitik/lintas-semester')->assertOk()->assertJsonPath('ringkasan.siswa_turun', 1);
        $this->sebagai($s->siswa)->getJson('/api/analitik/lintas-semester')->assertForbidden();
    }
}

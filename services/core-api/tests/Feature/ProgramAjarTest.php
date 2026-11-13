<?php

namespace Tests\Feature;

use App\Models\Atp;
use App\Models\AtpBaris;
use App\Models\MasterIndikator;
use App\Models\MasterPeriode;
use App\Models\TransJadwal;
use App\Models\VideoBelajar;
use App\Models\VideoTautan;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\Concerns\MembuatDataSekolah;
use Tests\TestCase;

/**
 * Fase 20: sesi jadwal menautkan perangkat ajar; status sesi mengikuti jam; Promes/Prota menghitung realisasi TP dari jadwal
 * terhadap rencana ATP pada minggu efektif semester.
 */
class ProgramAjarTest extends TestCase
{
    use RefreshDatabase, MembuatDataSekolah;

    private int $baris1;
    private int $baris2;

    protected function setUp(): void
    {
        parent::setUp();
        $this->buatSekolah();
        // Selasa minggu ke-3 semester (semester mulai Senin 7 Januari 2030)
        Carbon::setTestNow(Carbon::parse('2030-01-22 10:00', config('app.zona_sekolah')));
        MasterPeriode::whereKey('PER-T')->update(['tanggal_mulai' => '2030-01-07', 'tanggal_selesai' => '2030-03-30']);
        MasterIndikator::create(['id_indikator' => 'IND-T1', 'id_materi' => 'MTR-T', 'deskripsi' => 'Menyebutkan pembilang dan penyebut', 'urutan' => 1]);
        MasterIndikator::create(['id_indikator' => 'IND-T2', 'id_materi' => 'MTR-T', 'deskripsi' => 'Membandingkan dua pecahan', 'urutan' => 2]);
        Atp::create(['id_atp' => 'ATP-T', 'judul' => 'ATP Matematika 4A', 'id_mapel' => 'MPL-A', 'id_kelas' => 'KLS-A', 'id_periode' => 'PER-T',
            'jp_per_minggu' => 2, 'status' => 'DISETUJUI', 'dibuat_oleh' => $this->sekolah->guruA->id]);
        $this->baris1 = AtpBaris::create(['id_atp' => 'ATP-T', 'urutan' => 1, 'id_materi' => 'MTR-T', 'id_indikator' => 'IND-T1', 'alokasi_jp' => 4, 'minggu' => '1-2'])->id;
        $this->baris2 = AtpBaris::create(['id_atp' => 'ATP-T', 'urutan' => 2, 'id_materi' => 'MTR-T', 'id_indikator' => 'IND-T2', 'alokasi_jp' => 2, 'minggu' => '3'])->id;
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function sesi(string $tanggal, array $extra = []): string
    {
        return $this->postJson('/api/jadwal', $extra + [
            'id_mapel' => 'MPL-A', 'id_kelas' => 'KLS-A', 'pola' => 'sekali',
            'mulai' => "{$tanggal}T08:00", 'selesai' => "{$tanggal}T09:10", // 70 menit = 2 JP
        ])->assertCreated()->json('data.0.id_jadwal');
    }

    public function test_jadwal_menautkan_perangkat_dan_promes_menghitung_realisasi(): void
    {
        Sanctum::actingAs($this->sekolah->guruA);

        // Panel editor: perangkat mapel ini (ATP + TP, indikator, materi)
        $panel = $this->getJson('/api/jadwal/perangkat?id_mapel=MPL-A&id_kelas=KLS-A')->assertOk();
        $this->assertSame((string) $this->baris1, $panel->json('atp.0.baris.0.id'));
        $this->assertCount(2, $panel->json('indikator'));
        $this->assertSame('MTR-T', $panel->json('materi.0.id_materi'));

        $video = VideoBelajar::create(['id_video' => 'VID-T', 'judul' => 'Pecahan', 'file_url' => '/storage/v.mp4', 'id_mapel' => 'MPL-A',
            'status' => 'DISETUJUI', 'dibuat_oleh' => $this->sekolah->guruA->id]);
        $s1 = $this->sesi('2030-01-08', ['perangkat' => [['jenis' => 'ATP', 'id' => (string) $this->baris1, 'label' => 'TP 1', 'atp' => 'ATP-T']], 'video_ids' => ['VID-T']]);
        $s2 = $this->sesi('2030-01-15', ['perangkat' => [['jenis' => 'INDIKATOR', 'id' => 'IND-T1', 'label' => 'Menyebutkan pembilang']]]);
        $s3 = $this->sesi('2030-01-29', ['id_materi' => 'MTR-T']);

        // Status mengikuti jam: dua sesi lampau Selesai, sesi mendatang Menunggu; perangkat & video tersimpan
        $this->assertSame('Selesai', TransJadwal::find($s1)->status_sesi);
        $this->assertSame('Menunggu', TransJadwal::find($s3)->status_sesi);
        $this->assertSame('ATP', TransJadwal::find($s1)->perangkat[0]['jenis']);
        $this->assertTrue(VideoTautan::where('jenis', 'JADWAL')->where('id_target', $s1)->where('id_video', $video->id_video)->exists());

        $p = $this->getJson('/api/program-ajar/promes?id_mapel=MPL-A&id_kelas=KLS-A&id_periode=PER-T')->assertOk();
        $this->assertSame(2, $p->json('minggu_ini'));
        $baris = collect($p->json('baris'))->keyBy('id');
        $this->assertSame('TUNTAS', $baris[$this->baris1]['status']);   // TP dipilih langsung + indikator: 4 dari 4 JP
        $this->assertEquals(4, $baris[$this->baris1]['jp_selesai']);
        $this->assertSame('TERJADWAL', $baris[$this->baris2]['status']); // lewat materi, sesi belum berlangsung
        $this->assertSame(1, $p->json('ringkasan.tp_tuntas'));
        $this->assertSame(67, $p->json('ringkasan.persen'));
        $this->assertSame([], $p->json('sesi_lepas'));

        // Prota memuat semester yang ada pada tahun ajaran itu
        $this->getJson('/api/program-ajar/prota?id_mapel=MPL-A&id_kelas=KLS-A&tahun_ajaran=2029/2030')->assertOk()
            ->assertJsonPath('semester.0.periode.semester', 'Genap')->assertJsonPath('semester.0.ringkasan.tp_tuntas', 1);
    }

    public function test_status_otomatis_hanya_pembatalan_yang_manual(): void
    {
        Sanctum::actingAs($this->sekolah->guruA);
        $id = $this->sesi('2030-01-15');
        $this->patchJson("/api/jadwal/{$id}/status", ['status_sesi' => 'Berlangsung'])->assertOk()->assertJsonPath('status_sesi', 'Selesai');
        $this->patchJson("/api/jadwal/{$id}/status", ['status_sesi' => 'Batal'])->assertOk()->assertJsonPath('status_sesi', 'Batal');
        TransJadwal::perbaruiStatusOtomatis();
        $this->assertSame('Batal', TransJadwal::find($id)->status_sesi);
        $this->patchJson("/api/jadwal/{$id}/status", ['status_sesi' => 'Menunggu'])->assertOk()->assertJsonPath('status_sesi', 'Selesai');

        // Sesi yang sedang berjalan diperbarui penjadwal
        $kini = TransJadwal::create(['id_jadwal' => 'JDW-KINI', 'id_mapel' => 'MPL-A', 'id_kelas' => 'KLS-A', 'status_sesi' => 'Menunggu',
            'mulai' => '2030-01-22 09:30', 'selesai' => '2030-01-22 11:00']);
        $this->artisan('jadwal:status-otomatis')->assertSuccessful();
        $this->assertSame('Berlangsung', $kini->fresh()->status_sesi);
    }

    public function test_minggu_tidak_efektif_menggeser_rencana_dan_hanya_pimpinan_yang_mengatur(): void
    {
        $kalender = ['tanggal_mulai' => '2030-01-07', 'tanggal_selesai' => '2030-03-30', 'minggu_tidak_efektif' => [['mulai' => '2030-01-16', 'keterangan' => 'Asesmen awal']]];
        Sanctum::actingAs($this->sekolah->guruA);
        $this->putJson('/api/program-ajar/kalender/PER-T', $kalender)->assertForbidden();

        Sanctum::actingAs($this->sekolah->kepsek);
        $this->putJson('/api/program-ajar/kalender/PER-T', $kalender)->assertOk();
        // Disimpan sebagai hari Senin minggu itu
        $this->assertSame('2030-01-14', MasterPeriode::find('PER-T')->minggu_tidak_efektif[0]['mulai']);

        $p = $this->getJson('/api/program-ajar/promes?id_mapel=MPL-A&id_kelas=KLS-A&id_periode=PER-T')->assertOk();
        $this->assertFalse($p->json('minggu.1.efektif'));
        $this->assertSame('Asesmen awal', $p->json('minggu.1.ditandai'));
        $baris = collect($p->json('baris'))->keyBy('id');
        // Minggu efektif 1–2 kini = kalender minggu 0 dan 2
        $this->assertSame(0, $baris[$this->baris1]['rencana']['awal']);
        $this->assertSame(2, $baris[$this->baris1]['rencana']['akhir']);
        $this->assertSame(['nama' => 'Januari 2030', 'efektif' => 3, 'tidak_efektif' => 1],
            collect($p->json('bulan.0'))->only(['nama', 'efektif', 'tidak_efektif'])->all());
    }
}

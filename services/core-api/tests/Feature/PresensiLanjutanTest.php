<?php

namespace Tests\Feature;

use App\Models\TransJurnal;
use App\Models\TransPembinaanPresensi;
use App\Models\TransPresensi;
use App\Models\TransPresensiMapel;
use App\Services\NotifikasiService;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\Concerns\MembuatDataSekolah;
use Tests\TestCase;

/**
 * Presensi lanjutan: keterangan → jurnal catatan terpisah, Sabtu ditolak, presensi per mapel oleh guru mapel
 * (mengisi presensi harian bila belum ada), dan rencana pembinaan dengan status otomatis + tindak lanjut.
 */
class PresensiLanjutanTest extends TestCase
{
    use RefreshDatabase, MembuatDataSekolah;

    protected function setUp(): void
    {
        parent::setUp();
        $this->buatSekolah();
        Carbon::setTestNow(Carbon::parse('2030-01-25 10:00', config('app.zona_sekolah'))); // Jumat
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function harian(string $tanggal, array $records)
    {
        return $this->postJson('/api/presensi/batch', ['id_kelas' => 'KLS-A', 'id_periode' => 'PER-T', 'tanggal' => $tanggal, 'records' => $records]);
    }

    public function test_keterangan_tercatat_ke_jurnal_dan_sabtu_ditolak(): void
    {
        Sanctum::actingAs($this->sekolah->guruA);
        $this->harian('2030-01-26', [['id_siswa' => 'SIS-1', 'status_kehadiran' => 'HADIR']])->assertStatus(422)->assertJsonValidationErrors('tanggal');

        $this->harian('2030-01-25', [
            ['id_siswa' => 'SIS-1', 'status_kehadiran' => 'SAKIT', 'keterangan' => 'demam sejak semalam'],
            ['id_siswa' => 'SIS-2', 'status_kehadiran' => 'HADIR'],
        ])->assertOk();
        $p = TransPresensi::where('id_siswa', 'SIS-1')->first();
        $this->assertSame('demam sejak semalam', $p->keterangan);
        $j = TransJurnal::find($p->id_jurnal);
        $this->assertSame('PISAH', $j->mode_dampak);
        $this->assertStringContainsString('Sakit — demam sejak semalam', $j->narasi_kejadian);
        $this->assertEquals(0, $j->val_S + $j->val_T + $j->val_N + $j->val_K + $j->val_M);
        $this->assertSame('GR-A', $j->id_guru);
        $this->assertNull(TransPresensi::where('id_siswa', 'SIS-2')->value('id_jurnal'));

        // Keterangan diubah → jurnal yang sama diperbarui; dikosongkan → jurnal otomatis dihapus
        $this->harian('2030-01-25', [['id_siswa' => 'SIS-1', 'status_kehadiran' => 'SAKIT', 'keterangan' => 'belum tahu sakitnya apa']])->assertOk();
        $this->assertSame($j->id_jurnal, TransPresensi::where('id_siswa', 'SIS-1')->value('id_jurnal'));
        $this->assertStringContainsString('belum tahu', TransJurnal::find($j->id_jurnal)->narasi_kejadian);
        $this->harian('2030-01-25', [['id_siswa' => 'SIS-1', 'status_kehadiran' => 'HADIR', 'keterangan' => '']])->assertOk();
        $this->assertNull(TransJurnal::find($j->id_jurnal));
    }

    public function test_presensi_per_mapel_oleh_guru_mapel(): void
    {
        // Wali kelas sudah mengisi harian SIS-1; SIS-2 & SIS-3 belum
        Sanctum::actingAs($this->sekolah->admin);
        $this->harian('2030-01-25', [['id_siswa' => 'SIS-1', 'status_kehadiran' => 'HADIR']])->assertOk();

        Sanctum::actingAs($this->sekolah->guruB);
        $this->getJson('/api/presensi/mapel?id_kelas=KLS-A&id_mapel=MPL-A&tanggal=2030-01-25')->assertForbidden();

        Sanctum::actingAs($this->sekolah->guruA);
        $this->getJson('/api/presensi/mapel?id_kelas=KLS-A&id_mapel=MPL-A&tanggal=2030-01-25')->assertOk()->assertJsonCount(1, 'harian');
        $r = $this->postJson('/api/presensi/mapel', ['id_kelas' => 'KLS-A', 'id_periode' => 'PER-T', 'id_mapel' => 'MPL-A', 'tanggal' => '2030-01-25', 'records' => [
            ['id_siswa' => 'SIS-1', 'status_kehadiran' => 'IZIN', 'keterangan' => 'dijemput orang tua pukul 10'],
            ['id_siswa' => 'SIS-2', 'status_kehadiran' => 'SAKIT', 'keterangan' => 'demam'],
            ['id_siswa' => 'SIS-3', 'status_kehadiran' => 'HADIR'],
        ]])->assertOk();
        $this->assertSame(2, $r->json('harian_baru'));

        // Harian yang sudah ada tidak diubah; yang belum ada diisi guru mapel (pengisi pertama)
        $this->assertSame('HADIR', TransPresensi::where('id_siswa', 'SIS-1')->value('status_kehadiran'));
        $sis2 = TransPresensi::where('id_siswa', 'SIS-2')->first();
        $this->assertSame(['SAKIT', 'MAPEL'], [$sis2->status_kehadiran, $sis2->sumber]);
        $this->assertSame(3, TransPresensiMapel::count());
        $jurnal = TransJurnal::find(TransPresensiMapel::where('id_siswa', 'SIS-2')->value('id_jurnal'));
        $this->assertStringContainsString('Presensi Matematika: Sakit — demam', $jurnal->narasi_kejadian);
        $this->assertSame($jurnal->id_jurnal, $sis2->id_jurnal); // satu jurnal, tidak dobel
        $this->assertSame(2, TransJurnal::count());
    }

    public function test_pembinaan_status_otomatis_tindak_lanjut_dan_jurnal(): void
    {
        Sanctum::actingAs($this->sekolah->guruA);
        // Riwayat: SIS-1 alpa dua kali
        foreach (['2030-01-07' => 'ALPA', '2030-01-08' => 'ALPA', '2030-01-09' => 'HADIR'] as $t => $st) {
            $this->harian($t, [['id_siswa' => 'SIS-1', 'status_kehadiran' => $st]])->assertOk();
        }

        $r = $this->postJson('/api/presensi/pembinaan', ['id_siswa' => 'SIS-1', 'id_periode' => 'PER-T',
            'tindakan' => ['Menghubungi orang tua/wali (WA atau telepon)', 'Antar-jemput dengan ojek langganan'],
            'tanggal_mulai' => '2030-01-10', 'tanggal_tindak_lanjut' => '2030-01-24'])->assertCreated();
        $id = $r->json('data.id_pembinaan');
        $this->assertSame('OTOMATIS', $r->json('data.status'));
        $this->assertSame(2, $r->json('data.ringkasan_awal.alpa'));
        $this->assertSame('BERLANGSUNG', $r->json('data.efektif.status'));
        $this->assertTrue($r->json('data.perlu_tindak_lanjut'));

        // Tindak lanjut sudah tiba → masuk Perlu Tindakan pembuat
        $notif = (new NotifikasiService($this->sekolah->guruA))->semua()->firstWhere('jenis', 'pembinaan-presensi');
        $this->assertNotNull($notif);
        $this->assertStringContainsString('pembinaan=1', $notif['tautan']);

        // Langkah pembinaan dicatat ke jurnal (dibuat lewat menu Jurnal, catatan terpisah)
        $j = $this->postJson('/api/jurnal/store', ['tanggal' => '2030-01-25', 'id_siswa' => 'SIS-1', 'id_kelas' => 'KLS-A',
            'narasi_kejadian' => '[Pembinaan kehadiran] Menelepon ibu siswa; siswa berjanji datang tepat waktu.', 'mode_dampak' => 'PISAH'])->assertCreated();
        $this->postJson("/api/presensi/pembinaan/{$id}/jurnal", ['id_jurnal' => $j->json('data.id_jurnal')])->assertOk()->assertJsonCount(1, 'data.jurnal_detail');

        // Guru lain (bukan pembuat, bukan wali kelas) tidak boleh mengubah
        Sanctum::actingAs($this->sekolah->guruB);
        $this->patchJson("/api/presensi/pembinaan/{$id}/status", ['status' => 'BATAL'])->assertForbidden();

        // 10 hari hadir berturut-turut sejak mulai → selesai otomatis, hilang dari Perlu Tindakan
        Sanctum::actingAs($this->sekolah->guruA);
        foreach (['2030-01-10', '2030-01-11', '2030-01-14', '2030-01-15', '2030-01-16', '2030-01-17', '2030-01-18', '2030-01-21', '2030-01-22', '2030-01-23'] as $t) {
            $this->harian($t, [['id_siswa' => 'SIS-1', 'status_kehadiran' => 'HADIR']])->assertOk();
        }
        $daftar = $this->getJson('/api/presensi/pembinaan?id_kelas=KLS-A&id_periode=PER-T')->assertOk();
        $this->assertSame('SELESAI', $daftar->json('data.0.efektif.status'));
        $this->assertSame(10, $daftar->json('data.0.efektif.beruntun'));
        $this->assertNull((new NotifikasiService($this->sekolah->guruA))->semua()->firstWhere('jenis', 'pembinaan-presensi'));

        // Status manual & hapus
        $this->patchJson("/api/presensi/pembinaan/{$id}/status", ['status' => 'SELESAI', 'hasil' => 'Kehadiran pulih'])->assertOk()->assertJsonPath('data.tanggal_selesai', '2030-01-25');
        $this->deleteJson("/api/presensi/pembinaan/{$id}")->assertOk();
        $this->assertSame(0, TransPembinaanPresensi::count());
        $this->assertNotNull(TransJurnal::find($j->json('data.id_jurnal'))); // jurnal tetap ada
    }
}

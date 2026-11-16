<?php

namespace Tests\Feature;

use App\Models\MasterIndikator;
use App\Models\PetaTema;
use App\Models\Teacher;
use App\Models\TransJadwal;
use App\Models\User;
use App\Services\PanduanKerjaService;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\Concerns\MembuatDataSekolah;
use Tests\TestCase;

/**
 * Peta Tema menggerakkan Jadwal: slot pola dari JP per minggu / teks rekomendasi, Buat Jadwal (bentrok dilewati, TP tertaut),
 * sinkron dua arah (pola → jadwal, rangkaian sesi digeser → pola), batas 3 perubahan + buka kunci, cek keselarasan,
 * dan milestone Peta Tema di Peta Kerja guru.
 */
class PetaTemaJadwalTest extends TestCase
{
    use RefreshDatabase, MembuatDataSekolah;

    protected function setUp(): void
    {
        parent::setUp();
        $this->buatSekolah();
        MasterIndikator::create(['id_indikator' => 'IND-1', 'id_materi' => 'MTR-T', 'deskripsi' => 'Menghitung skor permainan', 'urutan' => 1]);
    }

    private function sebagai(User $user): static
    {
        Sanctum::actingAs($user);
        return $this;
    }

    private function petaSiap(): string
    {
        $jaring = ['mapel' => [
            ['id_mapel' => 'MPL-A', 'nama' => 'Matematika', 'kalibrasi' => 'Hitung skor', 'tp' => ['IND-1'], 'jp_minggu' => 4, 'frekuensi' => 'PILIH', 'hari' => [1, 3]],
            ['id_mapel' => 'MPL-B', 'nama' => 'IPA', 'kalibrasi' => 'Gaya pada bola', 'jp_minggu' => 2, 'frekuensi' => 'DUA_MINGGU', 'hari' => [2]],
        ]];
        return $this->sebagai($this->sekolah->kepsek)->postJson('/api/perangkat-ajar/tema', [
            'judul' => 'Main Bola', 'id_kelas' => 'KLS-A', 'tanggal_mulai' => '2030-01-07', 'jumlah_minggu' => 2, 'jaring' => $jaring,
            'minggu' => [['ke' => 1, 'judul' => 'Aku', 'realita' => 'Bermain bola', 'imajinasi' => 'Gambar lapangan']],
        ])->assertCreated()->json('data.id_peta');
    }

    public function test_slot_dari_jp_buat_jadwal_dan_sinkron_dua_arah_dengan_batas_perubahan(): void
    {
        $s = $this->sekolah;
        $zona = config('app.zona_sekolah');
        $id = $this->petaSiap();

        // Slot dari JP: Matematika 4 JP di Senin & Rabu (2 JP), IPA 2 JP dua minggu sekali di Selasa
        $draf = $this->postJson("/api/perangkat-ajar/tema/{$id}/slot", ['sumber' => 'jp', 'jam_masuk' => '07:30', 'jam_pulang' => '12:30'])->assertOk()
            ->assertJsonPath('jp_pola.MPL-A', 4)->assertJsonPath('jp_pola.MPL-B', 1)->json('data');
        $this->assertSame([[1, '07:30', '08:40', 'MPL-A', 'MINGGUAN'], [2, '07:30', '08:40', 'MPL-B', 'GANJIL'], [3, '07:30', '08:40', 'MPL-A', 'MINGGUAN']],
            array_map(fn($x) => [$x['hari'], $x['mulai'], $x['selesai'], $x['id_mapel'], $x['ulang']], $draf['slot']));
        $this->sebagai($s->guruA)->postJson("/api/perangkat-ajar/tema/{$id}/slot", ['sumber' => 'jp'])->assertForbidden();

        // Simpan slot → teks pola mingguan ikut tersusun
        $this->sebagai($s->kepsek)->putJson("/api/perangkat-ajar/tema/{$id}", ['pola_slot' => $draf])->assertOk()
            ->assertJsonPath('data.pola.senin', '07:30–08:40 Matematika: Hitung skor')->assertJsonPath('data.pola.selasa', '07:30–08:40 IPA: Gaya pada bola (minggu ganjil)');

        // Buat Jadwal hanya setelah ditetapkan; sesi manual kelas di Rabu minggu pertama → bentrok, dilewati
        $this->getJson("/api/perangkat-ajar/tema/{$id}/jadwal")->assertStatus(422);
        $this->postJson("/api/perangkat-ajar/tema/{$id}/tetapkan")->assertOk();
        TransJadwal::create(['id_jadwal' => 'JDW-MANUAL', 'id_periode' => 'PER-T', 'id_kelas' => 'KLS-A', 'id_guru' => 'GR-B', 'judul' => 'Upacara',
            'mulai' => Carbon::parse('2030-01-09 07:30', $zona), 'selesai' => Carbon::parse('2030-01-09 08:00', $zona), 'status_sesi' => 'Menunggu']);
        $this->getJson("/api/perangkat-ajar/tema/{$id}/jadwal")->assertOk()
            ->assertJsonPath('ringkasan.total', 5)->assertJsonPath('ringkasan.BARU', 4)->assertJsonPath('ringkasan.BENTROK', 1)->assertJsonPath('jadwal_manual', 1);
        $this->sebagai($s->guruA)->postJson("/api/perangkat-ajar/tema/{$id}/jadwal")->assertForbidden();
        $this->sebagai($s->kepsek)->postJson("/api/perangkat-ajar/tema/{$id}/jadwal")->assertCreated()->assertJsonPath('dibuat', 4)->assertJsonPath('bentrok', 1);
        $this->postJson("/api/perangkat-ajar/tema/{$id}/jadwal")->assertCreated()->assertJsonPath('dibuat', 0)->assertJsonPath('sudah_ada', 4);

        $sesi = TransJadwal::where('id_peta', $id)->orderBy('mulai')->get();
        $this->assertSame(['2030-01-07 MPL-A GR-A', '2030-01-08 MPL-B GR-B', '2030-01-14 MPL-A GR-A', '2030-01-16 MPL-A GR-A'],
            $sesi->map(fn($j) => $j->mulai->format('Y-m-d') . " {$j->id_mapel} {$j->id_guru}")->all());
        $this->assertSame("TEMA-{$id}", $sesi[0]->id_group);
        $this->assertSame(['TEMA', 'INDIKATOR'], array_column($sesi[0]->perangkat, 'jenis'));
        $this->assertSame('MTR-T', $sesi[0]->id_materi);

        // Pola diubah kepala sekolah → sesi tema yang akan datang menyesuaikan, dihitung perubahan ke-1
        $draf['slot'][0]['mulai'] = '09:00';
        $draf['slot'][0]['selesai'] = '10:10';
        $this->putJson("/api/perangkat-ajar/tema/{$id}", ['pola_slot' => $draf])->assertOk()->assertJsonPath('sinkron.diperbarui', 2);
        $this->assertSame(['09:00', '09:00'], TransJadwal::where('id_peta', $id)->where('id_mapel', 'MPL-A')->whereRaw('EXTRACT(ISODOW FROM mulai) = 1')->get()->map(fn($j) => $j->mulai->format('H:i'))->all());
        $this->assertSame(1, PetaTema::find($id)->jumlah_perubahan);

        // Guru menggeser rangkaian sesi tema di Jadwal → slot pola ikut berubah (perubahan ke-2); hanya slot itu yang bergeser
        $rabu = TransJadwal::where('id_peta', $id)->whereDate('mulai', '2030-01-16')->first();
        $this->sebagai($s->guruA)->patchJson("/api/jadwal/{$rabu->id_jadwal}/geser", ['mode' => 'all', 'delta_mulai' => 60, 'delta_selesai' => 60])->assertOk();
        $peta = PetaTema::find($id);
        $this->assertSame(2, $peta->jumlah_perubahan);
        $this->assertSame('JADWAL', collect($peta->riwayat_pola)->last()['sumber']);
        $this->assertSame(['08:30', '09:40'], [collect($peta->pola_slot['slot'])->firstWhere('hari', 3)['mulai'], collect($peta->pola_slot['slot'])->firstWhere('hari', 3)['selesai']]);
        $this->assertSame('09:00', TransJadwal::where('id_peta', $id)->whereDate('mulai', '2030-01-14')->first()->mulai->format('H:i'));
        // Guru tidak menghapus sesi tema
        $this->deleteJson("/api/jadwal/{$rabu->id_jadwal}")->assertForbidden();

        // Perubahan ke-3 → terkunci: guru tidak bisa menggeser sesi tema, kepala sekolah perlu membuka kunci
        $this->sebagai($s->kepsek)->putJson("/api/perangkat-ajar/tema/{$id}", ['jumlah_minggu' => 3])->assertOk()->assertJsonPath('data.terkunci', true);
        $this->sebagai($s->guruA)->patchJson("/api/jadwal/{$rabu->id_jadwal}/geser", ['delta_mulai' => 30, 'delta_selesai' => 30])->assertForbidden();
        $draf['slot'][0]['mulai'] = '10:00';
        $draf['slot'][0]['selesai'] = '11:10';
        $this->sebagai($s->kepsek)->putJson("/api/perangkat-ajar/tema/{$id}", ['pola_slot' => $draf])->assertStatus(422);
        $this->postJson("/api/perangkat-ajar/tema/{$id}/buka-kunci", ['alasan' => 'Libur mendadak'])->assertOk()->assertJsonPath('data.terkunci', false);
        $this->putJson("/api/perangkat-ajar/tema/{$id}", ['pola_slot' => $draf])->assertOk();
        $this->assertSame(1, PetaTema::find($id)->jumlah_perubahan);
        $this->assertSame(['POLA', 'JADWAL', 'POLA', 'KUNCI', 'POLA'], array_column(PetaTema::find($id)->riwayat_pola, 'sumber'));
    }

    public function test_slot_dari_teks_rekomendasi_cek_keselarasan_dan_peta_kerja(): void
    {
        $s = $this->sekolah;
        $id = $this->petaSiap();

        // Teks hasil Rekomendasi AI → slot (mapel dicocokkan ke cabang, baris non-mapel menjadi kegiatan)
        $pola = ['senin' => "07:30 Pembukaan & Realita\n08:05 Matematika: hitung skor\n09:15 Istirahat\n09:45 IPA: gaya", 'selasa' => '', 'rabu' => '', 'kamis' => '', 'jumat' => '', 'sabtu' => ''];
        $slot = $this->postJson("/api/perangkat-ajar/tema/{$id}/slot", ['sumber' => 'teks', 'pola' => $pola, 'jam_pulang' => '12:00'])->assertOk()->json('data.slot');
        $this->assertSame([['07:30', '08:05', null], ['08:05', '09:15', 'MPL-A'], ['09:15', '09:45', null], ['09:45', '10:55', 'MPL-B']],
            array_map(fn($x) => [$x['mulai'], $x['selesai'], $x['id_mapel']], $slot));
        $this->assertSame('hitung skor', $slot[1]['kegiatan']);
        $this->postJson("/api/perangkat-ajar/tema/{$id}/slot", ['sumber' => 'teks', 'pola' => ['senin' => 'Bermain bebas']])->assertStatus(422);

        // Cek keselarasan: JP target vs pola, belum ada ATP, TP belum di ATP
        $this->putJson("/api/perangkat-ajar/tema/{$id}", ['pola_slot' => ['slot' => $slot]])->assertOk();
        $cek = $this->sebagai($s->kepsek)->getJson("/api/perangkat-ajar/tema/{$id}/cek")->assertOk()->json();
        $teks = array_column($cek['masalah'], 'teks');
        $this->assertContains('Matematika: target 4 JP/minggu, pola baru menyediakan 2 JP.', $teks);
        $this->assertSame('bahaya', $cek['masalah'][0]['tingkat']);
        $this->assertTrue(collect($teks)->contains(fn($t) => str_contains($t, 'Matematika: belum ada ATP')));
        $this->assertSame('TIDAK_DI_ATP', $cek['mapel'][0]['tp'][0]['status']);
        $this->assertEquals(1, $cek['mapel'][1]['jp_target']); // dua minggu sekali → rata-rata setengah

        // Peta Kerja guru: Peta Tema wajib, menunggu kepala sekolah sampai ditetapkan & masuk Jadwal
        $langkah = fn() => collect((new PanduanKerjaService(Teacher::find('GR-A')))->hitung()['tahap'][0]['langkah'])->firstWhere('id', 'peta_tema');
        $this->assertSame('menunggu', $langkah()['status']);
        $this->assertTrue($langkah()['wajib']);
        $this->assertStringContainsString('masih disusun kepala sekolah', $langkah()['rincian'][0]['catatan']);
        $this->postJson("/api/perangkat-ajar/tema/{$id}/tetapkan")->assertOk();
        $this->postJson("/api/perangkat-ajar/tema/{$id}/jadwal")->assertCreated();
        $this->assertSame('selesai', $langkah()['status']);
    }
}

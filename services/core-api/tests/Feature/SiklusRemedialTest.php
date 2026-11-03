<?php

namespace Tests\Feature;

use App\Models\MasterIndikator;
use App\Models\SchoolSetting;
use App\Models\Student;
use App\Models\TransNilai;
use App\Models\TransRencanaRemedial;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\Concerns\MembuatDataSekolah;
use Tests\TestCase;

/**
 * Siklus remedial: batas nilai remedial di rapor (kebijakan sekolah), data efektivitas tindak lanjut
 * di dasbor, dan pesan WhatsApp untuk orang tua saat rencana dibuat dan hasilnya dicatat.
 */
class SiklusRemedialTest extends TestCase
{
    use RefreshDatabase, MembuatDataSekolah;

    protected function setUp(): void
    {
        parent::setUp();
        $this->buatSekolah();
        MasterIndikator::create(['id_indikator' => 'IND-1', 'id_materi' => 'MTR-T', 'deskripsi' => 'Menyebutkan pembilang', 'urutan' => 1]);
        MasterIndikator::create(['id_indikator' => 'IND-2', 'id_materi' => 'MTR-T', 'deskripsi' => 'Membandingkan pecahan', 'urutan' => 2]);
        Student::whereKey('SIS-1')->update(['no_wa' => '0812-3456-789']);
        Sanctum::actingAs($this->sekolah->guruA);
        $this->getJson('/api/settings')->assertOk(); // baris pengaturan bawaan
    }

    /** Ani: nilai asal 50 (indikator 1 = 80 tuntas, indikator 2 = 20) → rencana Tes Ulang → remedial. */
    private function remedialAni(float $nilaiRemedial = 95): string
    {
        $this->postJson('/api/nilai/batch', $this->sekolah->meta + ['tanggal' => '2030-01-05', 'records' => [
            ['id_siswa' => 'SIS-1', 'nilai_indikator' => ['IND-1' => 80, 'IND-2' => 20]],
        ]])->assertOk();
        $this->postJson('/api/remedial', [
            'id_nilai' => [TransNilai::value('id_nilai')], 'opsi_tindakan' => 'Tes Ulang', 'tanggal_rencana' => '2030-01-08',
            'masuk_jadwal' => true, 'jam_mulai' => '13:00', 'jam_selesai' => '14:00',
        ])->assertOk();
        $idRencana = TransRencanaRemedial::value('id_rencana');
        if ($nilaiRemedial) {
            $this->postJson('/api/nilai/batch', $this->sekolah->meta + ['tanggal' => '2030-01-08', 'tipe_nilai' => 'REMEDIAL', 'records' => [
                ['id_siswa' => 'SIS-1', 'id_rencana' => $idRencana, 'nilai' => $nilaiRemedial],
            ]])->assertOk();
        }
        return $idRencana;
    }

    public function test_nilai_remedial_di_rapor_dibatasi_kkm_sesuai_pengaturan(): void
    {
        $this->remedialAni(95);
        $rapor = fn() => collect($this->getJson('/api/rapor/data?id_kelas=KLS-A&id_periode=PER-T')->assertOk()->json('nilai'))->firstWhere('id_siswa', 'SIS-1');

        // Bawaan: dibatasi KKM 75; nilai yang tersimpan tetap 95
        $this->assertEquals(75, $rapor()['nilai']);
        $this->assertEquals(95, TransNilai::where('tipe_nilai', 'REMEDIAL')->value('nilai'));
        $this->assertEquals(75, collect($this->getJson('/api/dashboard?id_periode=PER-T&id_kelas=KLS-A')->json('nilai'))->firstWhere('id_siswa', 'SIS-1')['nilai']);

        SchoolSetting::first()->update(['batas_nilai_remedial' => 'ASLI']);
        $this->assertEquals(95, $rapor()['nilai']);

        Sanctum::actingAs($this->sekolah->admin);
        $this->postJson('/api/settings', ['batas_nilai_remedial' => 'LAIN'])->assertUnprocessable();
        $this->postJson('/api/settings', ['batas_nilai_remedial' => 'KKM'])->assertOk();
        $this->assertSame('KKM', SchoolSetting::first()->batas_nilai_remedial);
    }

    public function test_dashboard_memuat_rencana_dengan_nilai_remedial_apa_adanya(): void
    {
        $this->remedialAni(95);

        $rencana = $this->getJson('/api/dashboard?id_periode=PER-T&id_kelas=KLS-A')->assertOk()->json('rencana_remedial');
        $this->assertCount(1, $rencana);
        $this->assertSame('Tes Ulang', $rencana[0]['opsi_tindakan']);
        $this->assertSame('SELESAI', $rencana[0]['status']);
        $this->assertEquals(50, $rencana[0]['nilai_asal']);
        $this->assertEquals(95, $rencana[0]['nilai_remedial']);

        $this->assertCount(0, $this->getJson('/api/dashboard?id_periode=PER-T&id_kelas=KLS-B')->json('rencana_remedial'));
    }

    public function test_pesan_wa_rencana_dan_hasil_untuk_orang_tua(): void
    {
        $idRencana = $this->remedialAni(0);

        $rencana = $this->postJson('/api/remedial/notifikasi', ['jenis' => 'RENCANA', 'id_rencana' => [$idRencana]])->assertOk();
        $this->assertFalse($rencana->json('wa_otomatis'));
        $this->assertSame('628123456789', $rencana->json('data.0.nomor'));
        $pesan = $rencana->json('data.0.message');
        $this->assertStringContainsString('*Tes Ulang*', $pesan);
        $this->assertStringContainsString('pukul 13:00–14:00', $pesan);
        // Hanya indikator di bawah KKM yang disebut
        $this->assertStringContainsString('Membandingkan pecahan', $pesan);
        $this->assertStringNotContainsString('Menyebutkan pembilang', $pesan);

        // Belum ada nilai remedial: tidak ada pesan hasil
        $this->assertCount(0, $this->postJson('/api/remedial/notifikasi', ['jenis' => 'HASIL', 'id_rencana' => [$idRencana]])->json('data'));

        $this->postJson('/api/nilai/batch', $this->sekolah->meta + ['tanggal' => '2030-01-08', 'tipe_nilai' => 'REMEDIAL', 'records' => [
            ['id_siswa' => 'SIS-1', 'id_rencana' => $idRencana, 'nilai' => 90],
        ]])->assertOk();
        $hasil = $this->postJson('/api/remedial/notifikasi', ['jenis' => 'HASIL', 'id_rencana' => [$idRencana]])->assertOk()->json('data.0.message');
        $this->assertStringContainsString('nilai remedial: *90*', $hasil);
        $this->assertStringContainsString('dicatat 75 pada rapor', $hasil);
        $this->assertStringContainsString('*tuntas*', $hasil);

        // Guru mapel lain tidak boleh
        Sanctum::actingAs($this->sekolah->guruB);
        $this->postJson('/api/remedial/notifikasi', ['jenis' => 'HASIL', 'id_rencana' => [$idRencana]])->assertForbidden();
    }
}

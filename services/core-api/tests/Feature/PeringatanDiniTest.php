<?php

namespace Tests\Feature;

use App\Models\PaketSoal;
use App\Models\TransNilai;
use App\Models\TransPresensi;
use App\Models\User;
use App\Services\NotifikasiService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Laravel\Sanctum\Sanctum;
use Tests\Concerns\MembuatDataSekolah;
use Tests\TestCase;

/**
 * Peringatan dini siswa: skor dari presensi, nilai, dan tes online; tindak lanjut; akses per peran.
 */
class PeringatanDiniTest extends TestCase
{
    use RefreshDatabase, MembuatDataSekolah;

    protected function setUp(): void
    {
        parent::setUp();
        $this->buatSekolah();
    }

    private function presensi(string $siswa, int $hariLalu, string $status): void
    {
        TransPresensi::create([
            'id_presensi' => (string) Str::uuid(), 'id_siswa' => $siswa, 'id_kelas' => 'KLS-A', 'id_periode' => 'PER-T',
            'tanggal' => now(config('app.zona_sekolah'))->subDays($hariLalu)->toDateString(), 'status_kehadiran' => $status,
        ]);
    }

    private function nilai(string $siswa, string $mapel, float $nilai, int $hariLalu = 3): void
    {
        TransNilai::create([
            'id_nilai' => (string) Str::uuid(), 'id_siswa' => $siswa, 'id_mapel' => $mapel, 'nilai' => $nilai,
            'tanggal' => now()->subDays($hariLalu)->toDateString(),
        ] + $this->sekolah->meta);
    }

    private function siapkanData(): void
    {
        // Ani: 5 alpa dalam 30 hari, dua mapel di bawah KKM, satu tes online terlewat → TINGGI
        foreach ([1, 3, 5, 8, 12] as $h) $this->presensi('SIS-1', $h, 'ALPA');
        foreach ([2, 4, 6, 9] as $h) $this->presensi('SIS-1', $h, 'HADIR');
        $this->nilai('SIS-1', 'MPL-A', 60);
        $this->nilai('SIS-1', 'MPL-B', 55);
        PaketSoal::unguarded(fn() => PaketSoal::create([
            'id_paket' => 'PKT-1', 'judul' => 'Ulangan Pecahan', 'id_mapel' => 'MPL-A', 'id_kelas' => 'KLS-A', 'id_periode' => 'PER-T',
            'online' => true, 'online_mulai' => now()->subDays(3), 'online_selesai' => now()->subDay(),
        ]));
        \App\Models\PaketSoalJawaban::create(['id_paket' => 'PKT-1', 'id_siswa' => 'SIS-2', 'sumber' => 'ONLINE', 'selesai_pada' => now()->subDays(2)]);
        \App\Models\PaketSoalJawaban::create(['id_paket' => 'PKT-1', 'id_siswa' => 'SIS-3', 'sumber' => 'ONLINE', 'selesai_pada' => now()->subDays(2)]);

        // Budi: rajin dan nilainya tuntas → AMAN
        foreach ([1, 2, 3] as $h) $this->presensi('SIS-2', $h, 'HADIR');
        $this->nilai('SIS-2', 'MPL-A', 90);
    }

    public function test_skor_dan_alasan_dihitung_dari_presensi_nilai_dan_tes(): void
    {
        $this->siapkanData();
        Sanctum::actingAs($this->sekolah->guruA);
        $res = $this->getJson('/api/peringatan-dini')->assertOk();

        // Wali KLS-A hanya melihat siswa kelas binaannya (Dodi di KLS-B tidak ikut)
        $data = collect($res->json('data'))->keyBy('id_siswa');
        $this->assertEqualsCanonicalizing(['SIS-1', 'SIS-2', 'SIS-3'], $data->keys()->all());

        $ani = $data['SIS-1'];
        $this->assertSame('TINGGI', $ani['tingkat']);
        $this->assertEqualsCanonicalizing(['alpa-banyak', 'bawah-kkm', 'tes-terlewat'], array_column($ani['alasan'], 'kode'));
        $this->assertSame(4 + 3 + 2, $ani['skor']);
        $this->assertSame('SIS-1', $res->json('data.0.id_siswa'), 'Terurut dari skor tertinggi');
        $this->assertSame('AMAN', $data['SIS-2']['tingkat']);
        $this->assertSame(1, $res->json('ringkas.TINGGI'));

        // Catatan perilaku negatif di jurnal menambah alasan Karakter (isi catatan tidak ikut)
        \App\Models\TransJurnal::create(['id_jurnal' => (string) Str::uuid(), 'tanggal' => now()->subDay()->toDateString(), 'id_siswa' => 'SIS-3',
            'id_kelas' => 'KLS-A', 'narasi_kejadian' => 'Rahasia: bertengkar', 'val_K' => -2]);
        $citra = collect($this->getJson('/api/peringatan-dini')->json('data'))->firstWhere('id_siswa', 'SIS-3');
        $this->assertSame(['karakter'], array_column($citra['alasan'], 'kode'));
        $this->assertStringNotContainsString('Rahasia', json_encode($citra));

        // Notifikasi Perlu Tindakan untuk wali kelas
        $notif = (new NotifikasiService($this->sekolah->guruA))->semua()->firstWhere('jenis', 'peringatan-dini');
        $this->assertNotNull($notif);
        $this->assertStringContainsString('Ani', $notif['pesan']);
    }

    public function test_tindak_lanjut_menandai_ditangani_sampai_alasan_berubah(): void
    {
        $this->siapkanData();
        Sanctum::actingAs($this->sekolah->guruA);
        $this->postJson('/api/peringatan-dini/SIS-1/tindak', ['catatan' => 'Menelepon orang tua'])->assertOk()
            ->assertJsonPath('data.tindak_lanjut.masih_berlaku', true);
        $this->assertNull((new NotifikasiService($this->sekolah->guruA))->semua()->firstWhere('jenis', 'peringatan-dini'));

        // Bobot berubah tetapi jenis alasannya sama (tes terlewat jadi 2) → masih dianggap ditangani
        PaketSoal::unguarded(fn() => PaketSoal::create([
            'id_paket' => 'PKT-2', 'judul' => 'Kuis IPA', 'id_mapel' => 'MPL-B', 'id_kelas' => 'KLS-A', 'id_periode' => 'PER-T',
            'online' => true, 'online_mulai' => now()->subDays(2), 'online_selesai' => now()->subHour(),
        ]));
        $ani = collect($this->getJson('/api/peringatan-dini')->json('data'))->firstWhere('id_siswa', 'SIS-1');
        $this->assertSame(1, $ani['riwayat_tindak']);
        $this->assertSame('Menelepon orang tua', $ani['tindak_lanjut']['catatan']);
        $this->assertTrue($ani['tindak_lanjut']['masih_berlaku']);

        // Alasan baru (nilai menurun: tiga nilai lama tinggi, tiga terbaru rendah) → perlu ditindaklanjuti lagi
        foreach ([95, 95, 95] as $n) $this->nilai('SIS-1', 'MPL-A', $n, 20);
        $this->nilai('SIS-1', 'MPL-A', 40, 1);
        $ani = collect($this->getJson('/api/peringatan-dini')->json('data'))->firstWhere('id_siswa', 'SIS-1');
        $this->assertContains('nilai-turun', array_column($ani['alasan'], 'kode'));
        $this->assertFalse($ani['tindak_lanjut']['masih_berlaku']);
        $this->assertNotNull((new NotifikasiService($this->sekolah->guruA))->semua()->firstWhere('jenis', 'peringatan-dini'));

        $this->getJson('/api/peringatan-dini/SIS-1/riwayat')->assertOk()->assertJsonPath('data.0.catatan', 'Menelepon orang tua');
    }

    public function test_akses_per_peran(): void
    {
        $this->siapkanData();
        // Guru B (wali KLS-B) tidak boleh melihat atau mencatat untuk siswa KLS-A
        Sanctum::actingAs($this->sekolah->guruB);
        $this->getJson('/api/peringatan-dini?id_siswa=SIS-1')->assertForbidden();
        $this->postJson('/api/peringatan-dini/SIS-1/tindak', ['catatan' => 'coba'])->assertForbidden();

        // Guru tanpa kelas binaan ditolak
        $guru = User::create(['name' => 'Guru C', 'username' => 'guru_c', 'password' => 'rahasia123', 'role' => 'guru', 'aktif' => true]);
        Sanctum::actingAs($guru);
        $this->getJson('/api/peringatan-dini')->assertForbidden();

        // Siswa tidak boleh
        Sanctum::actingAs($this->sekolah->siswa);
        $this->getJson('/api/peringatan-dini')->assertForbidden();

        // Kepala sekolah melihat semua kelas; peninjau boleh melihat tetapi tidak mencatat
        Sanctum::actingAs($this->sekolah->kepsek);
        $this->assertCount(4, $this->getJson('/api/peringatan-dini')->assertOk()->json('data'));
        $peninjau = User::create(['name' => 'Wakakur', 'username' => 'wakakur_t', 'password' => 'rahasia123', 'role' => 'wakakur', 'aktif' => true]);
        Sanctum::actingAs($peninjau);
        $this->getJson('/api/peringatan-dini?id_kelas=KLS-A')->assertOk()->assertJsonCount(3, 'data');
        $this->postJson('/api/peringatan-dini/SIS-1/tindak', ['catatan' => 'coba'])->assertForbidden();
    }
}

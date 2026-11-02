<?php

namespace Tests\Feature;

use App\Models\TransJadwal;
use App\Models\TransNilai;
use App\Models\TransRencanaRemedial;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\Concerns\MembuatDataSekolah;
use Tests\TestCase;

/**
 * Siklus remedial di Input Nilai: penilaian per tanggal, rencana tindak lanjut untuk nilai
 * di bawah KKM (masuk Jadwal), nilai remedial yang menuntaskan rencana dan menggantikan
 * nilai asal di rekap, serta pembersihan jadwal saat rencana/nilai dihapus.
 */
class RemedialTest extends TestCase
{
    use RefreshDatabase, MembuatDataSekolah;

    private const RENCANA = [
        'opsi_tindakan' => 'Kelompok Kecil', 'catatan' => 'fokus pecahan', 'tanggal_rencana' => '2030-01-08',
        'masuk_jadwal' => true, 'jam_mulai' => '13:00', 'jam_selesai' => '14:00',
    ];

    protected function setUp(): void
    {
        parent::setUp();
        $this->buatSekolah();
    }

    private function sebagai(User $user): static
    {
        Sanctum::actingAs($user);
        return $this;
    }

    /** Simpan nilai SIS-1..3 pada satu tanggal; nilai di bawah 75 belum tuntas. */
    private function simpanNilai(string $tanggal, array $nilai, array $extra = [])
    {
        $records = array_map(fn ($sis, $n) => ['id_siswa' => $sis, 'nilai' => $n], ['SIS-1', 'SIS-2', 'SIS-3'], $nilai);
        return $this->postJson('/api/nilai/batch', $this->sekolah->meta + ['tanggal' => $tanggal, 'records' => $records] + $extra);
    }

    private function idNilai(string $siswa, string $tanggal): string
    {
        return TransNilai::where($this->sekolah->meta)->where('id_siswa', $siswa)
            ->whereDate('tanggal', $tanggal)->where('tipe_nilai', 'NORMAL')->value('id_nilai');
    }

    /** Nilai 2030-01-05: SIS-1 = 40, SIS-2 = 50 (belum tuntas), SIS-3 = 90 (tuntas). */
    private function siapkanNilaiBelumTuntas(): array
    {
        $this->sebagai($this->sekolah->guruA)->simpanNilai('2030-01-05', [40, 50, 90])->assertOk();
        return [$this->idNilai('SIS-1', '2030-01-05'), $this->idNilai('SIS-2', '2030-01-05'), $this->idNilai('SIS-3', '2030-01-05')];
    }

    public function test_tanggal_berbeda_adalah_penilaian_berbeda(): void
    {
        $this->sebagai($this->sekolah->guruA);
        $this->simpanNilai('2030-01-05', [40, 50, 90])->assertOk()->assertJson(['saved' => 3, 'perlu_tindak_lanjut' => 2]);
        $this->simpanNilai('2030-01-12', [60, 70, 95])->assertOk()->assertJson(['saved' => 3, 'updated' => 0]);
        $this->simpanNilai('2030-01-05', [45, 50, 90])->assertOk()->assertJson(['saved' => 0, 'updated' => 3]);

        $lembar = $this->getJson('/api/nilai/students?' . http_build_query($this->sekolah->meta + ['tanggal' => '2030-01-05']))->assertOk();
        $ani = collect($lembar->json('students'))->firstWhere('id_siswa', 'SIS-1');
        $this->assertEquals(45, $ani['nilai']);
        $this->assertCount(2, $lembar->json('tanggal_tersedia'));
    }

    public function test_rencana_tindak_lanjut_hanya_untuk_nilai_belum_tuntas(): void
    {
        [$n1, , $n3] = $this->siapkanNilaiBelumTuntas();

        $this->postJson('/api/remedial', self::RENCANA + ['id_nilai' => [$n3]])->assertUnprocessable();
        $this->postJson('/api/remedial', ['id_nilai' => [$n1]] + array_diff_key(self::RENCANA, ['jam_mulai' => 1]))->assertUnprocessable();
        // Guru B tidak mengampu mapel ini
        $this->sebagai($this->sekolah->guruB)->postJson('/api/remedial', self::RENCANA + ['id_nilai' => [$n1]])->assertForbidden();
    }

    public function test_rencana_kelompok_masuk_satu_jadwal_bersama(): void
    {
        [$n1, $n2] = $this->siapkanNilaiBelumTuntas();

        $this->postJson('/api/remedial', self::RENCANA + ['id_nilai' => [$n1, $n2]])->assertOk()->assertJsonCount(2, 'data');
        $r1 = TransRencanaRemedial::where('id_nilai_asal', $n1)->firstOrFail();
        $r2 = TransRencanaRemedial::where('id_nilai_asal', $n2)->firstOrFail();
        $jadwal = TransJadwal::findOrFail($r1->id_jadwal);

        $this->assertSame($r1->id_jadwal, $r2->id_jadwal);
        $this->assertSame('GR-A', $jadwal->id_guru);
        $this->assertSame('2030-01-08 13:00', $jadwal->mulai->format('Y-m-d H:i'));
        $this->assertSame('Remedial · Kelompok Kecil: 2 siswa', $jadwal->judul);

        // Satu nilai hanya boleh punya satu rencana
        $this->postJson('/api/remedial', self::RENCANA + ['id_nilai' => [$n1]])->assertUnprocessable();

        $lembar = $this->getJson('/api/nilai/students?' . http_build_query($this->sekolah->meta + ['tanggal' => '2030-01-05']));
        $this->assertSame('DIRENCANAKAN', collect($lembar->json('students'))->firstWhere('id_siswa', 'SIS-1')['rencana']['status']);

        // Mengubah jam satu siswa memindahkannya ke sesi sendiri; sesi bersama tetap ada
        $this->putJson("/api/remedial/{$r2->id_rencana}", array_merge(self::RENCANA, [
            'opsi_tindakan' => 'Bimbingan Individual', 'jam_mulai' => '15:00', 'jam_selesai' => '15:30',
        ]))->assertOk();
        $r2->refresh();
        $this->assertNotSame($r1->id_jadwal, $r2->id_jadwal);
        $this->assertSame('Remedial · Bimbingan Individual: Budi', TransJadwal::find($r2->id_jadwal)->judul);
        $this->assertTrue(TransJadwal::whereKey($r1->id_jadwal)->exists());
    }

    public function test_nilai_remedial_menuntaskan_rencana_dan_menggantikan_nilai_asal(): void
    {
        [$n1, $n2] = $this->siapkanNilaiBelumTuntas();
        $this->simpanNilai('2030-01-12', [60, 70, 95])->assertOk();
        $this->postJson('/api/remedial', self::RENCANA + ['id_nilai' => [$n1, $n2]])->assertOk();
        $r1 = TransRencanaRemedial::where('id_nilai_asal', $n1)->firstOrFail();

        $this->getJson('/api/nilai/remedial?' . http_build_query($this->sekolah->meta))->assertOk()->assertJsonCount(2, 'data');

        // Gaya import Excel: tipe per baris, tanpa id_rencana → dicocokkan ke rencana terbuka
        $this->postJson('/api/nilai/batch', $this->sekolah->meta + ['tanggal' => '2030-01-09', 'records' => [
            ['id_siswa' => 'SIS-1', 'nilai' => 80, 'tipe_nilai' => 'REMEDIAL'],
        ]])->assertOk();
        $r1->refresh();
        $this->assertSame('SELESAI', $r1->status);
        $this->assertSame('2030-01-09', $r1->tanggal_selesai->format('Y-m-d'));
        // Sesi dipakai bersama Budi yang belum remedial → jadwal belum selesai
        $this->assertSame('Menunggu', TransJadwal::find($r1->id_jadwal)->status_sesi);
        $this->postJson('/api/nilai/batch', $this->sekolah->meta + ['tanggal' => '2030-01-09', 'records' => [
            ['id_siswa' => 'SIS-2', 'nilai' => 76, 'tipe_nilai' => 'REMEDIAL'],
        ]])->assertOk();
        $this->assertSame('Selesai', TransJadwal::find($r1->id_jadwal)->status_sesi);

        // Import ulang ke rencana yang sudah selesai = koreksi, bukan nilai baru
        $this->postJson('/api/nilai/batch', $this->sekolah->meta + ['tanggal' => '2030-01-09', 'records' => [
            ['id_siswa' => 'SIS-1', 'nilai' => 82, 'tipe_nilai' => 'REMEDIAL'],
        ]])->assertOk()->assertJson(['saved' => 0, 'updated' => 1]);
        $this->assertEquals(82, $r1->nilaiRemedial()->value('nilai'));

        // Siswa tuntas tidak punya rencana → nilai remedial ditolak
        $this->postJson('/api/nilai/batch', $this->sekolah->meta + ['tanggal' => '2030-01-09', 'tipe_nilai' => 'REMEDIAL', 'records' => [
            ['id_siswa' => 'SIS-3', 'nilai' => 80],
        ]])->assertUnprocessable();

        $this->postJson('/api/nilai/batch', $this->sekolah->meta + ['tanggal' => '2030-01-10', 'tipe_nilai' => 'REMEDIAL', 'records' => [
            ['id_siswa' => 'SIS-1', 'nilai' => 78, 'id_rencana' => $r1->id_rencana],
        ]])->assertOk()->assertJson(['saved' => 0, 'updated' => 1]);

        // Rekap memakai nilai remedial (78) sebagai pengganti nilai asal (40)
        $efektif = TransNilai::efektif()->where($this->sekolah->meta)->where('id_siswa', 'SIS-1')
            ->pluck('nilai')->map(fn ($v) => (float) $v)->sort()->values()->all();
        $this->assertSame([60.0, 78.0], $efektif);

        // Rencana yang sudah bernilai tidak bisa dibatalkan; hapus nilai remedial membukanya lagi
        $this->deleteJson("/api/remedial/{$r1->id_rencana}")->assertUnprocessable();
        $this->deleteJson('/api/nilai/' . $r1->nilaiRemedial()->value('id_nilai'))->assertOk();
        $r1->refresh();
        $this->assertSame('DIRENCANAKAN', $r1->status);
        $this->assertSame('Menunggu', TransJadwal::find($r1->id_jadwal)->status_sesi);
    }

    public function test_jadwal_yang_tidak_terpakai_ikut_dihapus(): void
    {
        [$n1, $n2] = $this->siapkanNilaiBelumTuntas();
        $this->postJson('/api/remedial', self::RENCANA + ['id_nilai' => [$n1]])->assertOk();
        $this->postJson('/api/remedial', array_merge(self::RENCANA, ['jam_mulai' => '15:00', 'jam_selesai' => '16:00']) + ['id_nilai' => [$n2]])->assertOk();
        $r1 = TransRencanaRemedial::where('id_nilai_asal', $n1)->firstOrFail();
        $r2 = TransRencanaRemedial::where('id_nilai_asal', $n2)->firstOrFail();

        $this->deleteJson("/api/remedial/{$r2->id_rencana}")->assertOk();
        $this->assertFalse(TransJadwal::whereKey($r2->id_jadwal)->exists());

        // Hapus nilai asal → rencana & jadwalnya ikut bersih
        $this->deleteJson("/api/nilai/$n1")->assertOk();
        $this->assertFalse(TransRencanaRemedial::whereKey($r1->id_rencana)->exists());
        $this->assertFalse(TransJadwal::whereKey($r1->id_jadwal)->exists());
    }

    public function test_rencana_dari_admin_masuk_jadwal_guru_pengampu(): void
    {
        [, $n2] = $this->siapkanNilaiBelumTuntas();
        $res = $this->sebagai($this->sekolah->admin)->postJson('/api/remedial', self::RENCANA + ['id_nilai' => [$n2]])->assertOk();
        $this->assertSame('GR-A', TransJadwal::find($res->json('data.0.id_jadwal'))->id_guru);
    }

    public function test_rekap_tetap_berjalan_dengan_data_remedial(): void
    {
        [$n1] = $this->siapkanNilaiBelumTuntas();
        $this->postJson('/api/remedial', self::RENCANA + ['id_nilai' => [$n1]])->assertOk();
        $this->postJson('/api/nilai/batch', $this->sekolah->meta + ['tanggal' => '2030-01-09', 'tipe_nilai' => 'REMEDIAL', 'records' => [
            ['id_siswa' => 'SIS-1', 'nilai' => 80],
        ]])->assertOk();

        $periode = $this->sekolah->periode;
        $this->getJson("/api/nilai?id_kelas=KLS-A&id_periode=$periode")->assertOk();
        $this->sebagai($this->sekolah->admin)->getJson("/api/rapor/data?id_kelas=KLS-A&id_periode=$periode")->assertOk();
        $this->getJson("/api/dashboard?id_periode=$periode")->assertOk();
    }
}

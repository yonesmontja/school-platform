<?php

namespace Tests\Feature;

use App\Models\HariLibur;
use App\Models\MasterPeriode;
use App\Models\PengampuMapel;
use App\Models\TransJadwal;
use App\Models\TransJurnal;
use App\Models\TransNilai;
use App\Models\User;
use App\Services\Pengampu;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Symfony\Component\HttpKernel\Exception\HttpException;
use Tests\Concerns\MembuatDataSekolah;
use Tests\TestCase;

/**
 * Tutup Semester: periksa kelengkapan, pindah Ganjil → Genap dengan menyalin rombel aktif, pembagian mengajar,
 * dan pola jadwal, lalu mengunci semester lama. Pembagian mengajar per rombel membatasi akses nilai guru.
 */
class TutupSemesterTest extends TestCase
{
    use RefreshDatabase, MembuatDataSekolah;

    protected function setUp(): void
    {
        parent::setUp();
        $this->buatSekolah();
        // Skenario akhir semester Ganjil
        MasterPeriode::whereKey('PER-T')->update(['semester' => 'Ganjil', 'tanggal_mulai' => '2029-07-16', 'tanggal_selesai' => '2029-12-15']);
    }

    private function sebagai(User $user): static
    {
        Sanctum::actingAs($user);
        return $this;
    }

    private function nilai(string $id, string $tanggal = '2029-09-10'): TransNilai
    {
        return new TransNilai([
            'id_nilai' => $id, 'tanggal' => $tanggal, 'id_siswa' => 'SIS-1', 'id_mapel' => 'MPL-A', 'id_guru' => 'GR-A',
            'id_periode' => 'PER-T', 'id_jenis' => 'JNS-T', 'id_materi' => 'MTR-T', 'id_kelas' => 'KLS-A', 'nilai' => 80,
        ]);
    }

    public function test_hanya_admin_dan_periksa_mengusulkan_genap(): void
    {
        $s = $this->sekolah;
        $this->sebagai($s->guruA)->getJson('/api/semester/tutup')->assertForbidden();
        $this->sebagai($s->kepsek)->postJson('/api/semester/tutup', [])->assertForbidden();

        $r = $this->sebagai($s->admin)->getJson('/api/semester/tutup')->assertOk()
            ->assertJsonPath('usulan.tahun_ajaran', '2029/2030')->assertJsonPath('usulan.semester', 'Genap')
            ->assertJsonPath('naik_tahun', false)->assertJsonPath('salin.rombel', 2);
        // Catatan wali belum ada → muncul sebagai peringatan per rombel
        $this->assertContains('catatan_wali', collect($r->json('periksa'))->pluck('jenis')->all());
    }

    public function test_tutup_ganjil_ke_genap_menyalin_dan_mengunci(): void
    {
        $s = $this->sekolah;
        Model::unguarded(function () {
            PengampuMapel::create(['id_periode' => 'PER-T', 'id_kelas' => 'KLS-B', 'id_mapel' => 'MPL-A', 'id_guru' => 'GR-B']);
            // Seri jadwal mingguan Senin 07:30–08:40 di 4A
            foreach (['2029-09-03', '2029-09-10'] as $tgl) {
                TransJadwal::create(['id_jadwal' => "JDW-$tgl", 'id_group' => 'GRP-1', 'id_periode' => 'PER-T', 'id_kelas' => 'KLS-A', 'id_guru' => 'GR-A',
                    'id_mapel' => 'MPL-A', 'id_materi' => 'MTR-T', 'judul' => 'Matematika', 'mulai' => "$tgl 07:30:00", 'selesai' => "$tgl 08:40:00", 'status_sesi' => 'Selesai']);
            }
            HariLibur::create(['tanggal' => '2030-01-14', 'nama' => 'Libur uji', 'jenis' => 'SEKOLAH']);
        });
        $this->sebagai($s->admin)->putJson('/api/classes/KLS-B/aktif-semester', ['aktif' => false])->assertOk();

        $r = $this->postJson('/api/semester/tutup', [
            'tahun_ajaran' => '2029/2030', 'semester' => 'Genap', 'tanggal_mulai' => '2030-01-07', 'tanggal_selesai' => '2030-02-03',
            'salin_rombel' => true, 'salin_pengampu' => true, 'salin_jadwal' => true, 'kunci_lama' => true,
        ])->assertOk()->assertJsonPath('ringkasan.pengampu_disalin', 1)->assertJsonPath('ringkasan.jadwal_seri', 1);

        $genap = MasterPeriode::where('semester', 'Genap')->first();
        $this->assertSame('AKTIF', $genap->status_aktif);
        $this->assertTrue(MasterPeriode::find('PER-T')->terkunci);
        $this->assertSame('TUTUP', MasterPeriode::find('PER-T')->status_aktif);
        // Rombel nonaktif tetap nonaktif, pembagian mengajar ikut, rombel lama tercatat
        $this->assertDatabaseHas('kelas_periode', ['id_kelas' => 'KLS-B', 'id_periode' => $genap->id_periode, 'aktif' => false]);
        $this->assertDatabaseHas('pengampu_mapel', ['id_periode' => $genap->id_periode, 'id_kelas' => 'KLS-B', 'id_guru' => 'GR-B']);
        $this->assertDatabaseHas('siswa_rombel', ['id_siswa' => 'SIS-1', 'id_periode' => 'PER-T', 'id_kelas' => 'KLS-A']);
        // Senin 7, 14 (libur), 21, 28 Januari 2030 → 3 sesi, tanpa materi
        $sesi = TransJadwal::where('id_periode', $genap->id_periode)->orderBy('mulai')->get();
        $this->assertSame(['2030-01-07 07:30', '2030-01-21 07:30', '2030-01-28 07:30'], $sesi->map(fn($j) => $j->mulai->format('Y-m-d H:i'))->all());
        $this->assertNull($sesi->first()->id_materi);
        $this->assertSame(3, $r->json('ringkasan.jadwal_sesi'));
    }

    public function test_semester_terkunci_hanya_bisa_dibaca_kecuali_admin(): void
    {
        $s = $this->sekolah;
        MasterPeriode::whereKey('PER-T')->update(['terkunci' => true]);

        Sanctum::actingAs($s->guruA);
        foreach ([fn() => $this->nilai('NIL-G')->save(), fn() => (new TransJurnal(['id_jurnal' => 'J-1', 'tanggal' => '2029-10-01', 'id_siswa' => 'SIS-1']))->save()] as $simpan) {
            try {
                $simpan();
                $this->fail('Seharusnya ditolak karena semester terkunci');
            } catch (HttpException $e) {
                $this->assertSame(423, $e->getStatusCode());
            }
        }

        Sanctum::actingAs($s->admin);
        $this->nilai('NIL-A')->save();
        $this->assertDatabaseHas('trans_nilai', ['id_nilai' => 'NIL-A']);

        // Semester aktif tidak bisa dikunci lewat endpoint; dibuka kembali bisa; guru tidak boleh
        MasterPeriode::whereKey('PER-T')->update(['terkunci' => false]);
        $this->putJson('/api/periodes/PER-T/kunci', ['terkunci' => true])->assertStatus(422);
        $this->sebagai($s->guruA)->putJson('/api/periodes/PER-T/kunci', ['terkunci' => false])->assertForbidden();
    }

    public function test_pembagian_mengajar_membatasi_rombel_guru(): void
    {
        $s = $this->sekolah;
        // Bawaan: Matematika diampu Guru A di semua rombel
        $this->assertTrue(Pengampu::mengampu('GR-A', 'MPL-A', 'KLS-B'));

        $this->sebagai($s->guruA)->putJson('/api/pengampu', ['id_periode' => 'PER-T', 'baris' => []])->assertForbidden();
        $this->sebagai($s->admin)->putJson('/api/pengampu', ['id_periode' => 'PER-T', 'baris' => [
            ['id_kelas' => 'KLS-B', 'id_mapel' => 'MPL-A', 'id_guru' => 'GR-B'],
            ['id_kelas' => 'KLS-A', 'id_mapel' => 'MPL-A', 'id_guru' => 'GR-A'], // sama dengan bawaan → tidak disimpan
        ]])->assertOk()->assertJsonCount(1, 'baris');
        $this->getJson('/api/pengampu')->assertOk()->assertJsonCount(1, 'baris')->assertJsonPath('periode.id_periode', 'PER-T');

        $q = '/api/nilai/ringkasan?id_mapel=MPL-A&id_periode=PER-T&id_kelas=';
        $this->sebagai($s->guruA)->getJson($q . 'KLS-A')->assertOk();
        $this->getJson($q . 'KLS-B')->assertForbidden();
        $this->assertSame(['KLS-A'], Pengampu::kelasGuru('GR-A', 'MPL-A'));

        $guruB = User::find($s->guruB->id);
        $this->assertContains('MPL-A', $guruB->mapelDiampu());
        $this->sebagai($guruB)->getJson($q . 'KLS-B')->assertOk();
        $this->getJson($q . 'KLS-A')->assertForbidden();
        $this->getJson('/api/pengampu/saya')->assertOk()->assertJsonFragment(['id_mapel' => 'MPL-A', 'kelas' => [['id_kelas' => 'KLS-B', 'nama_kelas' => '4B']]]);

        // Semester terkunci tidak bisa diubah pembagiannya
        MasterPeriode::whereKey('PER-T')->update(['terkunci' => true]);
        $this->sebagai($s->admin)->putJson('/api/pengampu', ['id_periode' => 'PER-T', 'baris' => [['id_kelas' => 'KLS-B', 'id_mapel' => 'MPL-A', 'id_guru' => null]]])->assertStatus(423);
    }
}

<?php

namespace Tests\Feature;

use App\Models\MasterIndikator;
use App\Models\MasterKategoriPenilaian;
use App\Models\TransNilai;
use App\Models\TransNilaiIndikator;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\Concerns\MembuatDataSekolah;
use Tests\TestCase;

/**
 * Referensi penilaian selaras kurikulum nasional: indikator (IKTP) per materi,
 * High Level (Elemen CP) per mapel, dan jenis asesmen pada Aktivitas.
 */
class ReferensiPenilaianTest extends TestCase
{
    use RefreshDatabase, MembuatDataSekolah;

    protected function setUp(): void
    {
        parent::setUp();
        $this->buatSekolah();
        MasterKategoriPenilaian::create(['id_kategori' => 'KTG-UMUM', 'nama_kategori' => 'Pengetahuan']);
        MasterKategoriPenilaian::create(['id_kategori' => 'KTG-IPA', 'id_mapel' => 'MPL-B', 'nama_kategori' => 'Mengamati']);
    }

    private function sebagai(User $user): static
    {
        Sanctum::actingAs($user);
        return $this;
    }

    private function materi(array $tambahan = []): array
    {
        return $tambahan + [
            'id_mapel' => 'MPL-A', 'id_kelas' => 'KLS-A', 'id_periode' => 'PER-T', 'id_kategori' => 'KTG-UMUM', 'nama_materi' => 'Pecahan',
            'deskripsi_kompetensi' => 'Siswa dapat membandingkan pecahan',
            'mat_S' => 0.2, 'mat_T' => 0.2, 'mat_N' => 0.2, 'mat_K' => 0.2, 'mat_M' => 0.2,
        ];
    }

    public function test_indikator_disimpan_bersama_materi_dan_urutannya_terjaga(): void
    {
        $this->sebagai($this->sekolah->guruA)->putJson('/api/materi/MTR-T', $this->materi(['indikator' => [
            ['deskripsi' => 'Menyebutkan pembilang dan penyebut'],
            ['deskripsi' => 'Membandingkan dua pecahan'],
        ]]))->assertOk()->assertJsonCount(2, 'data.indikator');

        $pertama = MasterIndikator::where('id_materi', 'MTR-T')->orderBy('urutan')->first();
        $this->assertSame($this->sekolah->guruA->id, $pertama->dibuat_oleh);

        // Kirim ulang dengan urutan dibalik + satu indikator baru: yang lama diperbarui, tidak dibuat ganda
        $lama = MasterIndikator::where('id_materi', 'MTR-T')->orderBy('urutan')->get();
        $this->putJson('/api/materi/MTR-T', $this->materi(['indikator' => [
            ['id_indikator' => $lama[1]->id_indikator, 'deskripsi' => 'Membandingkan dua pecahan berpenyebut beda'],
            ['id_indikator' => $lama[0]->id_indikator, 'deskripsi' => $lama[0]->deskripsi, 'aktif' => false],
            ['deskripsi' => 'Mengurutkan pecahan'],
        ]]))->assertOk();

        $this->assertSame(3, MasterIndikator::where('id_materi', 'MTR-T')->count());
        $this->assertSame(1, $lama[1]->fresh()->urutan);
        $this->assertFalse($lama[0]->fresh()->aktif);

        // Daftar per konteks (dipakai Input Nilai) hanya memuat indikator aktif
        $res = $this->getJson('/api/materi/by-context?id_mapel=MPL-A&id_kelas=KLS-A&id_periode=PER-T')->assertOk();
        $this->assertCount(2, $res->json('data.0.indikator'));
    }

    public function test_guru_menambah_indikator_sambil_jalan_hanya_untuk_mapel_diampu(): void
    {
        $this->sebagai($this->sekolah->guruA)->postJson('/api/indikator', ['id_materi' => 'MTR-T', 'deskripsi' => 'Menyederhanakan pecahan'])
            ->assertCreated();
        $this->sebagai($this->sekolah->guruB)->postJson('/api/indikator', ['id_materi' => 'MTR-T', 'deskripsi' => 'Bukan mapel saya'])
            ->assertForbidden();
        // Kepala sekolah hanya melihat referensi penilaian
        $this->sebagai($this->sekolah->kepsek)->postJson('/api/indikator', ['id_materi' => 'MTR-T', 'deskripsi' => 'Kepsek'])->assertForbidden();
        $this->putJson('/api/materi/MTR-T', $this->materi())->assertForbidden();
        $this->getJson('/api/indikator?id_materi=MTR-T')->assertOk();
        $this->sebagai($this->sekolah->guruB);

        $id = MasterIndikator::where('id_materi', 'MTR-T')->value('id_indikator');
        $this->putJson("/api/indikator/$id", ['deskripsi' => 'Ubah'])->assertForbidden();
        $this->sebagai($this->sekolah->guruA)->putJson("/api/indikator/$id", ['aktif' => false])->assertOk();
    }

    public function test_hanya_admin_menghapus_dan_hanya_indikator_yang_belum_dipakai(): void
    {
        $this->sebagai($this->sekolah->guruA)->postJson('/api/nilai/batch', $this->sekolah->meta + [
            'tanggal' => '2030-01-05', 'records' => [['id_siswa' => 'SIS-1', 'nilai' => 80]],
        ])->assertOk();
        $dipakai = MasterIndikator::create(['id_indikator' => 'IND-PAKAI', 'id_materi' => 'MTR-T', 'deskripsi' => 'Sudah dinilai']);
        $bebas = MasterIndikator::create(['id_indikator' => 'IND-BEBAS', 'id_materi' => 'MTR-T', 'deskripsi' => 'Belum dinilai']);
        TransNilaiIndikator::create(['id_nilai' => TransNilai::value('id_nilai'), 'id_indikator' => 'IND-PAKAI', 'nilai' => 80]);

        $this->deleteJson('/api/indikator/IND-BEBAS')->assertForbidden();
        $this->sebagai($this->sekolah->kepsek)->deleteJson('/api/indikator/IND-BEBAS')->assertForbidden();

        $this->sebagai($this->sekolah->admin)->deleteJson('/api/indikator/IND-PAKAI')->assertUnprocessable();
        $this->assertDatabaseHas('master_indikator', ['id_indikator' => $dipakai->id_indikator]);
        $this->deleteJson('/api/indikator/IND-BEBAS')->assertOk();
        $this->assertDatabaseMissing('master_indikator', ['id_indikator' => $bebas->id_indikator]);
    }

    public function test_high_level_khusus_mapel_hanya_untuk_materi_mapel_itu(): void
    {
        $this->sebagai($this->sekolah->guruA)->postJson('/api/materi', $this->materi(['id_kategori' => 'KTG-IPA']))
            ->assertUnprocessable()->assertJsonValidationErrors('id_kategori');
        $this->postJson('/api/materi', $this->materi(['nama_materi' => 'Desimal']))->assertCreated();

        // High Level yang sudah dipakai materi Matematika tidak bisa dikhususkan ke IPA
        $this->sebagai($this->sekolah->admin)->putJson('/api/kategori-penilaian/KTG-UMUM', ['nama_kategori' => 'Pengetahuan', 'id_mapel' => 'MPL-B'])
            ->assertUnprocessable();
        $this->putJson('/api/kategori-penilaian/KTG-UMUM', ['nama_kategori' => 'Pengetahuan', 'id_mapel' => 'MPL-A'])->assertOk();
        $this->assertSame('MPL-A', MasterKategoriPenilaian::find('KTG-UMUM')->id_mapel);
    }

    public function test_guru_menambah_aktivitas_tapi_tidak_mengubah_atau_menghapus(): void
    {
        $aktivitas = ['kategori_penilaian' => 'Kuis Lisan', 'jenis_asesmen' => 'FORMATIF', 'mat_S' => 0.2, 'mat_T' => 0.2, 'mat_N' => 0.2, 'mat_K' => 0.2, 'mat_M' => 0.2];

        $this->sebagai($this->sekolah->guruA)->postJson('/api/mbk', ['jenis_asesmen' => 'LAINNYA'] + $aktivitas)->assertUnprocessable();
        $id = $this->postJson('/api/mbk', $aktivitas)->assertCreated()->json('data.id_jenis');
        $this->assertDatabaseHas('master_mbk', ['id_jenis' => $id, 'jenis_asesmen' => 'FORMATIF']);

        $this->putJson("/api/mbk/$id", ['jenis_asesmen' => 'SUMATIF'] + $aktivitas)->assertForbidden();
        $this->deleteJson("/api/mbk/$id")->assertForbidden();
        $this->sebagai($this->sekolah->kepsek)->postJson('/api/mbk', $aktivitas)->assertForbidden();
        $this->sebagai($this->sekolah->admin)->putJson("/api/mbk/$id", ['jenis_asesmen' => 'SUMATIF'] + $aktivitas)->assertOk();
    }
}

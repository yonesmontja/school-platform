<?php

namespace Tests\Feature;

use App\Models\Atp;
use App\Models\MasterIndikator;
use App\Models\TransJadwal;
use App\Models\TransNilai;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\Concerns\MembuatDataSekolah;
use Tests\TestCase;

/**
 * Peta kerja guru: progres alur kerja semester dihitung dari data nyata (TP, ATP, jadwal, nilai, presensi wali kelas),
 * langkah berikutnya, dan pemantauan oleh admin/kepala sekolah.
 */
class PanduanKerjaTest extends TestCase
{
    use RefreshDatabase, MembuatDataSekolah;

    protected function setUp(): void
    {
        parent::setUp();
        $this->buatSekolah();
    }

    private function langkah(array $data, string $id): ?array
    {
        return collect($data['tahap'])->flatMap(fn($t) => $t['langkah'])->firstWhere('id', $id);
    }

    public function test_progres_guru_bertambah_seiring_data_dan_pengelola_bisa_memantau(): void
    {
        $s = $this->sekolah;
        Sanctum::actingAs($s->guruA);

        // Awal: materi Pecahan (KLS-A) belum punya TP aktif → langkah berikutnya TP
        $d = $this->getJson('/api/panduan/kerja')->assertOk()->assertJsonPath('daftar_guru', null)->json('data');
        $this->assertSame(['Matematika · 4A'], $d['unit']);
        $this->assertSame(['4A'], $d['kelas_binaan']);
        $this->assertSame('tp', $d['berikutnya']['id']);
        $this->assertSame('belum', $this->langkah($d, 'tp')['status']);
        $this->assertNotNull($this->langkah($d, 'diagnostik')); // wali kelas
        $this->assertNotNull($this->langkah($d, 'catatan_wali'));
        $awal = $d['persen'];

        // TP aktif + ATP diajukan → TP selesai, ATP menunggu persetujuan, berikutnya jadwal
        MasterIndikator::create(['id_indikator' => 'IND-1', 'id_materi' => 'MTR-T', 'deskripsi' => 'Membandingkan pecahan', 'urutan' => 1, 'aktif' => true]);
        Atp::create(['id_atp' => 'ATP-1', 'judul' => 'ATP Mat', 'id_mapel' => 'MPL-A', 'id_kelas' => 'KLS-A', 'id_periode' => 'PER-T', 'status' => 'DIAJUKAN']);
        $d = $this->getJson('/api/panduan/kerja')->json('data');
        $this->assertSame('selesai', $this->langkah($d, 'tp')['status']);
        $this->assertSame('menunggu', $this->langkah($d, 'atp')['status']);
        $this->assertSame('jadwal', $d['berikutnya']['id']);
        $this->assertGreaterThan($awal, $d['persen']);

        // Sesi ke depan → jadwal selesai; sesi lewat bermateri tanpa nilai → nilai 0/1, lalu dinilai → 1/1
        $zona = config('app.zona_sekolah');
        $jadwal = fn($id, $mulai, $status) => TransJadwal::create(['id_jadwal' => $id, 'id_periode' => 'PER-T', 'id_kelas' => 'KLS-A', 'id_guru' => 'GR-A',
            'id_mapel' => 'MPL-A', 'id_materi' => 'MTR-T', 'mulai' => $mulai, 'selesai' => $mulai->copy()->addMinutes(70), 'status_sesi' => $status]);
        $jadwal('JDW-1', Carbon::now($zona)->addDays(2)->setTime(7, 30), 'Menunggu');
        $jadwal('JDW-2', Carbon::now($zona)->subDays(2)->setTime(7, 30), 'Selesai');
        $d = $this->getJson('/api/panduan/kerja')->json('data');
        $this->assertSame('selesai', $this->langkah($d, 'jadwal')['status']);
        $this->assertSame([0, 1], [$this->langkah($d, 'nilai')['selesai'], $this->langkah($d, 'nilai')['total']]);
        $this->assertSame('selesai', $this->langkah($d, 'sesi')['status']);
        $this->assertSame([0, 1], [$this->langkah($d, 'presensi')['selesai'], $this->langkah($d, 'presensi')['total']]);

        TransNilai::create(['id_nilai' => 'NIL-1', 'tanggal' => now()->toDateString(), 'id_siswa' => 'SIS-1', 'id_mapel' => 'MPL-A', 'id_guru' => 'GR-A',
            'id_periode' => 'PER-T', 'id_jenis' => 'JNS-T', 'id_materi' => 'MTR-T', 'id_kelas' => 'KLS-A', 'nilai' => 60]);
        $d = $this->getJson('/api/panduan/kerja')->json('data');
        $this->assertSame('selesai', $this->langkah($d, 'nilai')['status']);
        // Nilai di bawah KKM tanpa rencana tindak lanjut
        $this->assertSame([0, 1], [$this->langkah($d, 'tindak_lanjut')['selesai'], $this->langkah($d, 'tindak_lanjut')['total']]);

        // Guru B (bukan wali kelas 4A, tanpa data) tidak punya langkah wali kelas 4A; id_guru lain diabaikan untuk guru
        Sanctum::actingAs($s->guruB);
        $b = $this->getJson('/api/panduan/kerja?id_guru=GR-A')->json('data');
        $this->assertSame('GR-B', $b['guru']['id_guru']);

        // Kepala sekolah: tanpa id_guru diminta memilih; dengan id_guru melihat progres guru itu
        Sanctum::actingAs($s->kepsek);
        $this->getJson('/api/panduan/kerja')->assertOk()->assertJsonPath('data', null)->assertJsonCount(2, 'daftar_guru');
        $this->getJson('/api/panduan/kerja?id_guru=GR-A')->assertOk()->assertJsonPath('data.guru.nama', 'Guru A')->assertJsonPath('data.berikutnya.id', 'modul');
    }
    public function test_keterangan_yang_membuat_langkah_belum_lengkap(): void
    {
        Sanctum::actingAs($this->sekolah->guruA);
        // Materi tanpa TP aktif; ATP dibuat untuk "semua kelas" (tanpa kelas) dan masih draf
        Atp::create(['id_atp' => 'ATP-X', 'judul' => 'ATP Pecahan Umum', 'id_mapel' => 'MPL-A', 'id_kelas' => null, 'id_periode' => 'PER-T', 'status' => 'DRAF']);
        $d = $this->getJson('/api/panduan/kerja')->json('data');

        $tp = $this->langkah($d, 'tp');
        $this->assertStringContainsString('belum punya TP aktif', $tp['rincian'][0]['catatan']);
        $atp = $this->langkah($d, 'atp');
        $this->assertSame('belum', $atp['status']);
        $this->assertCount(1, $atp['peringatan']);
        $this->assertStringContainsString('ATP "ATP Pecahan Umum" (Matematika) belum ditetapkan kelasnya', $atp['peringatan'][0]);
        $this->assertStringContainsString('ada ATP tanpa kelas ("ATP Pecahan Umum")', $atp['rincian'][0]['catatan']);
        $this->assertStringContainsString('belum ada sesi ke depan', $this->langkah($d, 'jadwal')['rincian'][0]['catatan']);

        // Setelah kelas ditetapkan: peringatan hilang, keterangan menjadi "masih draf"; lalu dikembalikan dengan catatan
        Atp::where('id_atp', 'ATP-X')->update(['id_kelas' => 'KLS-A']);
        $atp = $this->langkah($this->getJson('/api/panduan/kerja')->json('data'), 'atp');
        $this->assertSame([], $atp['peringatan']);
        $this->assertSame('"ATP Pecahan Umum" masih draf, belum diajukan ke kepala sekolah', $atp['rincian'][0]['catatan']);
        Atp::where('id_atp', 'ATP-X')->update(['status' => 'REVISI', 'catatan_revisi' => 'Alokasi JP terlalu sedikit']);
        $atp = $this->langkah($this->getJson('/api/panduan/kerja')->json('data'), 'atp');
        $this->assertStringContainsString('dikembalikan kepala sekolah: Alokasi JP terlalu sedikit', $atp['rincian'][0]['catatan']);
    }
}

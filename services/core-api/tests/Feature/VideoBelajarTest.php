<?php

namespace Tests\Feature;

use App\Models\BankSoal;
use App\Models\ModulAjar;
use App\Models\User;
use App\Models\VideoBelajar;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Laravel\Sanctum\Sanctum;
use Tests\Concerns\MembuatDataSekolah;
use Tests\TestCase;

/**
 * Video Belajar (Fase 19 Tahap A): unggah, persetujuan kepala sekolah, tautan ke modul/jadwal, stimulus soal
 * yang ikut ke tes online, dan pustaka di Portal Siswa (hanya video disetujui untuk kelasnya).
 */
class VideoBelajarTest extends TestCase
{
    use RefreshDatabase, MembuatDataSekolah;

    private const MP4 = "\x00\x00\x00\x18ftypmp42\x00\x00\x00\x00mp42isom";
    private const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

    protected function setUp(): void
    {
        parent::setUp();
        $this->buatSekolah();
        Storage::fake('public');
    }

    private function sebagai(User $u): static
    {
        Sanctum::actingAs($u);
        return $this;
    }

    private function unggah(array $extra = [])
    {
        $file = UploadedFile::fake()->createWithContent('pecahan.mp4', self::MP4 . str_repeat("\x00", 2048));
        return $this->post('/api/video-belajar', $extra + [
            'judul' => 'Pecahan seperempat', 'id_mapel' => 'MPL-A', 'id_kelas' => 'KLS-A', 'durasi_detik' => 75,
            'sumber' => 'REMOTION', 'komposisi' => 'PecahanKue', 'video' => $file, 'poster' => 'data:image/png;base64,' . self::PNG,
        ], ['Accept' => 'application/json']);
    }

    public function test_unggah_persetujuan_dan_portal_siswa(): void
    {
        $this->sebagai($this->sekolah->guruA);
        $res = $this->unggah()->assertCreated();
        $v = $res->json('data');
        $this->assertSame(['DRAF', 'B', 'REMOTION', 75], [$v['status'], $v['fase'], $v['sumber'], $v['durasi_detik']]);
        Storage::disk('public')->assertExists(Str::after($v['file_url'], '/storage/'));
        Storage::disk('public')->assertExists(Str::after($v['poster_url'], '/storage/'));

        // Bukan video ditolak; guru lain tidak boleh untuk mapel yang tidak diampu
        $this->post('/api/video-belajar', ['judul' => 'x', 'video' => UploadedFile::fake()->createWithContent('a.mp4', 'bukan video')], ['Accept' => 'application/json'])->assertUnprocessable();
        $this->sebagai($this->sekolah->guruB)->unggah()->assertForbidden();

        // Siswa belum melihat video draf
        $this->sebagai($this->sekolah->siswa)->getJson('/api/portal/video')->assertJsonCount(0, 'data');

        $this->sebagai($this->sekolah->guruA)->postJson("/api/video-belajar/{$v['id_video']}/ajukan")->assertOk();
        $this->postJson("/api/video-belajar/{$v['id_video']}/setujui")->assertForbidden();
        $this->sebagai($this->sekolah->kepsek);
        $this->assertContains('video-persetujuan', array_column($this->getJson('/api/notifikasi')->json('data'), 'jenis'));
        $this->postJson("/api/video-belajar/{$v['id_video']}/setujui")->assertOk();

        $this->sebagai($this->sekolah->siswa)->getJson('/api/portal/video')->assertJsonCount(1, 'data')->assertJsonPath('data.0.judul', 'Pecahan seperempat');

        // Video untuk kelas lain tidak tampil; video umum (tanpa kelas) tampil
        VideoBelajar::create(['id_video' => 'VID-B', 'judul' => 'Kelas B', 'id_kelas' => 'KLS-B', 'file_url' => '/storage/video/b.mp4', 'status' => 'DISETUJUI']);
        VideoBelajar::create(['id_video' => 'VID-U', 'judul' => 'Umum', 'file_url' => '/storage/video/u.mp4', 'status' => 'DISETUJUI']);
        $this->assertEqualsCanonicalizing(['Pecahan seperempat', 'Umum'], array_column($this->getJson('/api/portal/video')->json('data'), 'judul'));

        // Mengubah video yang disetujui menjadikannya draf lagi; menghapus menghapus berkasnya
        $this->sebagai($this->sekolah->guruA)->post("/api/video-belajar/{$v['id_video']}", ['judul' => 'Pecahan 1/4'], ['Accept' => 'application/json'])
            ->assertOk()->assertJsonPath('data.status', 'DRAF');
        $this->deleteJson("/api/video-belajar/{$v['id_video']}")->assertOk();
        Storage::disk('public')->assertMissing(Str::after($v['file_url'], '/storage/'));
    }

    public function test_tautan_modul_jadwal_dan_stimulus_soal_ikut_tes_online(): void
    {
        $this->sebagai($this->sekolah->guruA);
        $id = $this->unggah()->json('data.id_video');
        VideoBelajar::whereKey($id)->update(['status' => 'DISETUJUI']);
        ModulAjar::create(['id_modul' => 'MOD-1', 'judul' => 'Pecahan', 'id_mapel' => 'MPL-A', 'jumlah_pertemuan' => 2, 'isi' => ModulAjar::kosong(2), 'status' => 'DRAF', 'dibuat_oleh' => $this->sekolah->guruA->id]);

        // Video sama di modul (pertemuan 2) dan di sesi jadwal
        $this->postJson('/api/video-belajar/tautan', ['id_video' => $id, 'jenis' => 'MODUL', 'id_target' => 'MOD-1', 'pertemuan_ke' => 2])->assertCreated();
        $jadwal = $this->postJson('/api/jadwal', ['id_mapel' => 'MPL-A', 'id_kelas' => 'KLS-A', 'id_modul' => 'MOD-1', 'pertemuan_ke' => 2,
            'mulai' => '2030-01-07T08:00', 'selesai' => '2030-01-07T09:00', 'pola' => 'sekali'])->json('data.0.id_jadwal');
        $idTautan = $this->postJson('/api/video-belajar/tautan', ['id_video' => $id, 'jenis' => 'JADWAL', 'id_target' => $jadwal])->assertCreated()->json('data.id');
        $this->getJson("/api/video-belajar/tautan?jenis=MODUL&id_target=MOD-1")->assertJsonPath('data.0.pertemuan_ke', 2);
        // Rencana sesi menampilkan video pertemuan modul
        $this->getJson("/api/jadwal/{$jadwal}/rencana")->assertJsonPath('data.video.0.id_video', $id);
        // Guru lain tidak boleh menautkan ke modul/jadwal milik guru lain
        $this->sebagai($this->sekolah->guruB)->postJson('/api/video-belajar/tautan', ['id_video' => $id, 'jenis' => 'MODUL', 'id_target' => 'MOD-1'])->assertForbidden();
        $this->sebagai($this->sekolah->guruA)->deleteJson("/api/video-belajar/tautan/{$idTautan}")->assertOk();

        // Stimulus soal: ikut salinan paket dan tampil ke siswa saat tes online
        $soal = BankSoal::create(['id_soal' => 'SOAL-1', 'id_mapel' => 'MPL-A', 'bentuk' => 'PG', 'level_kognitif' => 'C2', 'tingkat_kesulitan' => 'SEDANG',
            'pertanyaan' => 'Tonton video. Bagian yang diambil adalah', 'isi' => ['pilihan' => ['1/4', '1/2', '3/4']], 'kunci' => ['jawaban' => 0],
            'status' => 'DISETUJUI', 'sumber' => 'MANUAL', 'dibuat_oleh' => $this->sekolah->guruA->id, 'skor_maks' => 1, 'id_video' => $id]);
        $paket = $this->postJson('/api/paket-soal', ['judul' => 'Tes video', 'id_mapel' => 'MPL-A', 'id_kelas' => 'KLS-A', 'id_jenis' => 'JNS-T', 'tanggal' => '2030-03-02'])->json('data.id_paket');
        $this->postJson("/api/paket-soal/{$paket}/butir", ['id_soal' => [$soal->id_soal]])->assertOk();
        $this->putJson("/api/paket-soal/{$paket}/online", ['online' => true, 'durasi_menit' => 10])->assertOk();
        $this->sebagai($this->sekolah->siswa)->postJson("/api/ujian/{$paket}/mulai")->assertOk()
            ->assertJsonPath('data.soal.0.video.judul', 'Pecahan seperempat');
        $this->sebagai($this->sekolah->guruA)->getJson("/api/video-belajar/{$id}")->assertJsonPath('data.tempat', fn($t) => collect($t)->pluck('jenis')->sort()->values()->all() === ['Modul ajar', 'Soal']);
    }
}

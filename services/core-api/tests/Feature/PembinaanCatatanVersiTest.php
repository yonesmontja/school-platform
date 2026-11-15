<?php

namespace Tests\Feature;

use App\Models\TransJurnal;
use App\Models\TransLampiran;
use App\Models\TransVersi;
use App\Support\HtmlAman;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\Concerns\MembuatDataSekolah;
use Tests\TestCase;

/**
 * Catatan kaya & versi pembinaan: HTML dibersihkan, lampiran foto tertaut, saran lokal (tanpa AI), catatan progres
 * ke jurnal dengan pencatat & riwayat versi, terkunci setelah selesai; jurnal mencatat penulisnya.
 */
class PembinaanCatatanVersiTest extends TestCase
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

    public function test_html_aman_membuang_skrip_dan_media_luar(): void
    {
        $h = HtmlAman::bersihkan('<p onclick="x()">Halo <script>alert(1)</script><b>tebal</b></p><img src="https://jahat.id/a.png"><img src="/storage/lampiran/2030/01/a.jpg" onerror="x">'
            . '<ul class="cek"><li data-cek="1">Telepon ortu</li><li data-cek="z">Kunjungan</li><li data-cek="0"><br></li></ul><ul><li> </li></ul><a href="javascript:alert(1)">t</a><iframe src="x"></iframe>');
        $this->assertStringNotContainsString('script', $h);
        $this->assertStringNotContainsString('onclick', $h);
        $this->assertStringNotContainsString('onerror', $h);
        $this->assertStringNotContainsString('jahat.id', $h);
        $this->assertStringNotContainsString('javascript:', $h);
        $this->assertStringNotContainsString('iframe', $h);
        $this->assertStringContainsString('<img src="/storage/lampiran/2030/01/a.jpg">', $h);
        $this->assertStringContainsString('<li data-cek="0">Kunjungan</li>', $h);
        $this->assertSame("Halo tebal\n[foto]\n[x] Telepon ortu\n[ ] Kunjungan\nt", HtmlAman::teks($h));
        $this->assertSame('<p>baris satu<br>dua</p>', HtmlAman::bersihkan("baris satu\ndua"));
    }

    public function test_catatan_kaya_lampiran_saran_lokal_dan_versi_rencana(): void
    {
        Storage::fake('public');
        Sanctum::actingAs($this->sekolah->guruA);
        foreach (['2030-01-14', '2030-01-21', '2030-01-22'] as $t) {
            $this->postJson('/api/presensi/batch', ['id_kelas' => 'KLS-A', 'id_periode' => 'PER-T', 'tanggal' => $t,
                'records' => [['id_siswa' => 'SIS-1', 'status_kehadiran' => 'ALPA', 'keterangan' => $t === '2030-01-22' ? 'Ani ikut ke kebun' : null]]])->assertOk();
        }

        // Konteks yang bisa disisipkan
        $k = $this->getJson('/api/presensi/pembinaan/konteks?id_siswa=SIS-1&id_periode=PER-T')->assertOk();
        $k->assertJsonPath('data.ringkasan.alpa', 3)->assertJsonPath('data.alpa_per_hari.Senin', 2)->assertJsonPath('data.tidak_hadir_terakhir.0.keterangan', 'Ani ikut ke kebun');

        // Saran lokal (tanpa AI): nama siswa disamarkan, tindakan dari daftar opsi
        $s = $this->postJson('/api/presensi/pembinaan/ai', ['bagian' => 'rencana', 'ai_mode' => 'LOKAL', 'id_siswa' => 'SIS-1', 'id_periode' => 'PER-T'])->assertOk();
        $this->assertContains('Menghubungi orang tua/wali (WA atau telepon)', $s->json('data.tindakan'));
        $this->assertStringContainsString('Senin', $s->json('data.latar_belakang'));
        $this->assertStringContainsString('Ananda ikut ke kebun', $s->json('data.latar_belakang'));
        $this->assertStringNotContainsString('Ani ', $s->json('data.latar_belakang'));
        $this->assertNotEmpty($s->json('data.langkah'));

        // Foto diunggah, lalu dirujuk catatan
        $png = UploadedFile::fake()->createWithContent('kunjungan.png', base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='));
        $u = $this->post('/api/lampiran', ['berkas' => $png, 'entitas' => 'pembinaan'], ['Accept' => 'application/json'])->assertCreated();
        $url = $u->json('data.url');
        $this->postJson('/api/lampiran', ['entitas' => 'pembinaan', 'berkas' => UploadedFile::fake()->createWithContent('a.txt', 'teks biasa')])->assertStatus(422);

        $r = $this->postJson('/api/presensi/pembinaan', ['id_siswa' => 'SIS-1', 'id_periode' => 'PER-T', 'tindakan' => ['Kunjungan rumah'],
            'catatan' => "<p>Sering alpa Senin</p><ul class=\"cek\"><li data-cek=\"0\">Telepon ortu</li></ul><img src=\"{$url}\"><script>x</script>",
            'tanggal_mulai' => '2030-01-25', 'tanggal_tindak_lanjut' => '2030-02-08'])->assertCreated();
        $id = $r->json('data.id_pembinaan');
        $this->assertStringNotContainsString('script', $r->json('data.catatan'));
        $this->assertSame("Sering alpa Senin\n[ ] Telepon ortu\n[foto]", $r->json('data.catatan_teks'));
        $this->assertSame($id, TransLampiran::first()->id_entitas);
        $r->assertJsonPath('data.versi_terakhir', 1);

        // Ubah dengan keterangan versi; simpan ulang tanpa perubahan tidak menambah versi
        $badan = ['tindakan' => ['Kunjungan rumah'], 'catatan' => '<p>Sering alpa Senin</p><ul class="cek"><li data-cek="1">Telepon ortu</li></ul>',
            'tanggal_mulai' => '2030-01-25', 'tanggal_tindak_lanjut' => '2030-02-08', 'keterangan_versi' => 'Orang tua sudah ditelepon'];
        $this->putJson("/api/presensi/pembinaan/{$id}", $badan)->assertOk()->assertJsonPath('data.versi_terakhir', 2);
        $this->putJson("/api/presensi/pembinaan/{$id}", $badan)->assertOk()->assertJsonPath('data.versi_terakhir', 2);

        $d = $this->getJson("/api/presensi/pembinaan/{$id}")->assertOk();
        $d->assertJsonCount(2, 'data.riwayat')->assertJsonPath('data.riwayat.0.versi', 2)
            ->assertJsonPath('data.riwayat.0.keterangan', 'Orang tua sudah ditelepon')->assertJsonPath('data.riwayat.1.keterangan', 'Rencana dibuat');
        $this->assertNotNull($d->json('data.riwayat.0.oleh'));
    }

    public function test_catatan_progres_berversi_pencatat_dan_terkunci_setelah_selesai(): void
    {
        Sanctum::actingAs($this->sekolah->guruA);
        $id = $this->postJson('/api/presensi/pembinaan', ['id_siswa' => 'SIS-1', 'id_periode' => 'PER-T', 'tindakan' => ['Bicara empat mata dengan siswa'],
            'tanggal_mulai' => '2030-01-21', 'tanggal_tindak_lanjut' => '2030-02-04'])->json('data.id_pembinaan');

        // Draf lokal catatan progres
        $this->postJson('/api/presensi/pembinaan/ai', ['bagian' => 'progres', 'ai_mode' => 'LOKAL', 'id_pembinaan' => $id, 'arahan' => 'Sudah bicara dengan Ani'])
            ->assertOk()->assertJsonPath('data.mode', 'LOKAL');

        // Admin menulis catatan pertama → pencatat = admin
        Sanctum::actingAs($this->sekolah->admin);
        $r = $this->postJson("/api/presensi/pembinaan/{$id}/progres", ['tanggal' => '2030-01-24', 'catatan' => 'Sudah bicara empat mata dengan siswa.'])->assertOk();
        $idJ = $r->json('id_jurnal');
        $j = TransJurnal::find($idJ);
        $this->assertSame($this->sekolah->admin->id, $j->dicatat_oleh);
        $this->assertSame('PISAH', $j->mode_dampak);
        $r->assertJsonPath('data.jurnal_detail.0.versi_terakhir', 1)->assertJsonPath('data.jurnal_detail.0.pencatat_nama', $this->sekolah->admin->name);

        // Wali kelas memperbarui dengan respons + skor → versi 2; tanpa perubahan → tetap 2
        Sanctum::actingAs($this->sekolah->guruA);
        $badan = ['id_jurnal' => $idJ, 'tanggal' => '2030-01-24', 'catatan' => 'Sudah bicara empat mata; orang tua ditelepon.', 'respons' => 'Ani berjanji hadir.',
            'skor' => ['S' => 0, 'T' => 0, 'N' => 1, 'K' => 0, 'M' => 0.5], 'ai_mode' => 'HEURISTIK', 'keterangan_versi' => 'Orang tua dihubungi'];
        $this->postJson("/api/presensi/pembinaan/{$id}/progres", $badan)->assertOk()->assertJsonPath('message', 'Catatan diperbarui (versi 2).');
        $this->postJson("/api/presensi/pembinaan/{$id}/progres", $badan)->assertOk()->assertJsonPath('message', 'Tidak ada perubahan pada catatan.');
        $j->refresh();
        $this->assertSame("Sudah bicara empat mata; orang tua ditelepon.\nRespons siswa: Ani berjanji hadir.", $j->narasi_kejadian);
        $this->assertEquals(1.0, $j->val_N);
        $this->assertSame($this->sekolah->admin->id, $j->dicatat_oleh); // pencatat awal tetap

        $v = $this->getJson("/api/jurnal/{$idJ}/riwayat")->assertOk()->assertJsonCount(2, 'data');
        $v->assertJsonPath('data.0.keterangan', 'Orang tua dihubungi')->assertJsonPath('data.0.isi.respons', 'Ani berjanji hadir.')
            ->assertJsonPath('data.1.isi.catatan', 'Sudah bicara empat mata dengan siswa.');

        // Guru lain tidak boleh memperbarui catatan orang lain
        Sanctum::actingAs($this->sekolah->guruB);
        $this->postJson("/api/presensi/pembinaan/{$id}/progres", $badan + ['catatan' => 'Ubahan guru lain yang tidak berhak.'])->assertForbidden();

        // Diubah dari menu Jurnal → tetap tercatat sebagai versi
        Sanctum::actingAs($this->sekolah->admin);
        $this->putJson("/api/jurnal/{$idJ}", ['tanggal' => '2030-01-24', 'id_siswa' => 'SIS-1', 'id_kelas' => 'KLS-A', 'mode_dampak' => 'PISAH',
            'narasi_kejadian' => 'Catatan dirapikan admin dari menu jurnal.'])->assertOk();
        $this->assertSame(3, TransVersi::where(['entitas' => 'jurnal', 'id_entitas' => $idJ])->max('versi'));

        // Selesai → terkunci
        Sanctum::actingAs($this->sekolah->guruA);
        $this->patchJson("/api/presensi/pembinaan/{$id}/status", ['status' => 'SELESAI'])->assertOk()->assertJsonPath('data.terkunci', true);
        $this->postJson("/api/presensi/pembinaan/{$id}/progres", ['tanggal' => '2030-01-25', 'catatan' => 'Catatan baru setelah selesai.'])
            ->assertStatus(422)->assertJsonPath('message', 'Pembinaan ini sudah selesai; catatannya terkunci.');
        $this->assertSame('Ditandai selesai', $this->getJson("/api/presensi/pembinaan/{$id}")->json('data.riwayat.0.keterangan'));

        // Jurnal biasa juga mencatat penulisnya
        $this->postJson('/api/jurnal/store', ['tanggal' => '2030-01-25', 'id_siswa' => 'SIS-2', 'id_kelas' => 'KLS-A', 'narasi_kejadian' => 'Budi membantu teman membersihkan kelas.', 'mode_dampak' => 'PISAH'])
            ->assertCreated()->assertJsonPath('data.pencatat.id', $this->sekolah->guruA->id);
    }

    public function test_penginput_tercatat_di_jadwal_presensi_dan_jurnal(): void
    {
        // Kepala sekolah membuat jadwal untuk guru B → guru B tercatat, kepsek sebagai pembuat
        Sanctum::actingAs($this->sekolah->kepsek);
        $j = $this->postJson('/api/jadwal', ['judul' => 'Sesi', 'mulai' => '2030-01-28T08:00', 'selesai' => '2030-01-28T09:00', 'pola' => 'sekali', 'id_guru' => 'GR-B'])->assertCreated();
        $j->assertJsonPath('data.0.id_guru', 'GR-B')->assertJsonPath('data.0.pembuat.id', $this->sekolah->kepsek->id);

        // Admin mengisi presensi harian → wali kelas (GR-A) dan pencatat admin ikut dikirim untuk tampilan "diisi …"
        Sanctum::actingAs($this->sekolah->admin);
        $this->postJson('/api/presensi/batch', ['id_kelas' => 'KLS-A', 'id_periode' => 'PER-T', 'tanggal' => '2030-01-25', 'records' => [['id_siswa' => 'SIS-1', 'status_kehadiran' => 'HADIR']]])->assertOk();
        $r = $this->getJson('/api/presensi?id_kelas=KLS-A&id_periode=PER-T')->assertOk();
        $r->assertJsonPath('wali_kelas.id_guru', 'GR-A')->assertJsonPath('presensi.0.pencatat.id', $this->sekolah->admin->id);

        // Jurnal guru sendiri: pencatat = guru itu (id_guru sama → tampil satu nama)
        Sanctum::actingAs($this->sekolah->guruA);
        $this->postJson('/api/jurnal/store', ['tanggal' => '2030-01-25', 'id_siswa' => 'SIS-1', 'id_kelas' => 'KLS-A', 'narasi_kejadian' => 'Ani membantu teman sekelas.', 'mode_dampak' => 'PISAH'])
            ->assertCreated()->assertJsonPath('data.id_guru', 'GR-A')->assertJsonPath('data.pencatat.id_guru', 'GR-A');
    }
}

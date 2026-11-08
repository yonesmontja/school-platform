<?php

namespace Tests\Feature;

use App\Models\Atp;
use App\Models\CapaianPembelajaran;
use App\Models\MasterIndikator;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request as HttpRequest;
use Illuminate\Support\Facades\Http;
use Laravel\Sanctum\Sanctum;
use Tests\Concerns\MembuatDataSekolah;
use Tests\TestCase;

/**
 * Perangkat ajar (Fase 17 Tahap A): CP per mapel/fase/elemen, ATP disusun guru (dibantu AI, respons ditiru),
 * diajukan, dikembalikan dengan catatan, lalu disetujui kepala sekolah sehingga TP usulan masuk master TP.
 */
class PerangkatAjarTest extends TestCase
{
    use RefreshDatabase, MembuatDataSekolah;

    protected function setUp(): void
    {
        parent::setUp();
        $this->buatSekolah();
        MasterIndikator::create(['id_indikator' => 'IND-1', 'id_materi' => 'MTR-T', 'deskripsi' => 'Menentukan pecahan senilai', 'urutan' => 1]);
        config(['services.ai_services.gemini_key' => 'uji']);
    }

    private function sebagai(User $user): static
    {
        Sanctum::actingAs($user);
        return $this;
    }

    private function gemini(array $json): void
    {
        Http::fake(['generativelanguage.googleapis.com/*' => Http::response(['candidates' => [['content' => ['parts' => [['text' => json_encode($json)]]]]]])]);
    }

    public function test_cp_dikelola_guru_pengampu_dan_bisa_dipecah_ai(): void
    {
        $this->sebagai($this->sekolah->guruA)->postJson('/api/perangkat-ajar/cp', ['id_mapel' => 'MPL-A', 'fase' => 'B', 'elemen' => 'Bilangan', 'teks' => 'Peserta didik dapat ...'])->assertCreated();
        $this->postJson('/api/perangkat-ajar/cp', ['id_mapel' => 'MPL-A', 'fase' => 'B', 'elemen' => 'Bilangan', 'teks' => 'ganda'])->assertUnprocessable();
        $this->sebagai($this->sekolah->guruB)->postJson('/api/perangkat-ajar/cp', ['id_mapel' => 'MPL-A', 'fase' => 'B', 'elemen' => 'Aljabar', 'teks' => 'x'])->assertForbidden();

        $this->gemini(['cp' => [
            ['fase' => 'B', 'elemen' => 'Bilangan', 'teks' => 'Teks baru bilangan'],
            ['fase' => 'b', 'elemen' => 'Pengukuran', 'teks' => 'Peserta didik dapat mengukur panjang'],
        ]]);
        $pratinjau = $this->sebagai($this->sekolah->guruA)->postJson('/api/perangkat-ajar/cp/pecah', [
            'id_mapel' => 'MPL-A', 'teks' => str_repeat('Capaian pembelajaran matematika fase B. ', 3), 'ai_mode' => 'GEMINI',
        ])->assertOk()->json('data');
        $this->assertSame('B', $pratinjau[1]['fase']);
        $this->assertDatabaseCount('capaian_pembelajaran', 1); // pratinjau belum disimpan

        $this->postJson('/api/perangkat-ajar/cp/banyak', ['id_mapel' => 'MPL-A', 'cp' => $pratinjau])->assertOk();
        $this->assertSame(2, CapaianPembelajaran::count()); // elemen yang sama diperbarui, bukan digandakan
        $this->assertSame('Teks baru bilangan', CapaianPembelajaran::where('elemen', 'Bilangan')->value('teks'));
        $this->assertCount(2, $this->getJson('/api/perangkat-ajar/cp?id_mapel=MPL-A&fase=B')->json('data'));
    }

    public function test_atp_disusun_ai_diajukan_direvisi_lalu_disetujui(): void
    {
        $this->sebagai($this->sekolah->guruA);
        $idCp = $this->postJson('/api/perangkat-ajar/cp', ['id_mapel' => 'MPL-A', 'fase' => 'B', 'elemen' => 'Bilangan', 'teks' => 'Pecahan'])->json('data.id_cp');
        $atp = $this->postJson('/api/perangkat-ajar/atp', ['judul' => 'ATP Matematika 4A', 'id_mapel' => 'MPL-A', 'id_kelas' => 'KLS-A', 'jp_per_minggu' => 5, 'minggu_efektif' => 18])
            ->assertCreated()->json('data');
        $this->assertSame('B', $atp['fase']); // kelas 4 → fase B
        $this->assertSame('PER-T', $atp['id_periode']); // periode aktif bawaan

        // AI: TP lama dipakai, TP baru diusulkan, id asing dibuang
        $this->gemini(['baris' => [
            ['id_cp' => $idCp, 'id_indikator' => 'IND-1', 'alokasi_jp' => 6, 'minggu' => '1-2', 'dimensi' => 't', 'profil_lulusan' => ['Penalaran Kritis', 'Sihir']],
            ['id_cp' => 'CP-ASING', 'id_materi' => 'MTR-T', 'tp_usulan' => 'Membandingkan dua pecahan berpenyebut sama', 'alokasi_jp' => 8],
            ['id_cp' => $idCp, 'materi_usulan' => 'Pecahan Desimal', 'tp_usulan' => 'Mengubah pecahan ke desimal', 'alokasi_jp' => 6],
            ['id_cp' => $idCp, 'id_indikator' => 'IND-ASING'],
        ]]);
        $res = $this->postJson("/api/perangkat-ajar/atp/{$atp['id_atp']}/ai", ['ai_mode' => 'GEMINI'])->assertOk();
        $baris = $res->json('baris');
        $this->assertCount(3, $baris); // baris tanpa TP sah dibuang
        $this->assertSame(['T', ['Penalaran Kritis']], [$baris[0]['dimensi'], $baris[0]['profil_lulusan']]);
        $this->assertNull($baris[1]['id_cp']);
        Http::assertSent(fn(HttpRequest $r) => str_contains($r['contents'][0]['parts'][0]['text'], 'Menentukan pecahan senilai'));

        $this->putJson("/api/perangkat-ajar/atp/{$atp['id_atp']}", ['baris' => $baris])->assertOk()->assertJsonPath('data.total_jp', 20);
        $this->postJson("/api/perangkat-ajar/atp/{$atp['id_atp']}/ajukan")->assertOk();
        $this->postJson("/api/perangkat-ajar/atp/{$atp['id_atp']}/setujui")->assertForbidden(); // hanya kepala sekolah

        // Kepala sekolah mengembalikan; guru melihatnya di Perlu Tindakan
        $this->sebagai($this->sekolah->kepsek);
        $this->assertContains('atp-persetujuan', array_column($this->getJson('/api/notifikasi')->json('data'), 'jenis'));
        $this->postJson("/api/perangkat-ajar/atp/{$atp['id_atp']}/revisi", ['catatan' => 'Tambah TP pengukuran'])->assertOk();
        $this->sebagai($this->sekolah->guruA);
        $this->assertContains('atp-revisi', array_column($this->getJson('/api/notifikasi')->json('data'), 'jenis'));
        $this->postJson("/api/perangkat-ajar/atp/{$atp['id_atp']}/ajukan")->assertOk();

        // Disetujui: TP usulan & materi usulan dibuat di master dan ditautkan
        $this->sebagai($this->sekolah->kepsek)->postJson("/api/perangkat-ajar/atp/{$atp['id_atp']}/setujui")->assertOk()
            ->assertJsonPath('message', fn($m) => str_contains($m, '2 TP baru') && str_contains($m, '1 materi baru'));
        $atpBaru = Atp::with('baris')->find($atp['id_atp']);
        $this->assertSame('DISETUJUI', $atpBaru->status);
        $this->assertTrue($atpBaru->baris->every(fn($b) => $b->id_indikator && !$b->tp_usulan));
        $this->assertDatabaseHas('master_indikator', ['id_materi' => 'MTR-T', 'deskripsi' => 'Membandingkan dua pecahan berpenyebut sama', 'aktif' => true]);
        $this->assertDatabaseHas('master_materi', ['nama_materi' => 'Pecahan Desimal', 'id_mapel' => 'MPL-A', 'id_kelas' => 'KLS-A']);

        // Guru lain mapel lain tidak melihat ATP ini; mengubah ATP disetujui menjadikannya draf versi baru
        $this->sebagai($this->sekolah->guruB)->getJson('/api/perangkat-ajar/atp')->assertJsonCount(0, 'data');
        $this->sebagai($this->sekolah->guruA)->putJson("/api/perangkat-ajar/atp/{$atp['id_atp']}", ['judul' => 'ATP Matematika 4A (rev)'])
            ->assertJsonPath('data.status', 'DRAF')->assertJsonPath('data.versi', 2);
    }

    public function test_modul_ajar_rpm_disusun_ai_dengan_data_kelas_lalu_disetujui(): void
    {
        $this->sebagai($this->sekolah->guruA);
        \App\Models\TransDiagnostikNonkognitif::create(['id_siswa' => 'SIS-1', 'id_periode' => 'PER-T', 'gaya_belajar' => 'KINESTETIK', 'minat' => 'Olahraga']);
        \App\Models\TransDiagnostikNonkognitif::create(['id_siswa' => 'SIS-2', 'id_periode' => 'PER-T', 'gaya_belajar' => 'KINESTETIK', 'minat' => 'Musik']);
        $modul = $this->postJson('/api/perangkat-ajar/modul', ['judul' => 'Pecahan senilai', 'id_mapel' => 'MPL-A', 'id_kelas' => 'KLS-A', 'tp' => ['IND-1'], 'jumlah_pertemuan' => 2, 'jp_per_pertemuan' => 2])
            ->assertCreated()->json('data');
        $this->assertSame(['MTR-T', 'B', 2], [$modul['id_materi'], $modul['fase'], count($modul['isi']['pertemuan'])]);

        // Belum lengkap: tidak bisa diajukan
        $this->postJson("/api/perangkat-ajar/modul/{$modul['id_modul']}/ajukan")->assertUnprocessable();

        $this->gemini([
            'identifikasi' => ['peserta_didik' => 'Sebagian besar kinestetik', 'materi' => 'Pecahan', 'profil_lulusan' => ['Kolaborasi', 'Sihir']],
            'desain' => ['tujuan' => 'Siswa menentukan pecahan senilai', 'praktik_pedagogis' => 'Pembelajaran berbasis masalah'],
            'pertemuan' => [['ke' => 1, 'awal' => 'Salam', 'memahami' => 'Melipat kertas', 'mengaplikasi' => 'Membagi kue', 'merefleksi' => 'Apa yang kamu pelajari?', 'penutup' => 'Doa'],
                ['ke' => 2, 'memahami' => 'Garis bilangan'], ['ke' => 3, 'memahami' => 'kelebihan']],
            'asesmen' => ['awal' => 'Tanya jawab', 'proses' => 'Observasi', 'akhir' => 'Tes tertulis'],
            'diferensiasi' => 'Pendampingan untuk yang belum lancar', 'lkpd' => 'Lembar kerja',
        ]);
        $res = $this->postJson("/api/perangkat-ajar/modul/{$modul['id_modul']}/ai", ['ai_mode' => 'GEMINI'])->assertOk();
        $isi = $res->json('isi');
        $this->assertCount(2, $isi['pertemuan']); // pertemuan berlebih dipangkas
        $this->assertSame(2, $isi['pertemuan'][0]['jp']); // JP bawaan modul
        $this->assertSame(['Kolaborasi'], $isi['identifikasi']['profil_lulusan']);
        // AI menerima data kelas tanpa nama siswa
        Http::assertSent(function (HttpRequest $r) {
            $teks = $r['contents'][0]['parts'][0]['text'];
            return str_contains($teks, '"KINESTETIK":2') && str_contains($teks, 'Menentukan pecahan senilai') && !str_contains($teks, 'Ani') && !str_contains($teks, 'SIS-1');
        });

        $this->putJson("/api/perangkat-ajar/modul/{$modul['id_modul']}", ['isi' => $isi, 'sumber' => 'AI', 'ai_mode' => 'GEMINI'])->assertOk()->assertJsonPath('data.sumber', 'AI');
        $this->postJson("/api/perangkat-ajar/modul/{$modul['id_modul']}/ajukan")->assertOk();
        $this->sebagai($this->sekolah->kepsek);
        $this->assertContains('modul-persetujuan', array_column($this->getJson('/api/notifikasi')->json('data'), 'jenis'));
        $this->postJson("/api/perangkat-ajar/modul/{$modul['id_modul']}/setujui")->assertOk();
        $this->assertSame('DISETUJUI', \App\Models\ModulAjar::find($modul['id_modul'])->status);
        $this->sebagai($this->sekolah->guruB)->getJson("/api/perangkat-ajar/modul/{$modul['id_modul']}")->assertNotFound();
    }
}

<?php

namespace Tests\Feature;

use App\Models\KeuPengingat;
use App\Models\KeuTagihan;
use App\Models\LogAktivitas;
use App\Models\MasterOrtu;
use App\Models\OperatorSekolah;
use App\Models\Student;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\Concerns\MembuatDataSekolah;
use Tests\TestCase;

/** Fase 26 Tahap C: Keuangan & Pembayaran. */
class KeuanganTest extends TestCase
{
    use RefreshDatabase, MembuatDataSekolah;

    private User $operator;

    protected function setUp(): void
    {
        parent::setUp();
        $this->buatSekolah();
        $this->operator = User::create(['name' => 'Bendahara', 'username' => 'bendahara', 'password' => 'rahasia123', 'role' => 'operator', 'aktif' => true]);
        OperatorSekolah::create(['id_user' => $this->operator->id, 'submodul' => ['KEUANGAN'], 'ditunjuk_oleh' => $this->sekolah->kepsek->id]);
        Sanctum::actingAs($this->operator);
    }

    private const API = '/api/administrasi/keuangan';

    private function jenis(array $lain = []): int
    {
        return $this->postJson(self::API . '/jenis-biaya', $lain + ['nama' => 'SPP', 'periode' => 'BULANAN', 'nominal' => 150000])
            ->assertCreated()->json('data.id');
    }

    private function tagihanSiswa(string $id): \Illuminate\Support\Collection
    {
        return KeuTagihan::where('id_siswa', $id)->orderBy('periode_kode')->get();
    }

    public function test_tagihan_massal_beasiswa_pembayaran_dan_pembatalan(): void
    {
        $spp = $this->jenis();
        $this->postJson(self::API . '/beasiswa', ['id_siswa' => 'SIS-1', 'id_jenis_biaya' => $spp, 'nama' => 'Beasiswa prestasi', 'bentuk' => 'PERSEN', 'nilai' => 50])->assertCreated();
        $this->postJson(self::API . '/beasiswa', ['id_siswa' => 'SIS-1', 'nama' => 'Tidak sah', 'bentuk' => 'PERSEN', 'nilai' => 120])->assertJsonValidationErrors('nilai');

        // Kelas 4A (3 siswa) × 2 bulan; diulang → semua dilewati
        $kirim = ['id_jenis_biaya' => $spp, 'bulan' => ['2029-08', '2029-07'], 'hari_jatuh_tempo' => 10, 'sasaran' => 'KELAS', 'id_kelas' => ['KLS-A']];
        $this->postJson(self::API . '/tagihan/buat', $kirim)->assertCreated()->assertJson(['dibuat' => 6, 'dilewati' => 0]);
        $this->postJson(self::API . '/tagihan/buat', $kirim)->assertOk()->assertJson(['dibuat' => 0, 'dilewati' => 6]);
        $this->assertSame(0, KeuTagihan::where('id_siswa', 'SIS-4')->count());

        $ani = $this->tagihanSiswa('SIS-1');
        $this->assertSame(['SPP Juli 2029', 'SPP Agustus 2029'], $ani->pluck('judul')->all());
        $this->assertSame('2029-07-10', $ani[0]->jatuh_tempo->toDateString());
        $this->assertSame([75000, 'Beasiswa prestasi', 75000], [$ani[0]->potongan, $ani[0]->keterangan_potongan, $ani[0]->sisa]);

        // Sekali bayar tanpa label memakai tahun ajaran aktif
        $kegiatan = $this->jenis(['nama' => 'Uang kegiatan', 'periode' => 'SEKALI', 'nominal' => 200000]);
        $this->postJson(self::API . '/tagihan/buat', ['id_jenis_biaya' => $kegiatan, 'jatuh_tempo' => '2029-09-01', 'sasaran' => 'SISWA', 'id_siswa' => ['SIS-2']])
            ->assertCreated()->assertJson(['dibuat' => 1]);
        $this->assertSame('Uang kegiatan 2029/2030', KeuTagihan::where('id_jenis_biaya', $kegiatan)->value('judul'));

        // Pembayaran Budi: Juli lunas + Agustus sebagian dalam satu kuitansi
        [$juli, $agustus] = $this->tagihanSiswa('SIS-2')->where('id_jenis_biaya', $spp)->values()->all();
        $bayar = fn($rincian, $tgl = null) => $this->postJson(self::API . '/pembayaran', [
            'id_siswa' => 'SIS-2', 'tanggal' => $tgl ?? now(config('app.zona_sekolah'))->toDateString(), 'metode' => 'TUNAI', 'penyetor' => 'Ibu Budi', 'rincian' => $rincian,
        ]);
        $bayar([['id_tagihan' => $agustus->id, 'jumlah' => 150001]])->assertJsonValidationErrors('rincian.0.jumlah');
        $bayar([['id_tagihan' => $ani[0]->id, 'jumlah' => 1000]])->assertJsonValidationErrors('rincian.0.id_tagihan');
        $bayar([['id_tagihan' => $juli->id, 'jumlah' => 1000]], now()->addDays(3)->toDateString())->assertJsonValidationErrors('tanggal');

        $p = $bayar([['id_tagihan' => $juli->id, 'jumlah' => 150000], ['id_tagihan' => $agustus->id, 'jumlah' => 50000]])->assertCreated()->json('data');
        $tahun = now(config('app.zona_sekolah'))->format('Y');
        $this->assertSame("KW-{$tahun}-00001", $p['nomor_kuitansi']);
        $this->assertSame(200000, $p['jumlah']);
        $this->assertSame(['LUNAS', 'SEBAGIAN'], [$juli->fresh()->status, $agustus->fresh()->status]);
        $this->assertSame(100000, $agustus->fresh()->sisa);
        $bayar([['id_tagihan' => $juli->id, 'jumlah' => 1]])->assertJsonValidationErrors('rincian.0.id_tagihan');

        $k = $this->getJson(self::API . "/pembayaran/{$p['id']}")->assertOk();
        $this->assertSame('Budi', $k->json('data.siswa.nama_siswa'));
        $this->assertCount(2, $k->json('data.rincian'));

        // Tagihan yang sudah dibayar tidak bisa dibatalkan atau diturunkan di bawah yang terbayar
        $this->postJson(self::API . "/tagihan/{$agustus->id}/batal", ['alasan' => 'keliru'])->assertJsonValidationErrors('status');
        $this->putJson(self::API . "/tagihan/{$agustus->id}", ['judul' => 'SPP Agustus 2029', 'nominal' => 40000, 'potongan' => 0, 'jatuh_tempo' => '2029-08-10'])
            ->assertJsonValidationErrors('nominal');
        $this->putJson(self::API . "/tagihan/{$agustus->id}", ['judul' => 'SPP Agustus 2029', 'nominal' => 150000, 'potongan' => 100000, 'keterangan_potongan' => 'Keringanan', 'jatuh_tempo' => '2029-08-10'])
            ->assertOk()->assertJsonPath('data.status', 'LUNAS');
        $this->assertSame(422, $this->deleteJson(self::API . "/jenis-biaya/{$spp}")->status());

        // Batalkan pembayaran: tagihan kembali terbuka, nomor kuitansi berikutnya tetap berurutan
        $this->postJson(self::API . "/pembayaran/{$p['id']}/batal", [])->assertJsonValidationErrors('alasan');
        $this->postJson(self::API . "/pembayaran/{$p['id']}/batal", ['alasan' => 'Salah siswa'])->assertOk();
        $this->assertSame(['BELUM', 'BELUM'], [$juli->fresh()->status, $agustus->fresh()->status]);
        $this->assertSame(0, $juli->fresh()->terbayar);
        $p2 = $bayar([['id_tagihan' => $juli->id, 'jumlah' => 150000]])->assertCreated()->json('data');
        $this->assertSame("KW-{$tahun}-00002", $p2['nomor_kuitansi']);

        // Tagihan belum dibayar bisa dibatalkan lalu dibuat ulang
        $citra = $this->tagihanSiswa('SIS-3')->first();
        $this->postJson(self::API . "/tagihan/{$citra->id}/batal", ['alasan' => 'Pindah sekolah'])->assertOk();
        $this->postJson(self::API . '/tagihan/buat', ['id_jenis_biaya' => $spp, 'bulan' => ['2029-07'], 'sasaran' => 'SISWA', 'id_siswa' => ['SIS-3']])
            ->assertCreated()->assertJson(['dibuat' => 1]);

        // Daftar siswa & ringkasan
        $siswa = collect($this->getJson(self::API . '/siswa?id_kelas=KLS-A')->assertOk()->json('data'))->keyBy('id_siswa');
        // Juli lunas lagi; Agustus 150.000 − potongan 100.000 belum dibayar; uang kegiatan 200.000
        $this->assertSame(50000 + 200000, $siswa['SIS-2']['sisa']);
        $this->getJson(self::API . '/ringkasan')->assertOk()->assertJsonPath('data.penerimaan_hari_ini', 150000);

        // Log Aktivitas modul Keuangan memuat nomor kuitansi
        $this->assertTrue(\App\Models\LogPerubahan::where('modul', 'Keuangan')->where('label', "KW-{$tahun}-00001 · Budi")->exists());
        $this->assertTrue(LogAktivitas::where('modul', 'Keuangan')->where('deskripsi', 'like', 'Mencatat pembayaran siswa%')->exists());
    }

    public function test_tunggakan_pengingat_wa_dan_notifikasi(): void
    {
        $ortu = MasterOrtu::create(['id_ortu' => 'ORT-1', 'nama_ayah' => 'Yakob', 'nama_ibu' => 'Maria', 'no_wa' => '081234567890']);
        Student::whereKey('SIS-1')->update(['id_ortu' => $ortu->id_ortu]);
        $spp = $this->jenis();
        $lalu = now(config('app.zona_sekolah'))->subMonths(2)->format('Y-m');
        $depan = now(config('app.zona_sekolah'))->addMonths(2)->format('Y-m');
        $this->postJson(self::API . '/tagihan/buat', ['id_jenis_biaya' => $spp, 'bulan' => [$lalu, $depan], 'sasaran' => 'SISWA', 'id_siswa' => ['SIS-1', 'SIS-2']])->assertCreated();

        $t = $this->getJson(self::API . '/tunggakan')->assertOk();
        $this->assertSame(300000, $t->json('total'));
        $ani = collect($t->json('data'))->firstWhere('id_siswa', 'SIS-1');
        $this->assertSame([150000, 1, '081234567890', 'Maria'], [$ani['total'], $ani['jumlah'], $ani['kontak']['no_wa'], $ani['kontak']['nama']]);
        $this->getJson(self::API . '/tagihan?status=TERTUNGGAK')->assertOk()->assertJsonCount(2, 'data');

        $siap = $this->postJson(self::API . '/pengingat', ['id_siswa' => ['SIS-1', 'SIS-2'], 'mode' => 'siapkan'])->assertOk()->json('data');
        $pesanAni = collect($siap)->firstWhere('id_siswa', 'SIS-1');
        $this->assertStringStartsWith('https://wa.me/6281234567890?text=', $pesanAni['tautan']);
        $this->assertStringContainsString('Rp150.000', $pesanAni['pesan']);
        $this->assertNull(collect($siap)->firstWhere('id_siswa', 'SIS-2')['tautan']);

        // Fonnte belum aktif → kirim otomatis ditolak dengan alasan; pengingat manual dicatat
        $this->postJson(self::API . '/pengingat', ['id_siswa' => ['SIS-1'], 'mode' => 'kirim'])->assertStatus(422);
        $this->postJson(self::API . '/pengingat/SIS-1/catat')->assertCreated();
        $this->assertSame('MANUAL', KeuPengingat::where('id_siswa', 'SIS-1')->value('cara'));
        $this->postJson(self::API . '/pengingat/SIS-4/catat')->assertJsonValidationErrors('id_siswa');
        $this->assertNotNull(collect($this->getJson(self::API . '/tunggakan')->json('data'))->firstWhere('id_siswa', 'SIS-1')['pengingat_terakhir']);

        $notif = collect($this->getJson('/api/notifikasi')->assertOk()->json('data'))->firstWhere('jenis', 'keuangan-tunggakan');
        $this->assertSame(2, $notif['jumlah']);
        $this->assertStringContainsString('Rp300.000', $notif['judul']);
    }

    public function test_tujuan_pembayaran_tampil_di_pengingat_dan_portal(): void
    {
        $this->postJson(self::API . '/tujuan-bayar', ['jenis' => 'EWALLET', 'penyedia' => 'GoPay', 'nomor' => '081299990000', 'atas_nama' => 'Bendahara SD Uji'])->assertCreated();
        $this->postJson(self::API . '/tujuan-bayar', ['jenis' => 'BANK', 'penyedia' => 'BRI', 'nomor' => '1234-01-000000-50-1', 'aktif' => false])->assertCreated();
        $this->postJson(self::API . '/tujuan-bayar', ['jenis' => 'PULSA', 'penyedia' => 'X', 'nomor' => '1'])->assertJsonValidationErrors('jenis');
        $this->assertCount(2, $this->getJson(self::API . '/pilihan')->json('data.tujuan_bayar'));

        Student::whereKey('SIS-1')->update(['no_wa' => '081234560000']);
        $spp = $this->jenis();
        $this->postJson(self::API . '/tagihan/buat', ['id_jenis_biaya' => $spp, 'bulan' => [now(config('app.zona_sekolah'))->subMonths(2)->format('Y-m')], 'sasaran' => 'SISWA', 'id_siswa' => ['SIS-1']])->assertCreated();
        $pesan = $this->postJson(self::API . '/pengingat', ['id_siswa' => ['SIS-1'], 'mode' => 'siapkan'])->json('data.0.pesan');
        $this->assertStringContainsString('GoPay 081299990000 a.n. Bendahara SD Uji', $pesan);
        $this->assertStringNotContainsString('BRI', $pesan);

        Sanctum::actingAs($this->sekolah->siswa);
        $this->getJson('/api/portal/tagihan?id_siswa=SIS-1')->assertOk()->assertJsonCount(1, 'data.tujuan_bayar')->assertJsonPath('data.tujuan_bayar.0.penyedia', 'GoPay');
    }

    public function test_kas_dan_laporan(): void
    {
        $spp = $this->jenis();
        $hariIni = now(config('app.zona_sekolah'))->toDateString();
        $this->postJson(self::API . '/tagihan/buat', ['id_jenis_biaya' => $spp, 'bulan' => [substr($hariIni, 0, 7)], 'sasaran' => 'SISWA', 'id_siswa' => ['SIS-1']])->assertCreated();
        $tagihan = KeuTagihan::first();
        $this->postJson(self::API . '/pembayaran', ['id_siswa' => 'SIS-1', 'tanggal' => $hariIni, 'metode' => 'TRANSFER', 'rincian' => [['id_tagihan' => $tagihan->id, 'jumlah' => 150000]]])->assertCreated();
        $this->postJson(self::API . '/kas', ['tanggal' => $hariIni, 'arah' => 'MASUK', 'kategori' => 'Dana BOS', 'jumlah' => 1000000])->assertCreated();
        $keluar = $this->postJson(self::API . '/kas', ['tanggal' => $hariIni, 'arah' => 'KELUAR', 'kategori' => 'ATK & bahan ajar', 'jumlah' => 250000, 'keterangan' => 'Kertas ujian'])->assertCreated()->json('data.id');
        $this->postJson(self::API . '/kas', ['tanggal' => $hariIni, 'arah' => 'KELUAR', 'kategori' => 'Honor', 'jumlah' => 0])->assertJsonValidationErrors('jumlah');

        $kas = $this->getJson(self::API . "/kas?dari={$hariIni}&sampai={$hariIni}")->assertOk()->json('data');
        $this->assertSame([0, 1150000, 250000, 900000], [$kas['saldo_awal'], $kas['masuk'], $kas['keluar'], $kas['saldo_akhir']]);
        $this->assertCount(3, $kas['baris']);
        $this->assertSame(900000, end($kas['baris'])['saldo']);
        $this->assertSame([['nama' => 'SPP', 'jumlah' => 150000]], $kas['per_jenis']);

        // Hari berikutnya: semuanya masuk saldo awal
        $besok = now(config('app.zona_sekolah'))->addDay()->toDateString();
        $this->assertSame(900000, $this->getJson(self::API . "/kas?dari={$besok}&sampai={$besok}")->json('data.saldo_awal'));

        $this->deleteJson(self::API . "/kas/{$keluar}")->assertOk();
        $this->assertSame(1150000, $this->getJson(self::API . "/kas?dari={$hariIni}&sampai={$hariIni}")->json('data.saldo_akhir'));
    }

    public function test_hak_akses_dan_portal(): void
    {
        $spp = $this->jenis();
        $this->postJson(self::API . '/tagihan/buat', ['id_jenis_biaya' => $spp, 'bulan' => ['2029-07'], 'sasaran' => 'SEMUA'])->assertCreated()->assertJson(['dibuat' => 4]);

        // Operator SPMB saja dan guru tanpa penunjukan tidak bisa membuka Keuangan
        $spmb = User::create(['name' => 'Staf SPMB', 'username' => 'staf.spmb', 'password' => 'rahasia123', 'role' => 'operator', 'aktif' => true]);
        OperatorSekolah::create(['id_user' => $spmb->id, 'submodul' => ['SPMB'], 'ditunjuk_oleh' => $this->sekolah->kepsek->id]);
        Sanctum::actingAs($spmb);
        $this->getJson(self::API . '/tagihan')->assertForbidden();
        Sanctum::actingAs($this->sekolah->guruA);
        $this->getJson(self::API . '/tagihan')->assertForbidden();

        // Peninjau membaca, tidak bisa mengubah; kepsek boleh semuanya
        Sanctum::actingAs(User::create(['name' => 'Yayasan', 'username' => 'yayasan.k', 'password' => 'rahasia123', 'role' => 'yayasan', 'aktif' => true]));
        $this->getJson(self::API . '/tagihan')->assertOk()->assertJsonCount(4, 'data');
        $this->postJson(self::API . '/jenis-biaya', ['nama' => 'X', 'periode' => 'SEKALI', 'nominal' => 1])->assertForbidden();
        Sanctum::actingAs($this->sekolah->kepsek);
        $this->postJson(self::API . '/kas', ['tanggal' => now(config('app.zona_sekolah'))->toDateString(), 'arah' => 'MASUK', 'kategori' => 'Sumbangan', 'jumlah' => 5000])->assertCreated();

        // Portal: siswa hanya melihat tagihannya sendiri
        Sanctum::actingAs($this->sekolah->siswa);
        $this->getJson('/api/portal/tagihan?id_siswa=SIS-1')->assertOk()->assertJsonCount(1, 'data.tagihan')->assertJsonPath('data.tagihan.0.judul', 'SPP Juli 2029');
        $this->getJson('/api/portal/tagihan?id_siswa=SIS-2')->assertForbidden();
        $this->getJson(self::API . '/tagihan')->assertForbidden();
    }
}

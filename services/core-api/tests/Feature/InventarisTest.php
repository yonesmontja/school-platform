<?php

namespace Tests\Feature;

use App\Models\InvBarang;
use App\Models\InvStok;
use App\Models\KeuKas;
use App\Models\MasterRuangan;
use App\Models\OperatorSekolah;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\Concerns\MembuatDataSekolah;
use Tests\TestCase;

/** Fase 26 Tahap E: Inventaris. */
class InventarisTest extends TestCase
{
    use RefreshDatabase, MembuatDataSekolah;

    private const API = '/api/administrasi/inventaris';
    private User $operator;

    protected function setUp(): void
    {
        parent::setUp();
        $this->buatSekolah();
        MasterRuangan::create(['id_ruangan' => 'RNG-1', 'nama_ruangan' => 'Kelas 4A']);
        MasterRuangan::create(['id_ruangan' => 'RNG-2', 'nama_ruangan' => 'Perpustakaan']);
        $this->operator = User::create(['name' => 'Staf Sarpras', 'username' => 'sarpras', 'password' => 'rahasia123', 'role' => 'operator', 'aktif' => true]);
        OperatorSekolah::create(['id_user' => $this->operator->id, 'submodul' => ['INVENTARIS'], 'ditunjuk_oleh' => $this->sekolah->kepsek->id]);
        Sanctum::actingAs($this->operator);
    }

    private function hariIni(int $geser = 0): string
    {
        return now(config('app.zona_sekolah'))->addDays($geser)->toDateString();
    }

    public function test_aset_penyusutan_pemeriksaan_dan_peminjaman(): void
    {
        $meja = $this->postJson(self::API . '/barang', [
            'nama' => 'Meja siswa', 'kategori' => 'Mebel', 'id_ruangan' => 'RNG-1', 'jumlah' => 20, 'satuan' => 'unit', 'kondisi' => 'BAIK',
            'tanggal_perolehan' => now(config('app.zona_sekolah'))->subYears(2)->toDateString(), 'harga_perolehan' => 500000, 'umur_ekonomis' => 8, 'sumber_dana' => 'BOS',
        ])->assertCreated()->json('data');
        $tahun = substr($this->hariIni(), 0, 4);
        $this->assertSame("INV-{$tahun}-0001", $meja['kode']);
        $proyektor = $this->postJson(self::API . '/barang', ['nama' => 'Proyektor', 'kategori' => 'Elektronik', 'id_ruangan' => 'RNG-2', 'jumlah' => 1, 'satuan' => 'unit', 'kondisi' => 'BAIK'])
            ->assertCreated()->json('data');
        $this->assertSame("INV-{$tahun}-0002", $proyektor['kode']);

        // Nilai buku garis lurus: 2 dari 8 tahun → 75% dari 10.000.000
        $daftar = collect($this->getJson(self::API . '/barang?id_ruangan=RNG-1')->assertOk()->json('data'));
        $this->assertCount(1, $daftar);
        $this->assertEqualsWithDelta(7500000, $daftar[0]['nilai_buku'], 10000);
        $this->assertSame(10000000, $this->getJson(self::API . '/ringkasan')->json('data.nilai_perolehan'));

        // Peminjaman: tidak boleh melebihi yang tersedia; jumlah aset tidak boleh di bawah yang dipinjam
        $hariIni = $this->hariIni();
        $this->postJson(self::API . '/peminjaman', ['id_barang' => $meja['id'], 'jumlah' => 21, 'peminjam' => 'Guru A', 'tgl_pinjam' => $hariIni])->assertJsonValidationErrors('jumlah');
        $pinjam = $this->postJson(self::API . '/peminjaman', ['id_barang' => $meja['id'], 'jumlah' => 5, 'peminjam' => 'Panitia lomba', 'keperluan' => 'Lomba 17-an',
            'tgl_pinjam' => $this->hariIni(-5), 'rencana_kembali' => $this->hariIni(-1)])->assertCreated()->json('data.id');
        $this->postJson(self::API . '/peminjaman', ['id_barang' => $meja['id'], 'jumlah' => 16, 'peminjam' => 'X', 'tgl_pinjam' => $hariIni])->assertJsonValidationErrors('jumlah');
        $this->putJson(self::API . "/barang/{$meja['id']}", ['nama' => 'Meja siswa', 'kategori' => 'Mebel', 'jumlah' => 4, 'satuan' => 'unit', 'kondisi' => 'BAIK'])->assertJsonValidationErrors('jumlah');
        $this->assertSame(5, collect($this->getJson(self::API . '/barang')->json('data'))->firstWhere('id', $meja['id'])['dipinjam']);
        $this->assertSame(1, collect($this->getJson('/api/notifikasi')->json('data'))->firstWhere('jenis', 'pinjam-terlambat')['jumlah']);
        $this->postJson(self::API . "/barang/{$meja['id']}/hapus", ['alasan' => 'x'])->assertJsonValidationErrors('alasan');

        // Kembali rusak ringan → kondisi aset ikut berubah dan tercatat di riwayat
        $this->postJson(self::API . "/peminjaman/{$pinjam}/kembali", ['tgl_kembali' => $hariIni, 'kondisi_kembali' => 'RUSAK_RINGAN', 'catatan_kembali' => '1 kaki goyang'])->assertOk();
        $this->postJson(self::API . "/peminjaman/{$pinjam}/kembali", ['tgl_kembali' => $hariIni, 'kondisi_kembali' => 'BAIK'])->assertJsonValidationErrors('status');
        $detail = $this->getJson(self::API . "/barang/{$meja['id']}")->assertOk()->json('data');
        $this->assertSame('RUSAK_RINGAN', $detail['kondisi']);
        $this->assertStringContainsString('Panitia lomba', $detail['pemeriksaan'][0]['catatan']);

        // Pemeriksaan berkala: rusak berat → tidak bisa dipinjam; lalu dihapus dari buku inventaris
        $this->postJson(self::API . "/barang/{$proyektor['id']}/periksa", ['tanggal' => $hariIni, 'kondisi' => 'RUSAK_BERAT', 'catatan' => 'Lampu mati'])->assertCreated();
        $this->postJson(self::API . '/peminjaman', ['id_barang' => $proyektor['id'], 'jumlah' => 1, 'peminjam' => 'Guru B', 'tgl_pinjam' => $hariIni])->assertJsonValidationErrors('id_barang');
        $this->postJson(self::API . "/barang/{$proyektor['id']}/hapus", ['alasan' => 'Rusak berat, tidak ekonomis diperbaiki'])->assertOk();
        $this->assertCount(1, $this->getJson(self::API . '/barang')->json('data'));
        $this->assertCount(1, $this->getJson(self::API . '/barang?dihapus=1')->json('data'));
    }

    public function test_stok_habis_pakai_dan_pengadaan(): void
    {
        $kapur = $this->postJson(self::API . '/stok', ['nama' => 'Spidol papan', 'satuan' => 'pcs', 'stok_minimum' => 10, 'stok_awal' => 30])->assertCreated()->json('data.id');
        $this->postJson(self::API . "/stok/{$kapur}/mutasi", ['tanggal' => $this->hariIni(), 'arah' => 'KELUAR', 'jumlah' => 31, 'keterangan' => 'Kelas 4A'])->assertJsonValidationErrors('jumlah');
        $r = $this->postJson(self::API . "/stok/{$kapur}/mutasi", ['tanggal' => $this->hariIni(), 'arah' => 'KELUAR', 'jumlah' => 22, 'keterangan' => 'Dibagikan ke guru'])->assertOk();
        $this->assertStringContainsString('batas minimum', $r->json('message'));
        $this->assertSame(8, InvStok::find($kapur)->stok);
        $this->assertCount(2, $this->getJson(self::API . "/stok/{$kapur}")->json('data.mutasi'));
        $this->assertSame(1, collect($this->getJson('/api/notifikasi')->json('data'))->firstWhere('jenis', 'stok-menipis')['jumlah']);

        // Pengadaan: operator mengajukan, kepala sekolah memutuskan, barang diterima masuk ke aset + stok + kas
        $p = $this->postJson(self::API . '/pengadaan', ['judul' => 'Pengadaan semester ganjil', 'tanggal' => $this->hariIni(), 'alasan' => 'Stok menipis', 'rincian' => [
            ['nama' => 'Spidol papan', 'jumlah' => 50, 'satuan' => 'pcs', 'harga' => 8000],
            ['nama' => 'Lemari arsip', 'jumlah' => 1, 'satuan' => 'unit', 'harga' => 1500000],
        ]])->assertCreated()->json('data');
        $this->assertSame(1900000, $p['total']);
        $this->postJson(self::API . "/pengadaan/{$p['id']}/putuskan", ['keputusan' => 'DISETUJUI'])->assertForbidden();
        $this->postJson(self::API . "/pengadaan/{$p['id']}/selesaikan", ['tanggal' => $this->hariIni()])->assertJsonValidationErrors('status');

        Sanctum::actingAs($this->sekolah->kepsek);
        $this->assertSame(1, collect($this->getJson('/api/notifikasi')->json('data'))->firstWhere('jenis', 'pengadaan-keputusan')['jumlah']);
        $this->postJson(self::API . "/pengadaan/{$p['id']}/putuskan", ['keputusan' => 'DITOLAK'])->assertJsonValidationErrors('catatan');
        $this->postJson(self::API . "/pengadaan/{$p['id']}/putuskan", ['keputusan' => 'DISETUJUI', 'catatan' => 'Silakan beli'])->assertOk();

        Sanctum::actingAs($this->operator);
        $this->putJson(self::API . "/pengadaan/{$p['id']}", ['judul' => 'x', 'tanggal' => $this->hariIni(), 'rincian' => [['nama' => 'x', 'jumlah' => 1, 'satuan' => 'pcs', 'harga' => 1]]])->assertJsonValidationErrors('status');
        $this->postJson(self::API . "/pengadaan/{$p['id']}/selesaikan", ['tanggal' => $this->hariIni(), 'catat_kas' => true, 'masuk' => [
            ['indeks' => 0, 'ke' => 'STOK', 'id_stok' => $kapur],
            ['indeks' => 1, 'ke' => 'ASET', 'kategori' => 'Mebel', 'id_ruangan' => 'RNG-2'],
        ]])->assertOk()->assertJsonPath('message', 'Pengadaan selesai. 1 barang masuk ke aset. 1 barang masuk ke stok. Pengeluaran dicatat di kas.');
        $this->assertSame(58, InvStok::find($kapur)->stok);
        $lemari = InvBarang::where('nama', 'Lemari arsip')->first();
        $this->assertSame(['RNG-2', 1500000, 'BAIK'], [$lemari->id_ruangan, $lemari->harga_perolehan, $lemari->kondisi]);
        $this->assertSame(1900000, KeuKas::where('kategori', 'Pengadaan barang')->value('jumlah'));
        $this->deleteJson(self::API . "/pengadaan/{$p['id']}")->assertJsonValidationErrors('status');

        // Akses: operator Inventaris tidak bisa membuka Surat; guru tidak bisa membuka Inventaris
        $this->getJson('/api/administrasi/surat/arsip')->assertForbidden();
        Sanctum::actingAs($this->sekolah->guruA);
        $this->getJson(self::API . '/barang')->assertForbidden();
    }
}

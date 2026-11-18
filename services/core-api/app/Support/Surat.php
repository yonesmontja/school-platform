<?php

namespace App\Support;

use App\Models\AdmPengaturan;
use App\Models\MasterPeriode;
use App\Models\SchoolSetting;
use App\Models\Student;

/** Konstanta & bantuan Surat dan Arsip (Administrasi Sekolah Tahap D). */
class Surat
{
    public const STATUS = ['DRAF' => 'Draf', 'DIAJUKAN' => 'Menunggu tanda tangan', 'TERBIT' => 'Terbit', 'BATAL' => 'Dibatalkan'];

    public const SIFAT = ['Biasa', 'Penting', 'Segera', 'Rahasia'];

    public const FORMAT_BAWAAN = '{urut}/{kode}/{singkatan}/{bulan_romawi}/{tahun}';

    public const KATEGORI_ARSIP = ['Kurikulum', 'Kesiswaan', 'Kepegawaian', 'Keuangan', 'Sarana prasarana', 'Humas', 'Lainnya'];

    public const KATEGORI_LEGAL = ['Izin operasional', 'Akreditasi', 'Akta yayasan', 'NPSN', 'Sertifikat tanah', 'Perjanjian kerja sama', 'Lainnya'];

    /** Hari sebelum masa berlaku habis saat pengingat dokumen legal mulai muncul. */
    public const HARI_PENGINGAT = 90;

    /** Isian templat: {{kunci}} → keterangan. {{nomor}} dan {{tanggal}} diisi saat surat dicetak. */
    public const ISIAN = [
        'nomor' => 'Nomor surat (terisi setelah terbit)', 'tanggal' => 'Tanggal surat',
        'nama_sekolah' => 'Nama sekolah', 'alamat_sekolah' => 'Alamat sekolah', 'kota' => 'Kota', 'npsn' => 'NPSN',
        'nama_kepsek' => 'Nama kepala sekolah', 'nip_kepsek' => 'NIP kepala sekolah', 'tahun_ajaran' => 'Tahun ajaran aktif',
        'nama_siswa' => 'Nama siswa', 'nisn' => 'NISN', 'kelas' => 'Kelas', 'tempat_lahir' => 'Tempat lahir', 'tanggal_lahir' => 'Tanggal lahir',
        'jenis_kelamin' => 'Jenis kelamin', 'nama_ayah' => 'Nama ayah', 'nama_ibu' => 'Nama ibu', 'nama_wali' => 'Nama wali', 'alamat_siswa' => 'Alamat siswa',
    ];

    private const ROMAWI = [1 => 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];

    public static function pengaturan(): array
    {
        return array_merge(['format' => self::FORMAT_BAWAAN, 'singkatan' => 'SEK', 'digit' => 3], (array) AdmPengaturan::ambil('surat_nomor', []));
    }

    /** Susun nomor surat dari format; bagian kosong (mis. tanpa kode klasifikasi) dirapatkan. */
    public static function susunNomor(int $urut, ?string $kode, string $tanggal, ?array $atur = null): string
    {
        $atur ??= self::pengaturan();
        [$th, $bl] = explode('-', $tanggal);
        $nomor = strtr($atur['format'], [
            '{urut}' => str_pad((string) $urut, (int) $atur['digit'], '0', STR_PAD_LEFT), '{kode}' => (string) $kode,
            '{singkatan}' => (string) $atur['singkatan'], '{bulan_romawi}' => self::ROMAWI[(int) $bl], '{bulan}' => $bl, '{tahun}' => $th,
        ]);
        return trim(preg_replace(['#/{2,}#', '#\.{2,}#', '#-{2,}#'], ['/', '.', '-'], $nomor), '/.- ');
    }

    /** Isi {{kunci}} sekolah (dan siswa bila dipilih); {{nomor}} & {{tanggal}} dibiarkan untuk saat cetak. */
    public static function isiTemplat(string $isi, ?Student $s = null): string
    {
        $sek = SchoolSetting::first();
        $nilai = [
            'nama_sekolah' => $sek?->nama_sekolah, 'alamat_sekolah' => $sek?->alamat_sekolah, 'kota' => $sek?->kota, 'npsn' => $sek?->npsn,
            'nama_kepsek' => $sek?->nama_kepsek, 'nip_kepsek' => $sek?->nip_kepsek,
            'tahun_ajaran' => MasterPeriode::where('status_aktif', 'AKTIF')->value('tahun_ajaran'),
        ];
        if ($s) {
            $s->loadMissing(['kelas', 'ortu', 'wali']);
            $nilai += [
                'nama_siswa' => $s->nama_siswa, 'nisn' => $s->nisn, 'kelas' => $s->kelas?->nama_kelas, 'tempat_lahir' => $s->tempat_lahir,
                'tanggal_lahir' => $s->tgl_lahir ? Keuangan::tanggal((string) $s->tgl_lahir) : null,
                'jenis_kelamin' => ['L' => 'Laki-laki', 'P' => 'Perempuan'][$s->jenis_kelamin] ?? null,
                'nama_ayah' => $s->ortu?->nama_ayah, 'nama_ibu' => $s->ortu?->nama_ibu, 'nama_wali' => $s->wali?->nama_wali, 'alamat_siswa' => $s->jalan_siswa,
            ];
        }
        return preg_replace_callback('/\{\{\s*(\w+)\s*\}\}/', function ($m) use ($nilai) {
            if (!array_key_exists($m[1], $nilai)) return $m[0];
            return e((string) ($nilai[$m[1]] ?? '…'));
        }, $isi);
    }

    /** Templat contoh untuk sekolah yang baru mulai. */
    public static function contohTemplat(): array
    {
        return [
            ['nama' => 'Surat Keterangan Aktif Sekolah', 'kode_klasifikasi' => '421.2', 'perihal' => 'Surat Keterangan Aktif',
                'isi' => '<p>Yang bertanda tangan di bawah ini, Kepala {{nama_sekolah}}, menerangkan bahwa:</p>'
                    . '<table><tbody><tr><td>Nama</td><td>: {{nama_siswa}}</td></tr><tr><td>NISN</td><td>: {{nisn}}</td></tr>'
                    . '<tr><td>Tempat, tanggal lahir</td><td>: {{tempat_lahir}}, {{tanggal_lahir}}</td></tr><tr><td>Kelas</td><td>: {{kelas}}</td></tr>'
                    . '<tr><td>Nama orang tua</td><td>: {{nama_ayah}} / {{nama_ibu}}</td></tr></tbody></table>'
                    . '<p>adalah benar siswa aktif di {{nama_sekolah}} pada tahun ajaran {{tahun_ajaran}}.</p>'
                    . '<p>Demikian surat keterangan ini dibuat untuk dipergunakan sebagaimana mestinya.</p>'],
            ['nama' => 'Undangan Orang Tua/Wali', 'kode_klasifikasi' => '005', 'perihal' => 'Undangan',
                'isi' => '<p>Dengan hormat,</p><p>Kami mengundang Bapak/Ibu orang tua/wali dari ananda {{nama_siswa}} (kelas {{kelas}}) untuk hadir pada:</p>'
                    . '<table><tbody><tr><td>Hari, tanggal</td><td>: …</td></tr><tr><td>Waktu</td><td>: …</td></tr><tr><td>Tempat</td><td>: {{nama_sekolah}}</td></tr>'
                    . '<tr><td>Acara</td><td>: …</td></tr></tbody></table><p>Mengingat pentingnya acara tersebut, kami mohon Bapak/Ibu dapat hadir tepat waktu. Atas perhatiannya kami ucapkan terima kasih.</p>'],
            ['nama' => 'Surat Tugas', 'kode_klasifikasi' => '800', 'perihal' => 'Surat Tugas',
                'isi' => '<p>Kepala {{nama_sekolah}} dengan ini menugaskan:</p><table><tbody><tr><td>Nama</td><td>: …</td></tr><tr><td>Jabatan</td><td>: …</td></tr></tbody></table>'
                    . '<p>untuk melaksanakan tugas … pada tanggal … bertempat di ….</p><p>Demikian surat tugas ini dibuat untuk dilaksanakan dengan penuh tanggung jawab.</p>'],
        ];
    }
}

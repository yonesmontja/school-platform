# Bab VI Pengujian dan Evaluasi

## 6.1 Strategi Pengujian

Pengujian dilakukan berlapis, dari yang paling cepat dan banyak hingga yang paling dekat dengan pengalaman pengguna:

```diagram
{"jenis":"alir","nomor":"6.1","judul":"Lapisan pengujian SAPrapor",
 "kolom_lebar":200,"baris_tinggi":78,
 "simpul":[
  {"id":"a","teks":"Uji lapangan & gladi","sub":"guru, wali kelas, orang tua; gladi Tutup Semester pada salinan data asli","x":1,"y":0,"w":250,"gaya":"aksen"},
  {"id":"b","teks":"Tes end-to-end (Playwright)","sub":"alur pengguna di browser pada build produksi baru","x":1,"y":1,"w":330,"gaya":"utama"},
  {"id":"c","teks":"Tes fitur backend (PHPUnit + PostgreSQL)","sub":"aturan bisnis, hak akses per peran, validasi, audit","x":1,"y":2,"w":410},
  {"id":"d","teks":"Validasi & batasan di kode","sub":"aturan validasi Laravel, middleware, constraint basis data","x":1,"y":3,"w":490,"gaya":"lemah"},
  {"id":"n1","teks":"lambat, sedikit, paling dekat pengguna","x":3.1,"y":0,"bentuk":"catatan","w":170},
  {"id":"n2","teks":"cepat, banyak, jalan setiap rilis","x":3.1,"y":2.5,"bentuk":"catatan","w":170}
 ],
 "panah":[]}
```

| Lapisan | Alat | Lingkungan | Kapan dijalankan |
|---|---|---|---|
| Tes fitur backend | PHPUnit (Laravel) | Basis data `school_platform_test` yang dikosongkan setiap tes; tes menolak berjalan bila nama basis data tidak berakhiran `_test` | Setiap rilis dan setiap perubahan controller, akses, atau migrasi |
| Tes end-to-end | Playwright (Chromium) | Build web produksi baru (:3002) + API uji `core-api-e2e` dengan basis data `school_platform_e2e` berisi sekolah fiktif | Setiap rilis, sebelum situs publik diganti |
| Gladi operasional | `semester:gladi` | Salinan data asli di basis data berakhiran `_gladi` | Sebelum pergantian semester |
| Uji lapangan | Skenario tugas + lembar masukan | Situs publik, pengguna nyata | Setelah fitur inti stabil dan setelah perubahan besar |

## 6.2 Tes Fitur Backend

Setiap berkas tes membangun sekolah mini (2 guru, 2 rombel, 2 mapel, 4 siswa, satu akun untuk tiap peran) lalu memeriksa perilaku API dari sudut pandang tiap peran. Daftar berikut dibaca langsung dari folder tes saat dokumen dibuka:

{{daftar_tes}}

Contoh hal yang dipastikan oleh tes:

- Guru hanya dapat menilai mapel di rombel yang diampunya; peninjau menerima 403 untuk setiap perubahan.
- Kata sandi tidak pernah muncul di log aktivitas, log perubahan, maupun riwayat kirim akses.
- Rapor semester lama tetap sama setelah siswa naik kelas dan wali kelas berganti.
- Kiriman nilai offline yang bentrok ditolak 409 dan baru tersimpan bila dipaksa.
- Jam kirim akses WhatsApp tepat di tepinya: 07:29 ditolak, 07:30 dibuka, 12:00 ditutup, Sabtu ditutup.
- Narasi jurnal sensitif disamarkan bagi yang tidak berhak, tetapi skornya tetap dihitung.

## 6.3 Tes End-to-End

Tes Playwright membuka halaman seperti pengguna sungguhan: masuk dengan peran tertentu, mengisi formulir, menekan tombol, dan memeriksa hasil yang tampil, termasuk unduhan, salinan papan klip, mode offline (jaringan diputus di browser), dan tangkapan layar untuk diperiksa manual. Per 25 November 2026 terdapat 42 berkas spesifikasi yang mencakup antara lain alur guru lengkap, Input Nilai dan pindah lembar, jurnal sensitif, offline, bank soal dan CBT, perangkat ajar, Peta Tema, Laporan STNKM dan rinciannya, administrasi (SPMB, keuangan, surat, inventaris), kartu pelajar, pesan orang tua, peringatan dini, kirim akses WhatsApp, dan dokumen teknis ini.

Pada rilis 24 November 2026, gerbang rilis mencatat **256 tes backend (3.177 asersi) dan 92 tes web lulus** sebelum situs publik diganti.

## 6.4 Pengujian Fungsional (Black-Box)

| No | Skenario | Masukan | Hasil yang diharapkan | Hasil |
|---|---|---|---|---|
| 1 | Masuk dengan sandi salah berulang | 6 percobaan dalam 1 menit | Akun ditahan sementara (429), percobaan tercatat | Sesuai (LoginTest) |
| 2 | Guru membuka mapel yang tidak diampu | Permintaan nilai mapel lain | 403, tercatat sebagai percobaan ditolak | Sesuai (AksesPeranTest) |
| 3 | Input nilai per indikator | 3 indikator, satu di bawah KKM | Nilai materi = rata-rata; muncul calon tindak lanjut | Sesuai (RemedialTest, NotifikasiTest) |
| 4 | Remedial per indikator | Perbaikan indikator yang belum tuntas | Nilai remedial = rata-rata setelah perbaikan; rapor dibatasi KKM sesuai pengaturan | Sesuai (SiklusRemedialTest) |
| 5 | Nilai offline bentrok | Nilai diubah akun lain sebelum kiriman tiba | 409; Timpa menyimpan, Buang membatalkan | Sesuai (NilaiBentrokOfflineTest, offline.spec) |
| 6 | Pindahkan lembar nilai | Lembar salah materi, tujuan sudah berisi | Pratinjau, daftar bentrok, timpa opsional, poin dihitung ulang | Sesuai (NilaiPindahLembarTest) |
| 7 | Jurnal sensitif | Guru lain membaca rincian siswa | Narasi disamarkan, skor tetap | Sesuai (LaporanStnkmSiswaTest) |
| 8 | Rapor resmi berubah setelah terbit | Nilai diubah setelah terbit | Ditandai berubah; terbit ulang membuat kode baru | Sesuai (RaporTerbitTest) |
| 9 | Tutup semester | Wizard pada data uji | Rombel, pengampu, pola jadwal tersalin; semester lama terkunci | Sesuai (TutupSemesterTest) |
| 10 | Kenaikan kelas | Siswa dengan 3 mapel di bawah KKM | Usulan tidak naik; diterapkan saat tahun ajaran baru | Sesuai (KenaikanTest) |
| 11 | Kirim akses WhatsApp di luar jam | Sabtu atau pukul 12:00 WIT | Ditolak dengan keterangan jam buka berikutnya | Sesuai (KirimAksesTest) |
| 12 | Dokumen teknis oleh non-admin | Kepala sekolah membuka endpoint | 403 | Sesuai (DokumenTeknisTest) |

## 6.5 Uji Coba Lapangan

Uji coba dilakukan bersama guru dan orang tua dengan 21 tugas yang mewakili pekerjaan nyata (mengisi nilai, menulis jurnal, mengisi presensi, menyusun tindak lanjut, mencetak rapor, membuka portal anak). Kriteria keberhasilan: semua temuan **Kritis** diperbaiki dan sekurang-kurangnya 17 dari 21 tugas diselesaikan **mandiri**.

| Ukuran | Hasil |
|---|---|
| Tugas diselesaikan mandiri | 17 dari 21 |
| Temuan Kritis | 0 |
| Temuan Penting | 7, semuanya diperbaiki dan diterbitkan |

| Kode | Temuan Penting | Perbaikan |
|---|---|---|
| G4 | Kelas, mapel, materi harus dipilih ulang setiap menilai | Terisi otomatis dari jadwal hari ini |
| G6 | Tindak lanjut di Perlu Tindakan tidak langsung membuka lembar yang tepat; bukti remedial terpisah dari jadwal | Tautan membuka lembar nilai siswa itu; bukti disimpan sebagai lampiran sesi jadwal |
| G7 | Tombol remedial muncul untuk asesmen diagnostik | Dinonaktifkan untuk diagnostik |
| W4 | Pilihan rapor hilang setelah kembali dari WhatsApp | Panel dan pilihan dipulihkan dari sessionStorage |
| W6 | Asal kalimat deskripsi rapor tidak jelas | Penjelasan deskripsi per mapel |
| O1 | Nama anak tidak tampil di akun orang tua | Nama anak tertaut ditampilkan |
| O2–O4 | Portal sulit dijelajahi; riwayat remedial tidak mudah ditemukan | Tautan langsung per tab, pencarian, saringan, dan PDF |

Selain uji coba terstruktur, dasbor **Pemakaian Aplikasi** dipakai selama masa pakai nyata untuk melihat adopsi tiap fitur, guru yang belum aktif, dan hambatan teknis (permintaan gagal, rute paling lambat). Temuan dari pemakaian nyata menjadi fase 27 (penyempurnaan dari pemakaian sekolah).

## 6.6 Evaluasi Nonfungsional

| Aspek | Temuan | Tindakan |
|---|---|---|
| Kinerja API di Windows | Membaca ribuan berkas vendor lewat *bind mount* membuat tiap permintaan ±4 detik | Folder vendor dipindah ke volume Docker |
| Durasi tes | Hash sandi bcrypt memperlambat tes backend (151 detik) | Putaran bcrypt 4 khusus tes → ±37 detik; seluruh rilis ±2,5 menit |
| HP berspesifikasi rendah | Halaman berat memperlambat menu | Prefetch sidebar dimatikan, pustaka Excel dimuat malas, alat ukur HP di repo |
| Mikrofon HP | Header *Permissions-Policy* memblokir mikrofon untuk soal membaca nyaring | Diizinkan untuk domain sendiri |
| Ketersediaan | Situs bergantung pada satu komputer | Pemantau uptime mandiri tiap 5 menit dengan WA ke admin; backup harian dan salinan Google Drive |
| Tes tidak stabil | Urutan entri bertanggal sama tidak pasti | Pengurutan deterministik dengan kunci tambahan |

## 6.7 Evaluasi terhadap Rumusan Masalah

| Rumusan masalah | Jawaban sistem | Bukti |
|---|---|---|
| Data cukup diisi sekali | Rantai CP → TP → indikator → nilai → rapor dalam satu basis data; rapor deskriptif disusun dari indikator | Bab IV, ERD; deskripsi rapor otomatis |
| Akademik dan perilaku dalam satu model | STNKM dari nilai (0–100) dan jurnal (−5..+5), dibaca terpisah atau bersama | Laporan STNKM dan rinciannya |
| Tetap bekerja tanpa sinyal | Antrean offline per akun, penyiapan halaman, konflik 409 | NilaiBentrokOfflineTest, offline.spec |
| AI yang aman dan akuntabel | Draf diperiksa guru, disetujui kepala sekolah; tanpa nama siswa; rujukan pustaka | Alur persetujuan, Perlu Tindakan |
| Keamanan dan kesinambungan | Akses per peran di server, audit hanya-tambah, backup terverifikasi, riwayat per semester, kunci semester | LogAktivitasTest, RiwayatRombelTest, TutupSemesterTest |

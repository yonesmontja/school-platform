# Bab I Pendahuluan

## 1.1 Latar Belakang

Kurikulum Merdeka mengubah cara sekolah merencanakan dan menilai pembelajaran. Guru tidak lagi cukup mencatat satu nilai per mata pelajaran; Capaian Pembelajaran (CP) per fase harus diturunkan menjadi Alur Tujuan Pembelajaran (ATP), Tujuan Pembelajaran (TP), dan indikator ketercapaian (IKTP). Asesmen dibedakan menjadi diagnostik di awal, formatif selama proses, dan sumatif di akhir, dan hasilnya wajib ditindaklanjuti dengan remedial atau pengayaan. Rapor pun harus memuat deskripsi capaian, bukan sekadar angka.

Di sekolah dasar di Nabire, Papua Tengah, tuntutan tersebut berhadapan dengan kondisi lapangan yang khas:

- **Konektivitas tidak stabil.** Sinyal di ruang kelas sering putus, sehingga aplikasi yang harus selalu daring tidak dapat diandalkan untuk mengisi nilai atau presensi.
- **Perangkat utama adalah telepon genggam.** Guru dan orang tua lebih sering memakai HP daripada komputer.
- **Data tersebar.** Nilai di lembar kerja, jurnal perilaku di buku catatan, presensi di kertas, dan rapor di aplikasi e-Rapor; data yang sama diketik berulang kali.
- **Perkembangan karakter sulit diukur.** Catatan perilaku siswa bersifat naratif dan tidak pernah tersambung dengan capaian akademik.
- **Beban administrasi tinggi.** Waktu guru tersita untuk menyusun dokumen perangkat ajar, soal, dan laporan, bukan untuk mendampingi siswa.

SAPrapor dikembangkan untuk menjawab kondisi tersebut: satu sistem yang menyatukan perencanaan, pelaksanaan, penilaian, dan pelaporan pembelajaran, yang dapat dipakai dari HP, tetap bekerja saat sinyal putus, dan memanfaatkan kecerdasan buatan untuk meringankan pekerjaan rutin tanpa mengambil alih keputusan pedagogis guru.

## 1.2 Rumusan Masalah

1. Bagaimana merancang satu sistem yang menghubungkan CP, TP, indikator, asesmen, tindak lanjut, dan rapor sehingga data cukup diisi sekali dan dipakai di semua laporan?
2. Bagaimana memadukan penilaian akademik dan catatan perilaku naratif ke dalam satu model perkembangan siswa yang dapat dibandingkan dari waktu ke waktu?
3. Bagaimana sistem tetap dapat dipakai guru di kelas dengan sinyal tidak stabil tanpa kehilangan atau menimpa data?
4. Bagaimana memanfaatkan AI generatif untuk meringankan beban guru sambil menjaga mutu, akuntabilitas, dan privasi data anak?
5. Bagaimana menjamin keamanan, keterlacakan, dan kesinambungan data sekolah lintas semester dan tahun ajaran?

## 1.3 Tujuan

1. Membangun sistem informasi terintegrasi untuk perencanaan, penilaian, jurnal, presensi, remedial, rapor, dan administrasi sekolah dasar.
2. Menerapkan model STNKM sebagai bahasa bersama antara nilai akademik dan catatan perilaku.
3. Menerapkan arsitektur *offline-first* untuk pekerjaan harian guru.
4. Menerapkan AI sebagai asisten dengan alur persetujuan berjenjang dan perlindungan data pribadi.
5. Menyediakan jejak audit, kontrol akses berbasis peran, cadangan data otomatis, dan pengujian otomatis sebelum setiap rilis.

## 1.4 Manfaat

| Pihak | Manfaat |
|---|---|
| Guru | Nilai, jurnal, dan presensi diisi sekali dari HP, termasuk saat offline; draf soal, ATP, dan modul ajar dibantu AI; tindak lanjut siswa terpantau otomatis. |
| Wali kelas | Rapor, catatan wali, kenaikan kelas, portofolio, dan komunikasi dengan orang tua dalam satu tempat. |
| Kepala sekolah | Persetujuan perangkat ajar dan soal, pemantauan mutu pembelajaran, analitik lintas semester, dan peringatan dini siswa berisiko. |
| Orang tua dan siswa | Portal untuk melihat capaian, tindak lanjut, jadwal, kehadiran, rapor resmi, dan pesan dari wali kelas. |
| Tata usaha | SPMB, keuangan, surat dan arsip, serta inventaris dalam sistem yang sama. |
| Peneliti dan pengembang | Contoh penerapan sistem informasi sekolah yang dirancang dari kebutuhan lapangan, terdokumentasi, dan teruji. |

## 1.5 Batasan Masalah

1. Sistem dirancang untuk satu sekolah (*single tenant*); dukungan banyak sekolah ditunda.
2. Jenjang yang menjadi acuan adalah sekolah dasar (fase A–C) Kurikulum Merdeka.
3. Ekspor ke aplikasi e-Rapor resmi berupa rekap yang mudah disalin; format impor resmi menunggu berkas dari operator.
4. Pengiriman WhatsApp otomatis bergantung pada gateway pihak ketiga (Fonnte); tanpa itu pesan disiapkan untuk dikirim manual.
5. Server berjalan pada satu komputer sekolah dengan akses publik melalui Cloudflare Tunnel; penyimpanan berkas bersifat lokal dan ikut dicadangkan.

## 1.6 Metodologi Pengembangan

Pengembangan memakai pendekatan **iteratif-inkremental** yang dipadukan dengan **purwarupa dan uji lapangan**. Setiap fase menghasilkan fitur yang langsung dipakai sekolah; umpan balik pemakaian menjadi masukan fase berikutnya. Setiap perubahan melewati tes otomatis sebelum diterbitkan ke situs publik.

```diagram
{"jenis":"alir","nomor":"1.1","judul":"Siklus pengembangan iteratif SAPrapor",
 "kolom_lebar":175,"baris_tinggi":92,
 "simpul":[
  {"id":"a","teks":"Analisis kebutuhan","sub":"pemakaian sekolah, kurikulum","x":0,"y":0,"gaya":"utama"},
  {"id":"b","teks":"Rancangan","sub":"data, alur, antarmuka","x":1,"y":0},
  {"id":"c","teks":"Implementasi","sub":"jalur kerja :3001","x":2,"y":0},
  {"id":"d","teks":"Tes otomatis","sub":"backend + end-to-end","x":3,"y":0},
  {"id":"e","teks":"Terbit","sub":"terbitkan.sh","x":3,"y":1,"gaya":"aksen"},
  {"id":"f","teks":"Pemakaian nyata","sub":"guru, wali, orang tua","x":2,"y":1},
  {"id":"g","teks":"Evaluasi","sub":"Pemakaian Aplikasi, log, temuan","x":1,"y":1},
  {"id":"h","teks":"Dokumentasi","sub":"README, Panduan, roadmap","x":0,"y":1}
 ],
 "panah":[
  {"dari":"a","ke":"b"},{"dari":"b","ke":"c"},{"dari":"c","ke":"d"},
  {"dari":"d","ke":"e","teks":"lulus"},{"dari":"d","ke":"c","putus":true,"teks":"gagal","lewat":[[3,-0.42],[2,-0.42]]},
  {"dari":"e","ke":"f"},{"dari":"f","ke":"g"},{"dari":"g","ke":"h"},{"dari":"h","ke":"a"}
 ]}
```

Tahapan tersebut dijalankan berulang dalam 27 fase (riwayat lengkap di Lampiran C):

1. **Fondasi dan keamanan (fase 1–2):** infrastruktur kontainer, autentikasi token, peran, HTTPS.
2. **Inti akademik (fase 3–10):** master data dan kurikulum, penilaian per indikator, jurnal, jadwal, presensi, rapor, remedial, analitik, tata kelola, portal orang tua.
3. **Kesiapan produksi dan uji lapangan (fase 11–15):** mode produksi, cadangan, batas laju, uji coba pengguna, panduan, tampilan, offline.
4. **Perluasan pembelajaran (fase 16–24):** bank soal dan tes online, perangkat ajar AI, video belajar, kalender, Android, notebook AI, CBT.
5. **Administrasi dan penyempurnaan (fase 26–27):** SPMB, keuangan, surat, inventaris, serta perbaikan dari pemakaian nyata seperti pergantian semester, kenaikan kelas, e-portofolio, dan rapor terverifikasi.

## 1.7 Sistematika Dokumen

| Bab | Isi |
|---|---|
| I Pendahuluan | Latar belakang, rumusan masalah, tujuan, batasan, dan metodologi. |
| II Landasan Konseptual | Kurikulum Merdeka, asesmen, model STNKM, offline-first, AI dalam pendidikan, keamanan data. |
| III Analisis Sistem | Aktor, kebutuhan fungsional dan nonfungsional, diagram konteks, diagram use case, skenario use case. |
| IV Perancangan Sistem | Arsitektur, deployment, model data (ERD), diagram urutan, diagram aktivitas, diagram status. |
| V Implementasi | Teknologi, struktur kode, modul, keamanan, offline, integrasi AI, statistik sistem. |
| VI Pengujian dan Evaluasi | Strategi pengujian, tes otomatis, uji coba lapangan, evaluasi kebutuhan. |
| VII Penutup | Kesimpulan, keterbatasan, dan saran pengembangan. |
| Lampiran | Daftar endpoint API, daftar tabel, riwayat fase, glosarium (sebagian dihitung otomatis). |

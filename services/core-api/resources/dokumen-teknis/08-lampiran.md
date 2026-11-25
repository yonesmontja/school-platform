# Lampiran

## Lampiran A. Daftar Endpoint API

Daftar berikut dibaca langsung dari router aplikasi saat dokumen dibuka, sama dengan halaman Dokumentasi API. Kolom akses menunjukkan peran yang diizinkan berdasarkan middleware.

{{daftar_endpoint}}

## Lampiran B. Daftar Tabel Basis Data

Dihitung langsung dari skema PostgreSQL yang sedang berjalan.

{{daftar_tabel}}

## Lampiran C. Riwayat Fase Pengembangan

| Fase | Nama | Isi utama | Status |
|---|---|---|---|
| 1 | Fondasi | Docker (PostgreSQL 16, Redis 7, Laravel 13, Next.js 16), Cloudflare Tunnel | Selesai (3 Nov 2026) |
| 2 | Akses & keamanan dasar | Login Sanctum, peran, batas percobaan login, HTTPS, IP asli klien | Selesai |
| 3 | Master data & kurikulum | Master data, elemen CP, materi = TP, indikator (IKTP), jenis asesmen | Selesai |
| 4 | Penilaian | Input nilai per indikator, Import Excel, mesin STNKM, pita KKTP, guru penilai tercatat | Selesai |
| 5 | Jurnal, jadwal, presensi | Jurnal anekdotal dengan mode AI + heuristik, kalender jadwal, presensi harian | Selesai |
| 6 | Rapor & kokurikuler | Rapor bertanda tangan, deskripsi dari indikator, catatan wali AI, kokurikuler 8 dimensi, ekspor e-Rapor | Selesai |
| 7 | Remedial & tindak lanjut | Remedial per indikator, batas nilai KKM, kabar WA orang tua, panel efektivitas | Selesai |
| 8 | Analitik | Laporan STNKM, indikator perlu perhatian, tren | Selesai |
| 9 | Tata kelola | Log aktivitas, pusat notifikasi, PWA, backup harian | Selesai |
| 10 | Layanan lanjutan | Portal orang tua, asesmen diagnostik kognitif & nonkognitif | Selesai |
| 11 | Siap produksi | Mode produksi, backup di luar laptop, retensi log, batas laju, pemantau uptime | Selesai |
| 12 | Uji coba & panduan | Uji lapangan 17/21 mandiri, panduan per peran dengan tangkapan layar | Selesai |
| 13 | Keputusan terbuka | Pemilihan guru jurnal, verifikasi BSKAP 058, keputusan ai-engine, kewajiban e-Rapor | Selesai |
| 14 | Tampilan | Lapisan tema Tabler, mode gelap, warna aksen | Selesai |
| 15 | Jangka panjang | Offline, tes web, dokumentasi API; ekspor e-Rapor resmi menunggu; multi-sekolah ditunda | Sebagian |
| 16 | Asesmen & Bank Soal | Bank soal per TP & STNKM, paket soal, koreksi foto, tes online, penilaian uraian AI, analisis butir | Selesai |
| 17 | Perangkat ajar | CP, ATP, modul ajar RPM berbantuan AI, persetujuan kepala sekolah, tautan ke jadwal & jurnal | Selesai |
| 18 | Pemakaian aplikasi | Dasbor adopsi fitur dan hambatan teknis | Selesai |
| 19 | Video belajar & Studio | Video motion graphic, narasi suara, Studio Rakit Video, impor Canva | Selesai |
| 20 | API Render | Scene JSON → MP4 untuk aplikasi luar, peta Natural Earth | Berjalan |
| 21 | Kalender sekolah | Libur nasional dan sekolah menolak tanggal libur | Selesai |
| 22 | Aplikasi Android | Trusted Web Activity, APK unduhan langsung | Selesai |
| 23 | Notebook AI Pustaka | Riset per dokumen dan notebook multi-dokumen dengan kutipan | Selesai |
| 24 | CBT & variasi soal | Sesi ujian, token, pengawas, stimulus AKM, varian soal AI | Selesai |
| 25 | Integrasi tes pihak ketiga | QTI, webhook, LTI 1.3 | Belum mulai |
| 26 | Administrasi sekolah | Operator, SPMB, keuangan, surat & arsip ber-QR, inventaris | Selesai (pembayaran daring belum) |
| 27 | Penyempurnaan dari pemakaian | Prota/Promes, Peta Tema, pembinaan presensi, peta kerja, peringatan dini, Ctrl+K, kartu QR, pesan orang tua, pergantian semester & kenaikan, analitik lintas semester, rapor terverifikasi, e-portofolio, offline tahap 2, pindah lembar nilai, Laporan STNKM bersumber ganda, kirim akses WhatsApp | Selesai |

## Lampiran D. Glosarium

| Istilah | Arti |
|---|---|
| ATP | Alur Tujuan Pembelajaran: urutan TP dalam satu fase/semester |
| Audit trail | Catatan tindakan pengguna dan perubahan data yang tidak dapat diubah |
| CBT | *Computer Based Test*: ujian berbasis komputer/HP dengan sesi, token, dan pengawas |
| CP | Capaian Pembelajaran per mata pelajaran, fase, dan elemen |
| Diagram use case | Gambar yang menunjukkan siapa (aktor) memakai fungsi apa dari sistem |
| Diagram urutan | Gambar urutan pesan antarbagian sistem dalam satu proses |
| ERD | *Entity Relationship Diagram*: gambar tabel data dan hubungannya |
| Fase A/B/C | Pembagian jenjang SD: kelas 1–2, 3–4, 5–6 |
| IKTP | Indikator Ketercapaian Tujuan Pembelajaran |
| KKM | Kriteria Ketuntasan Minimal per mata pelajaran |
| KKTP | Kriteria Ketercapaian Tujuan Pembelajaran; di SAPrapor pita predikat Cukup/Baik/Sangat Baik |
| Middleware | Lapisan pemeriksa di server yang dijalankan sebelum permintaan diproses (login, peran, batas laju) |
| Offline-first | Data disimpan dulu di perangkat lalu disinkronkan saat koneksi tersedia |
| PWA | *Progressive Web App*: situs yang dapat dipasang seperti aplikasi |
| RPM | Perencanaan Pembelajaran Mendalam, format modul ajar 2025 |
| Sanctum | Mekanisme token login Laravel |
| STNKM | Skill, Teori, Nalar, Karakter, Minat: lima dimensi perkembangan siswa |
| TP | Tujuan Pembelajaran; di SAPrapor disimpan sebagai Materi |
| TTE | Tanda tangan elektronik |
| TWA | *Trusted Web Activity*: aplikasi Android yang membuka situs web layar penuh |

## Lampiran E. Cara Memperbarui Dokumen Ini

Dokumen ini adalah **dokumen hidup**. Isinya berasal dari berkas Markdown di `services/core-api/resources/dokumen-teknis/` di repositori, sehingga setiap kali repositori diperbarui di server, halaman ini ikut berubah.

| Bagian | Sumber | Cara memperbarui |
|---|---|---|
| Teks bab | Berkas `NN-nama.md` (diurutkan menurut nomor) | Sunting Markdown; baris pertama `# Judul Bab` menjadi judul bab |
| Sampul | `meta.json` | Ubah judul, subjudul, penyusun, kota, tahun, versi |
| Diagram | Blok kode berlabel `diagram` berisi JSON (jenis `usecase`, `urutan`, atau `alir`) | Ubah teks atau posisi simpul; diagram digambar ulang otomatis |
| Statistik, endpoint, tabel, tes | Penanda `\{{statistik}}`, `\{{ringkasan_endpoint}}`, `\{{daftar_endpoint}}`, `\{{daftar_tabel}}`, `\{{daftar_tes}}`, `\{{diperbarui}}` | Tidak perlu disunting; dihitung dari sistem yang berjalan (disegarkan tiap 10 menit) |

Contoh blok diagram alir sederhana:

```json
{"jenis":"alir","nomor":"9.1","judul":"Contoh",
 "simpul":[{"id":"a","teks":"Mulai","x":0,"y":0},{"id":"b","teks":"Selesai","x":1,"y":0}],
 "panah":[{"dari":"a","ke":"b","teks":"lanjut"}]}
```

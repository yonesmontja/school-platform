# Bab V Implementasi

## 5.1 Lingkungan dan Teknologi

| Lapisan | Teknologi | Alasan pemilihan |
|---|---|---|
| Antarmuka | Next.js 16, React 18, AdminLTE 4 / Bootstrap 5 dengan lapisan tema Tabler, Bootstrap Icons | Satu basis kode untuk browser, PWA, dan Android; komponen dasbor matang; rendering cepat |
| Visualisasi & dokumen | Chart.js 4, FullCalendar 6, Tabulator, jsPDF + AutoTable, SheetJS, qrcode | Grafik, kalender jadwal, tabel besar, ekspor PDF/Excel, QR dokumen resmi di sisi klien |
| Media | Remotion 4, Revideo 0.11, Piper TTS, MediaPipe | Video belajar dari templat kode, suara bahasa Indonesia lokal, penggantian latar pas foto di perangkat |
| API | Laravel 13 (PHP 8.3), Laravel Sanctum | Ekosistem matang, ORM Eloquent, validasi, antrean, penjadwal, uji fitur terintegrasi |
| Data | PostgreSQL 16, Redis 7 | Integritas relasional, *full-text search* untuk Pustaka Dokumen, cache dan batas laju |
| Infrastruktur | Docker Compose, Cloudflare named tunnel | Lingkungan seragam di satu komputer sekolah; akses publik HTTPS tanpa IP publik |
| Pengujian | PHPUnit (fitur, PostgreSQL), Playwright | Uji aturan bisnis dan hak akses di basis data nyata; uji alur pengguna di browser |
| AI | Gemini, Claude, Qwen, DeepSeek, OpenKey/OpenRouter, Azure Speech, ElevenLabs | Banyak pilihan penyedia agar sekolah tidak terkunci satu vendor dan tetap berjalan saat satu gagal |

## 5.2 Struktur Kode

```
school-platform/
├── apps/
│   ├── web/                 Next.js: app/dashboard/** (halaman per menu), components/**, public/sw.js
│   └── android/             Pembuat APK Trusted Web Activity
├── services/
│   ├── core-api/            Laravel: app/Http/Controllers/Api, app/Services, app/Models,
│   │                        database/migrations, routes/api.php, tests/Feature,
│   │                        resources/dokumen-teknis (dokumen ini)
│   ├── video-render/        Worker Remotion + Revideo
│   └── ai-engine/           Django (cadangan untuk layanan AI berikutnya)
├── infra/                   docker-compose.yml, terbitkan.sh, backup/, gladi-tutup-semester.sh
├── tests/web/               Tes Playwright end-to-end
└── docs/                    Panduan pengembang API Render
```

Pola yang dipakai konsisten di backend: **rute** dikelompokkan per peran di `routes/api.php`; **controller** memvalidasi masukan dan memeriksa kepemilikan data; **service** memegang perhitungan yang dipakai lintas fitur; **model** Eloquent memakai *trait* audit sehingga setiap perubahan tercatat otomatis.

## 5.3 Implementasi Mekanisme Inti

### 5.3.1 Perhitungan STNKM

Saat nilai disimpan dengan metode otomatis, poin tiap dimensi dihitung di server:

> poin<sub>d</sub> = nilai × bobot<sub>d</sub>(jenis penilaian) × bobot<sub>d</sub>(materi), untuk d ∈ {S, T, N, K, M}

Bobot jenis penilaian diatur di master MBK, sedangkan bobot materi diatur per TP (dapat diusulkan AI di Asisten Materi). Guru dapat beralih ke metode manual untuk mengisi S–M sendiri; nilai manual tidak ditimpa saat perhitungan ulang. Pada jurnal, narasi dikirim ke penyedia AI dengan instruksi keluaran JSON `{"S":…, "T":…, "N":…, "K":…, "M":…}` berskala −5..+5; narasi diperlakukan sebagai data sehingga instruksi di dalamnya diabaikan. Bila semua penyedia gagal, kamus perilaku lokal (misalnya *jujur* → K +4, *gotong royong* → K +3,5 dan M +1) dipakai sebagai cadangan.

### 5.3.2 Riwayat rombel dan kunci semester

Rapor, portal, laporan STNKM, dan lembar nilai semester lama membaca anggota rombel dari `siswa_rombel` dan wali dari `wali_kelas_periode`, sedangkan semester aktif membaca data terkini. Periode yang `terkunci` menolak penulisan nilai, presensi, jurnal, catatan wali, P5, pembinaan, diagnostik, dan kenaikan; hanya admin yang tetap dapat memperbaiki atau membuka kunci. Wizard Tutup Semester menyalin status rombel, pengampu, dan pola jadwal ke semester berikutnya dan, pada pergantian tahun ajaran, menerapkan keputusan kenaikan. Gladi dapat dijalankan pada salinan data asli (`semester:gladi`, basis data berakhiran `_gladi`) tanpa menyentuh data utama.

### 5.3.3 Notifikasi yang dihitung dari data

Pusat notifikasi tidak menyimpan daftar tugas. Setiap kali dibuka, `NotifikasiService` menghitung kondisi per peran: nilai di bawah KKM tanpa rencana tindak lanjut, remedial lewat tanggal, sesi hari ini, presensi belum diisi, pengajuan menunggu persetujuan, pesan orang tua, siswa berisiko tinggi, dan lain-lain. Yang disimpan hanya status *dibaca* per pengguna beserta kunci isinya, sehingga notifikasi yang isinya berubah muncul lagi sebagai baru, dan notifikasi hilang sendiri setelah pekerjaannya selesai. "Hari ini" mengikuti zona waktu sekolah (WIT).

### 5.3.4 Jejak audit

Setiap model memakai pendengar peristiwa yang mencatat tambah/ubah/hapus beserta nilai sebelum dan sesudah ke `log_perubahan`, dikaitkan dengan entri `log_aktivitas` yang memuat pengguna, peran, rute, status HTTP, durasi, dan IP asli di balik proxy tepercaya. *Middleware* mencatat permintaan yang ditolak, dan peramban mengirim peristiwa keluaran (unduh, cetak, salin, buka WhatsApp). Kata sandi, token, kunci API, tanda tangan, dan isi base64 disensor. Log bersifat hanya-tambah; entri lebih tua dari 12 bulan dipindah tiap malam ke arsip terkompresi yang ikut dicadangkan.

### 5.3.5 Offline-first

`antrean.js` menyimpan kiriman di IndexedDB per akun, `siapOffline.js` menyiapkan halaman dan data kelas sekali sehari, dan service worker (hanya di build produksi) melayani salinan terakhir saat jaringan gagal. Kiriman nilai membawa waktu lembar dibuka; server membalas 409 bila data sudah berubah, dan antarmuka menampilkan dua versi untuk dipilih. Salinan data di perangkat dihapus saat pengguna keluar.

### 5.3.6 Integrasi AI

Semua pemanggilan AI melewati service di server (misalnya `SoalAIService`, `PerangkatAjarAIService`, `JurnalAIService`, `AnalitikLintasSemester`). Kunci API dibaca dari pengaturan sekolah yang terenkripsi. Prompt dibangun dari data agregat (sebaran gaya belajar, rata-rata nilai TP, jumlah siswa remedial), contoh soal yang sudah teruji, dan potongan Pustaka Dokumen yang relevan. Keluaran divalidasi struktur JSON-nya; SVG dan HTML dibersihkan dengan daftar putih sebelum disimpan. Layar dikunci sementara selama permintaan AI berjalan agar tidak terkirim dua kali, dan rute AI memiliki batas laju tersendiri.

### 5.3.7 Dokumen resmi dan verifikasi publik

Rapor resmi, surat keluar, dan kartu pelajar memiliki kode verifikasi yang dicetak sebagai QR. Kode kartu pelajar diturunkan dengan HMAC sehingga tidak memerlukan kolom baru; rapor resmi menyimpan cuplikan nilai dan sidik isi sehingga perubahan setelah terbit terdeteksi. Halaman verifikasi publik hanya menampilkan data yang diperlukan untuk mencocokkan dokumen.

### 5.3.8 Keamanan akses

| Lapisan | Implementasi |
|---|---|
| Jaringan | Port Docker hanya `127.0.0.1`; akses publik lewat tunnel HTTPS; HTTP dialihkan ke HTTPS; HSTS, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, CSP `frame-ancestors` |
| Autentikasi | Token Sanctum berumur 7 hari; akun nonaktif ditolak; sandi bawaan wajib diganti; batas percobaan 5/menit per akun+IP dan 20/15 menit per akun; WA ke admin bila 10 kali gagal |
| Otorisasi | Middleware peran per kelompok rute; pembatasan data per mapel/rombel guru di controller; peninjau ditolak menulis; operator per submodul (`administrasi:KODE`) |
| Batas laju | 300 permintaan/menit per akun; lebih ketat untuk login, ganti sandi, AI, dan unggahan |
| Data | Kunci API terenkripsi; berkas privat lewat tautan bertanda tangan; jurnal sensitif disamarkan; unggahan divalidasi isi (gambar sungguhan, SVG/Lottie dibersihkan) |
| Pengiriman akses | Pesan akses WhatsApp hanya pada jam efektif Senin–Jumat 07:30–12:00 WIT; kata sandi dicocokkan dan tidak pernah disimpan di riwayat maupun log |

### 5.3.9 Alur rilis

Perubahan dikerjakan di jalur kerja (`web-dev`), lalu diterbitkan dengan `infra/terbitkan.sh`. Situs publik hanya diganti bila seluruh tes lulus.

```diagram
{"jenis":"alir","nomor":"5.1","judul":"Alur rilis terbitkan.sh: situs publik hanya diganti bila semua tes lulus",
 "kolom_lebar":170,"baris_tinggi":92,
 "simpul":[
  {"id":"m","bentuk":"mulai","x":0,"y":0.5},
  {"id":"a","teks":"Tes backend","sub":"PHPUnit di DB _test (paralel dengan build)","x":1,"y":0},
  {"id":"b","teks":"Build web produksi","sub":"image baru, belum dipasang","x":1,"y":1},
  {"id":"c","teks":"Siapkan API e2e","sub":"DB _e2e diisi sekolah fiktif","x":2,"y":0.5},
  {"id":"d","teks":"Tes end-to-end","sub":"Playwright pada image baru :3002","x":3,"y":0.5},
  {"id":"q","teks":"Semua lulus?","x":4,"y":0.5,"bentuk":"keputusan","w":110,"h":60},
  {"id":"e","teks":"Ganti situs publik","sub":"muat ulang API & scheduler","x":5,"y":0,"gaya":"aksen"},
  {"id":"f","teks":"Batalkan","sub":"situs lama tetap jalan","x":5,"y":1,"gaya":"lemah"}
 ],
 "panah":[
  {"dari":"m","ke":"a"},{"dari":"m","ke":"b"},{"dari":"a","ke":"c"},{"dari":"b","ke":"c"},
  {"dari":"c","ke":"d"},{"dari":"d","ke":"q"},{"dari":"q","ke":"e","teks":"ya"},{"dari":"q","ke":"f","teks":"tidak"}
 ]}
```

Migrasi basis data dijalankan terpisah dan selalu didahului pencadangan yang dumpnya diperiksa dapat dibaca (`pg_restore -l`); pencadangan dan migrasi tidak pernah dirangkai dalam satu perintah.

## 5.4 Peta Modul

| Kelompok menu | Halaman utama | Komponen backend utama |
|---|---|---|
| Perencanaan Ajar | Perangkat Ajar (CP, ATP, modul), Prota & Promes, Peta Tema, Pustaka Dokumen, Referensi Penilaian | `PerangkatAjarController`, `ModulAjarController`, `PerangkatAjarAIService`, Pustaka & Notebook |
| Kegiatan Harian | Hari Ini, Jadwal, Input Nilai, Import Excel, Jurnal, Presensi | `NilaiController`, `JurnalAIService`, `RemedialService`, `JadwalController` |
| Asesmen | Bank Soal, Paket Soal, Tes Online, Sesi Ujian CBT, Diagnostik, Portofolio | `BankSoalService`, `SoalAIService`, `PaketSoalService`, `UjianService`, `StatistikSoalService` |
| Rapor & Kelas | Rapor, Catatan Wali, Proyek (kokurikuler), Kenaikan, Rekam Jejak, Pesan Orang Tua | Rapor resmi, `RiwayatRombel`, kenaikan, pesan |
| Laporan | Laporan STNKM, Dasbor, Analitik Lintas Semester, Peringatan Dini, Pantauan Kenaikan, Pemakaian | `LaporanController`, `AnalitikLintasSemester`, `PeringatanDiniService`, `PantauanKenaikan` |
| Media Belajar | Video Belajar, Studio Rakit Video, API Render | `NaskahVideo`, worker `video-render`, `AdeganApi`, `RuteLaut` |
| Administrasi Sekolah | SPMB, Keuangan, Surat & Arsip, Inventaris, Operator | Controller administrasi dengan middleware `administrasi:KODE` |
| Akun & Sistem | Akun Saya, Manajemen Pengguna, Pengaturan, Semester, Tutup Semester, Log Aktivitas, Panduan, Dokumentasi API, Dokumen Teknis | `KirimAksesController`, `AuditTrail`, `DokumentasiApiController`, `DokumenTeknisController` |
| Portal | Portal siswa/orang tua (ringkasan, capaian, tindak lanjut, jadwal, rapor, pesan, portofolio, tagihan, video) | Kontroler portal dengan pembatasan per anak |

## 5.5 Statistik Sistem

Tabel berikut dihitung otomatis setiap kali dokumen ini dibuka, langsung dari kode dan basis data yang sedang berjalan.

{{statistik}}

Ringkasan endpoint API per kelompok (rincian lengkap pada Lampiran A):

{{ringkasan_endpoint}}

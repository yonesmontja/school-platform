# School Platform

Platform manajemen sekolah berbasis monorepo: data master (siswa, guru, kelas, mata pelajaran, periode, kategori penilaian, MBK, materi), jadwal pembelajaran, input nilai dengan remedial, jurnal anekdotal dengan analisis STNKM berbasis AI, presensi, kegiatan kokurikuler (menu Proyek), cetak rapor, laporan STNKM, pengiriman WhatsApp, pengaturan sekolah, manajemen pengguna berbasis peran, portal siswa/orang tua, serta ekspor laporan ke PDF/Excel.

## Arsitektur

```
school-platform/
├── apps/
│   └── web/            # Frontend — Next.js 16 + React 18 + AdminLTE/Bootstrap 5
├── services/
│   ├── core-api/       # Backend utama — Laravel 13 (PHP 8.3) + Sanctum
│   └── ai-engine/      # Layanan AI — Django 5 + DRF (masih tahap awal)
├── infra/
│   └── docker-compose.yml
└── docs/
```

| Layanan     | Teknologi                         | Port  |
|-------------|-----------------------------------|-------|
| `web`       | Next.js, build produksi (situs publik) | 3000  |
| `web-dev`   | Next.js mode dev untuk mengedit (profil `dev`) | 3001 |
| `scheduler` | Tugas terjadwal Laravel (arsip log, token kedaluwarsa) | –  |
| `db-backup` | Backup harian database + file unggahan | –  |
| `core-api`  | Laravel + Sanctum (token auth)    | 8000  |
| `ai-engine` | Django + Django REST Framework    | 8001  |
| `db`        | PostgreSQL 16                     | 5432  |
| `redis`     | Redis 7                           | 6379  |
| `cloudflared` | Cloudflare named tunnel ke `web` (domain publik `web.saprapor.com`; token di `infra/.env`) | –  |

## Fitur

- **Autentikasi & Peran** — login/logout dengan token Laravel Sanctum (login dibatasi throttle), ganti password di halaman Akun Saya, akun nonaktif ditolak. Lima peran: `admin`, `kepsek`, `guru` (staf) serta `siswa`, `ortu` (portal baca). Guru dibatasi ke mapel yang diampu, kelas binaan, dan data miliknya
- **Manajemen Pengguna** — admin membuat/mengubah/menghapus akun, membuat akun massal (generate), dan reset password
- **Portal Siswa & Orang Tua** — siswa dan orang tua melihat data anak miliknya (read-only): ringkasan dengan kotak **Perlu didampingi** (tindak lanjut terjadwal, mapel di bawah KKM, TP belum dikuasai, alpa) dan grafik perkembangan nilai; **Capaian TP** per mapel → materi → indikator dengan tingkat KKTP, tanda tuntas, dan kalimat deskripsi seperti di rapor; **Tindak Lanjut** (remedial: jadwal, jam, ruang, catatan guru, nilai awal → remedial, serta tips mendampingi di rumah per bentuk tindak lanjut); **Jadwal** kelas 7 hari ke depan (sesi remedial siswa lain tidak ditampilkan); kalender kehadiran per bulan; catatan positif (narasi jurnal negatif tidak ditampilkan); dan pratinjau/cetak rapor
- **Jadwal Pembelajaran** — kalender (FullCalendar) dengan geser-jadwal (drag), ubah status, dan master ruangan (kelola oleh admin/kepsek)
- **Master Siswa** — CRUD siswa beserta data referensi (agama, suku, pekerjaan, wilayah, orang tua/wali, sekolah asal)
- **Orang Tua & Wali** — data ayah/ibu atau wali (nama, pekerjaan, nomor WhatsApp, alamat) beserta anak yang terhubung; satu data bisa untuk kakak-adik. Dipakai untuk akun portal orang tua dan nomor kabar WhatsApp. Halaman ini bergaya Tabler (kartu ringkas, tab, formulir dengan pencarian anak, toast, mode gelap) lewat CSS yang dibatasi ke halaman itu ([tabler.css](apps/web/app/dashboard/master-keluarga/tabler.css)); ekspor XLSX/CSV/PDF sama seperti halaman master lain. Admin mengubah, kepsek melihat
- **Master Guru, Kelas, Mata Pelajaran** — CRUD; mata pelajaran memiliki KKM per mapel
- **Referensi Penilaian (selaras kurikulum nasional)** — Semester; High Level = Elemen CP, bisa khusus satu mapel atau semua mapel; Aktivitas dengan jenis asesmen (diagnostik/formatif/sumatif); Materi memuat Tujuan Pembelajaran (TP) dan banyak Indikator Ketercapaian TP (IKTP) yang bisa diurutkan dan dinonaktifkan. Indikator dan aktivitas ditambah admin atau guru (guru hanya mapel yang diampu), kepsek melihat saja; indikator dihapus admin dan hanya bila belum pernah dipakai menilai
- **Input Nilai** — filter per periode/kelas/mapel/materi, simpan nilai secara batch (nilai bertanggal), dilengkapi analitik kelas dan riwayat nilai; mode remedial dengan rencana tindak lanjut per siswa; **penilaian per indikator**: satu sesi memilih satu atau lebih indikator (IKTP) materi, termasuk menambah indikator baru di tempat, lalu nilai 0–100 diisi per indikator dan nilai materi = rata-rata indikator yang terisi (mengalir ke STNKM, KKM, dan remedial seperti biasa); predikat capaian mengikuti **KKTP** sekolah (batas Cukup/Baik/Sangat Baik diatur di Pengaturan Sekolah, bawaan 70/80/90; tuntas tetap KKM mapel); remedial per indikator: hanya indikator di bawah KKM yang diulang, nilai remedial = rata-rata indikator setelah perbaikan; setiap nilai mencatat **guru penilai** (ID Master Guru: guru pemilik akun, atau guru pengampu mapel bila diisi admin/kepsek) dan **akun pengisinya** secara terpisah; **siklus remedial**: kebijakan nilai remedial di rapor diatur di Pengaturan Sekolah (bawaan dibatasi setinggi KKM mapel, atau apa adanya; nilai asli tetap tersimpan dan status tuntas mengikuti nilai sebenarnya), dan orang tua/wali bisa dikabari lewat WhatsApp saat rencana tindak lanjut dibuat maupun saat hasil remedial dicatat (otomatis via Fonnte bila aktif, selain itu tombol chat WA per siswa)
- **Bank Soal & Kisi-kisi (Fase 16 Tahap A)** — soal berlabel TP/indikator, bobot dimensi STNKM (0–1, bawaan dari bobot materi), level kognitif C1–C6, tingkat kesulitan, dan bentuk: pilihan ganda, pilihan ganda kompleks, benar/salah, isian, uraian (dengan rubrik), menjodohkan, mengurutkan. **Kisi-kisi** per TP (bentuk, level, kesulitan, dimensi STNKM yang ditonjolkan, jumlah) dengan sebaran level & STNKM dan unduhan PDF. **AI** (penyedia yang sama dengan jurnal & rapor: Gemini, Claude, Qwen, DeepSeek, OpenKey) membuat draf soal per baris kisi-kisi atau per TP — kunci, pengecoh, rubrik, dan diagram SVG bila diminta (dibersihkan di server dan ditampilkan sebagai gambar) — serta memecah paket soal lama (tempel teks, Word, PDF/foto lewat Gemini/Claude) menjadi draf yang dipasangkan ke TP. AI diberi contoh soal sekolah yang sudah disetujui untuk TP yang sama. Semua soal melalui alur **Draf → Diajukan → Disetujui / Perlu revisi** oleh kepala sekolah (dengan catatan), mengubah soal yang disetujui membuatnya kembali draf (versi naik), dan pengajuan/revisi muncul di Perlu Tindakan. Guru menyusun soal untuk mapel yang diampu dan melihat soalnya sendiri serta soal yang disetujui untuk mapelnya
- **Paket Soal (Fase 16 Tahap B)** — naskah ujian dari soal yang sudah disetujui (bisa diisi otomatis dari kisi-kisi), dengan urutan & skor per butir; butir menyimpan salinan soal sehingga naskah yang sudah dicetak tidak berubah. **Cetak** naskah siswa, lembar jawaban, serta kunci & rubrik (dialog cetak browser / Simpan sebagai PDF). **Koreksi cepat** per siswa: jawaban diketik (A / AC / BSB / teks) dan dinilai otomatis untuk pilihan ganda, PG kompleks (nilai sebagian), benar/salah, dan isian; uraian, menjodohkan, dan mengurutkan diberi skor guru; foto/PDF lembar jawaban dapat diunggah dan **dibaca AI** (Gemini/Claude) sebagai usulan jawaban. **Kirim ke Input Nilai** per materi dan per TP lewat aturan simpan Input Nilai yang sama (STNKM otomatis, deteksi tindak lanjut di bawah KKM; mengirim ulang memperbarui). **Analisis butir**: tingkat kesukaran, daya beda (27% atas/bawah), sebaran pilihan & pengecoh lemah, reliabilitas Cronbach alpha, capaian per TP, profil STNKM kelas & siswa, unduh PDF
- **Video motion graphic oleh guru & suara narasi (Fase 19 Tahap B–C)** — Video Belajar → Buat video motion graphic: 4 templat Remotion bersama (Kartu Gambar & Suku Kata, Berhitung, Urutan & Siklus, Pecahan; sumber `apps/web/components/video/templat`) dengan contoh bertema Papua, isian per adegan + narasi, pratinjau langsung (`@remotion/player`), lalu antrean render di layanan Docker `video-render` (Remotion + Chrome headless + font emoji) yang membuat narasi suara, MP4, dan sampul ke storage; durasi adegan mengikuti panjang narasi. Suara: **Piper lokal** (bahasa Indonesia `id_ID-news_tts-medium`, gratis, offline), **ElevenLabs** (suara netral & klon suara guru) dan **Gemini TTS**, keduanya lewat core-api agar API key tetap terenkripsi di Pengaturan; status render, render ulang, dan pengingat render gagal di Perlu Tindakan
- **Video Belajar (Fase 19 Tahap A)** — pustaka video motion graphic/unggahan (MP4/WebM maks. 20MB; durasi & sampul dibaca di browser) dengan persetujuan kepala sekolah; satu video ditautkan ke mana saja: modul ajar per pertemuan, sesi jadwal (juga lewat rencana pertemuan modul), stimulus soal (ikut salinan paket & tes online), dan Portal Siswa/orang tua (hanya video disetujui untuk kelas/fase anak, bisa diunduh untuk ditonton tanpa sinyal); video dibuat dengan Remotion di folder `remotion-video` (Studio `npm run studio` di :3003)
- **Pemakaian Aplikasi (Fase 18)** — dasbor Laporan → Pemakaian Aplikasi untuk admin & kepala sekolah selama masa pakai nyata: adopsi tiap fitur inti oleh guru, matriks guru × fitur (dibuka vs pekerjaan disimpan) beserta hari aktif dan guru yang belum aktif, pengguna aktif per hari per peran, jejak kerja nyata (nilai, jurnal, hari presensi, sesi selesai, modul & soal disetujui, tes online, remedial), hambatan (permintaan gagal, rute paling lambat tanpa rute AI), dan pemakaian portal siswa/orang tua; rentang 7/30/90 hari
- **Dokumentasi API** — halaman Akun & Sistem → Dokumentasi API (admin): seluruh endpoint dibaca langsung dari router (selalu sesuai versi terpasang) dengan metode, jalur, kelompok, peran yang boleh mengakses (dari middleware), batas laju, aksi controller, keterangan (komentar kode → tabel endpoint README lewat `infra/perbarui-dokumentasi-api.py` → nama aksi), dan contoh curl; unduh spesifikasi OpenAPI 3 untuk Postman/Insomnia/Swagger
- **Modul ajar di Jadwal & Jurnal (Fase 17 Tahap C)** — sesi jadwal menautkan modul ajar dan pertemuan ke-berapa (jadwal berulang otomatis naik per sesi sampai jumlah pertemuan modul; mengubah rangkaian tidak menyamakan nomor pertemuan); detail sesi menampilkan tujuan dan langkah pertemuan; formulir jurnal menampilkan rencana pembelajaran hari itu untuk kelas terpilih (rujukan saja, AI jurnal tidak berubah) dengan tombol pakai materi; modul menampilkan sesi terjadwal per pertemuan dan kemajuan pertemuan yang selesai
- **Modul Ajar RPM (Fase 17 Tahap B)** — modul ajar format Perencanaan Pembelajaran Mendalam dibuat dari ATP yang disetujui (atau dari materi & TP langsung): identifikasi (peserta didik, materi, dimensi profil lulusan), desain pembelajaran, pengalaman belajar per pertemuan (awal, memahami, mengaplikasi, merefleksi, penutup), asesmen awal/proses/akhir dengan tautan paket soal, diferensiasi, dan LKPD; AI menyusun draf dari CP, TP, dan ringkasan data kelas tanpa nama siswa (sebaran gaya belajar & minat dari asesmen diagnostik, rata-rata nilai TP terkait, siswa yang sedang remedial); persetujuan kepala sekolah seperti ATP; cetak PDF dan unduh Word
- **Perangkat Ajar (Fase 17 Tahap A)** — menu Perangkat Ajar: **Capaian Pembelajaran** per mapel, fase (A/B/C dari nama kelas), dan elemen (ketik sendiri atau tempel dokumen CP resmi lalu dipecah AI per elemen tanpa diubah); **ATP** per mapel, kelas, dan periode disusun bersama AI dari CP, materi & TP sekolah, dan capaian siswa per TP (TP lama dipakai ulang, TP/materi baru ditandai usulan), lengkap dengan alokasi JP & minggu, dimensi STNKM, dan dimensi Profil Lulusan; diajukan ke kepala sekolah (Perlu Tindakan, catatan revisi, versi), dan saat disetujui TP/materi usulan masuk ke Referensi Penilaian; cetak ATP A4 lanskap bertanda tangan
- **AI Asesmen (Fase 16 Tahap D)** — memakai penyedia AI yang sama dengan rapor & jurnal (dipilih guru): **gambar soal dari AI** di editor soal (ilustrasi lewat Gemini, OpenKey, atau OpenRouter dengan model gambar yang bisa diganti; diagram SVG lewat semua penyedia; pesan penolakan penyedia ditampilkan apa adanya), **penilaian uraian berbantuan AI** sesuai rubrik dari jawaban tes online, catatan guru, atau foto lembar jawaban (usulan skor + alasan + transkrip, diperiksa guru sebelum disimpan; per siswa atau sekaligus satu kelas), dan **AI belajar dari analisis butir**: p, D, dan saran tiap butir tersimpan saat analisis dibuka atau nilai dikirim, bank soal menandai soal Teruji baik/Perlu ditinjau, dan draf AI diberi contoh soal yang teruji baik, catatan soal bermasalah, serta capaian siswa pada TP itu
- **Tes Online (Fase 16 Tahap C)** — paket soal dibuka sebagai tes di HP siswa (akun siswa → menu Tes Online): jadwal buka-tutup, waktu mengerjakan yang dihitung server sejak mulai, token kelas, acak urutan soal & pilihan per siswa (kolom kanan menjodohkan, langkah mengurutkan, dan bank kata selalu diacak), simpan otomatis dengan coba ulang saat sinyal putus, penanda ragu-ragu, kumpul otomatis saat waktu habis, dan pencatatan keluar dari halaman tes. Soal interaktif: menjodohkan (ketuk-pasangkan), mengurutkan, **membaca nyaring** (siswa merekam suara di HP, rekaman diputar guru saat koreksi dan dinilai dengan rubrik; di kertas dinilai langsung), dan bentuk baru **melengkapi gambar** (gambar bernomor + jawaban per bagian, bank kata opsional; juga untuk draf AI, cetak, dan koreksi kertas) — semuanya dinilai otomatis, uraian oleh guru. Guru memantau status, jumlah terjawab, sisa waktu, dan keluar halaman per siswa, dapat mengakhiri sesi atau mengizinkan mengulang; jawaban online masuk ke koreksi, kirim nilai, dan analisis butir yang sama dengan koreksi kertas
- **Jurnal Anekdotal** — catatan kejadian siswa yang dianalisis ke dimensi STNKM (nilai S, T, N, K, M); mode analisis: Heuristik (tanpa AI), Gemini, Qwen, Claude, DeepSeek, dan OpenKey. Jika AI gagal, otomatis fallback ke Heuristik. Dilengkapi tabel analitik, pencarian, ekspor Excel, dan edit jurnal. Guru jurnal: akun guru = dirinya sendiri; bila diisi admin/kepsek = guru yang dipilih di form, atau guru pengampu mapel materinya, atau wali kelas (jurnal observasi tanpa materi)
- **Import Excel** — impor massal nilai dan jurnal dari file Excel (template tersedia beserta lembar referensi siswa); template nilai otomatis memuat satu kolom per indikator aktif materi (judul berkode `[IND-…]`)
- **Presensi** — input kehadiran siswa per tanggal secara batch
- **Proyek (kokurikuler)** — kegiatan kokurikuler pengganti P5 (Permendikdasmen 13/2025): bentuk kegiatan (proyek lintas mapel, 7 Kebiasaan Anak Indonesia Hebat, penguatan intrakurikuler), target **8 Dimensi Profil Lulusan**, catatan proses (dapat dibuat dengan AI), dan ekstraksi predikat dari STNKM. Skala predikat diatur sekolah: 4 tingkat BB/MB/BSH/SB atau 3 tingkat e-Rapor Berkembang/Cakap/Mahir (predikat tetap tersimpan 4 tingkat). Rapor memuat deskripsi capaian dimensi otomatis; tampilan *deskripsi saja* atau *deskripsi + tabel* dipilih saat mencetak
- **Laporan STNKM** — laporan rata-rata STNKM per kelas/siswa dengan grafik tren, detail siswa, dan ekspor multi-halaman
- **Cetak Rapor** — data rapor, catatan wali kelas (dapat dibuat dengan AI), cetak, dan distribusi; deskripsi capaian mapel yang dinilai per indikator disusun dari indikatornya (penguasaan terbaik, perlu bimbingan di bawah KKM, atau perlu peningkatan)
- **WhatsApp (Fonnte)** — kirim pesan otomatis untuk rapor dan presensi lewat gateway Fonnte
- **Dashboard** — dasbor analitik bergaya SaaS dengan grafik (Chart.js) dan menu sidebar berkelompok yang dapat dilipat, dengan pencarian menu (Ctrl+K) dan mode mini; panel **Indikator Perlu Perhatian**: indikator (IKTP) diurutkan dari ketuntasan terendah, dengan rata-rata, persentase tuntas terhadap KKM, dan daftar siswa belum tuntas (nilai remedial terbaru menggantikan nilai asal); panel **Efektivitas Tindak Lanjut**: per bentuk tindak lanjut (Tes Ulang, Tutor Sebaya, dst.) jumlah yang sudah dilaksanakan, persentase siswa tuntas sesudahnya, rata-rata kenaikan nilai, serta rencana yang menunggu atau lewat tanggal
- **Tema** — gaya tampilan Tabler (bawaan) atau Klasik, mode terang/gelap/otomatis, dan pilihan warna aksen untuk seluruh aplikasi (diatur per browser di Akun Saya). Gaya Tabler adalah lapisan CSS di atas AdminLTE/Bootstrap ([tema-tabler.css](apps/web/app/tema-tabler.css)) yang aktif lewat atribut `data-gaya` pada `<html>`; kertas rapor tidak ikut berubah
- **Log Aktivitas (audit trail)** — mencatat seluruh tindakan pengguna: login/logout/login gagal, setiap tambah/ubah/hapus data beserta nilai **sebelum → sesudah** per record (otomatis dari semua model, termasuk proses sistem/migrasi), percobaan yang ditolak, serta output di browser (unduh Excel/CSV/PDF, cetak, chat WhatsApp, salin teks) dan halaman yang dibuka. Kata sandi, token, API key, dan berkas base64 disensor. Log hanya-tambah (tidak bisa diubah/dihapus); log lebih tua dari 12 bulan (`LOG_AKTIVITAS_SIMPAN_BULAN`) dipindah otomatis tiap malam ke file arsip `storage/app/arsip-log/*.jsonl.gz` yang ikut backup. Halaman bergaya AdminLTE 4: info-box statistik, tren per kategori, peta jam sibuk, pengguna & modul teraktif, linimasa (timeline) atau tabel, filter (rentang waktu, kategori, pengguna, modul, aksi, status, pencarian), drawer detail dengan diff, mode langsung (muat ulang otomatis), dan ekspor CSV. Admin & kepsek melihat semua aktivitas; guru melihat aktivitasnya sendiri (Aktivitas Saya)
- **Asesmen Diagnostik** — pemetaan awal semester untuk pembelajaran berdiferensiasi. **Kognitif**: nilai dari aktivitas berjenis Diagnostik (diisi lewat Input Nilai/Import Excel; tidak masuk rapor, laporan, dasbor, maupun remedial) dikelompokkan otomatis menurut KKTP sekolah — *perlu pendampingan intensif*, *siap dengan penguatan*, *siap/mahir* — lengkap dengan rekomendasi pembelajaran per kelompok, kemampuan terlemah tiap siswa, rata-rata kelas per indikator prasyarat, daftar yang belum mengikuti, dan unduhan Excel pengelompokan. **Non-kognitif**: gaya belajar (visual/auditori/kinestetik), minat/bakat, kesejahteraan sosial-emosional, dukungan belajar di rumah, dan catatan per siswa per semester (diisi wali kelas/pengelola; data pribadi, tidak tampil di rapor/portal), dengan profil gaya belajar kelas beserta tips mengajar dan daftar siswa yang perlu perhatian. Wali kelas diingatkan lewat Perlu Tindakan bila belum lengkap
- **Ekspor e-Rapor** — tombol **e-Rapor** di halaman Rapor mengunduh rekap satu kelas (Excel) untuk disalin ke format nilai aplikasi e-Rapor SD: lembar Petunjuk, satu lembar per mapel (NISN, nama, nilai akhir, ceklis TP — T tercapai/P perlu pendampingan — serta deskripsi capaian kompetensi tercapai & perlu pendampingan, maks. 300 karakter), Kehadiran (S/I/A), Kokurikuler, Catatan Wali, dan Referensi TP. Bukan format impor resmi (format resmi diunduh dari aplikasi e-Rapor tiap sekolah dan berubah tiap versi); kolomnya disusun agar mudah dicocokkan per NISN
- **Pusat Notifikasi (Perlu Tindakan)** — lonceng di topbar (angka merah bila ada yang mendesak) dan halaman Perlu Tindakan. Notifikasi dihitung otomatis dari data sesuai peran dan hilang sendiri setelah pekerjaannya selesai: **guru** — remedial lewat tanggal, remedial hari ini/besok, nilai di bawah KKM tanpa rencana tindak lanjut, sesi mengajar hari ini, sesi lalu yang belum ditandai Selesai/Batal, presensi kelas binaan yang belum diisi, catatan wali kelas yang belum lengkap; **admin & kepsek** — rekap yang sama untuk seluruh sekolah, kelas yang belum presensi hari ini, dan (admin) percobaan login gagal berulang; **siswa & orang tua** — jadwal & hasil remedial anak serta ketidakhadiran tanpa keterangan. Status dibaca disimpan per pengguna; notifikasi yang isinya berubah muncul lagi sebagai baru. Opsional: notifikasi di perangkat (HP/laptop) untuk hal yang mendesak. "Hari ini" mengikuti zona waktu sekolah (`ZONA_SEKOLAH`, bawaan `Asia/Jayapura`)
- **Aplikasi terpasang (PWA)** — EduRapor bisa dipasang ke layar utama HP/laptop (tombol **Pasang aplikasi** di topbar; iPhone lewat Bagikan → Tambah ke Layar Utama), terbuka layar penuh dengan ikon sendiri dan pintasan ke Perlu Tindakan, Input Nilai, Presensi, dan Jurnal. Service worker ([public/sw.js](apps/web/public/sw.js), hanya di build produksi) menyimpan aset aplikasi berhash, dan memakai jaringan dulu untuk halaman & data `/api` dengan salinan terakhir sebagai cadangan, sehingga tampilan selalu terbaru saat online dan halaman yang pernah dibuka tetap terbuka saat offline. Salinan data dihapus saat keluar
- **Mengisi saat offline** — nilai, jurnal, dan presensi yang disimpan tanpa sinyal masuk antrean IndexedDB per akun ([antrean.js](apps/web/app/lib/antrean.js)), terlihat lewat pita offline dan ikon awan di topbar, lalu terkirim otomatis saat tersambung (jurnal dianalisis STNKM saat terkirim). Kiriman yang ditolak server ditandai merah agar bisa diperiksa atau dibuang. Saat aplikasi dibuka dengan sinyal, [siapOffline.js](apps/web/app/lib/siapOffline.js) menyiapkan halaman Input Nilai, Jurnal, Presensi beserta data kelas pengguna di HP (sekali sehari per login), jadi halaman itu bisa dipakai offline walau belum pernah dibuka
- **Kembali dari WhatsApp** — bila HP menutup halaman saat WhatsApp terbuka, panel WhatsApp di Cetak Rapor, Presensi, dan Jurnal muncul lagi beserta pilihan terakhir ([pulihHalaman.js](apps/web/app/lib/pulihHalaman.js), sessionStorage per tab); hilang setelah **Selesai & Tutup**
- **Pengaturan Sekolah** — profil sekolah, tanda tangan, serta API key & model untuk provider AI serta konfigurasi WhatsApp (diisi di halaman Pengaturan, tersimpan terenkripsi)
- **Panduan** — menu Panduan (Akun & Sistem) berisi langkah singkat per peran: mulai di sini, guru, wali kelas, admin & kepala sekolah, orang tua & siswa; bisa dicari, tiap bagian menautkan ke halamannya, dan bisa dicetak. Isinya di [isiPanduan.js](apps/web/app/dashboard/panduan/isiPanduan.js); perbarui bila alur halaman berubah
- **Ekspor** — tabel ke PDF (jsPDF) dan Excel (SheetJS)

## Prasyarat

- [Docker](https://www.docker.com/) & Docker Compose, **atau** untuk jalan lokal tanpa Docker:
  - Node.js 20+
  - PHP 8.3 + Composer (ekstensi `pdo_pgsql`)
  - Python 3.11+
  - PostgreSQL 16 dan Redis 7

## Menjalankan dengan Docker

1. Siapkan file environment:

   ```bash
   cp services/core-api/.env.example services/core-api/.env
   touch services/ai-engine/.env
   # Kata sandi database (acak, panjang) dan token tunnel; file ini tidak masuk git
   echo "DB_PASSWORD=<kata-sandi-acak>" >> infra/.env
   ```

2. Ubah koneksi database di `services/core-api/.env` agar memakai PostgreSQL dari compose:

   ```env
   DB_CONNECTION=pgsql
   DB_HOST=db
   DB_PORT=5432
   DB_DATABASE=school_platform
   DB_USERNAME=school_admin
   # DB_PASSWORD diambil dari infra/.env oleh docker compose

   REDIS_HOST=redis
   APP_ENV=production
   APP_DEBUG=false
   ```

3. Jalankan semua layanan:

   ```bash
   cd infra
   docker compose up -d --build
   ```

4. Inisialisasi backend (sekali saja). Dependensi Composer dipasang otomatis saat container start (hanya bila `composer.lock` berubah):

   ```bash
   docker compose exec core-api php artisan key:generate
   docker compose exec core-api php artisan migrate --seed --force
   docker compose exec core-api php artisan storage:link
   ```

5. Buka aplikasi:
   - Web: http://localhost:3000 (build produksi, sama dengan situs publik)
   - API: http://localhost:8000/api (langsung), atau http://localhost:3000/api lewat proxy web
   - AI Engine health check: http://localhost:8001/api/health/

## Mengedit dan menerbitkan

Situs publik (`web`) memakai build produksi, sehingga perubahan kode tidak langsung terlihat oleh pengguna.
Alurnya dua jalur:

1. Nyalakan jalur kerja (sekali, lalu biarkan selama mengedit):

   ```bash
   cd infra
   docker compose --profile dev up -d web-dev     # http://localhost:3001, perubahan langsung terlihat
   ```

2. Edit kode dan cek hasilnya di http://localhost:3001. API dan database yang dipakai sama dengan situs publik.
3. Bila sudah benar, terbitkan ke situs publik (tes backend, build web, muat ulang API & scheduler, ±2–3 menit):

   ```bash
   sh infra/terbitkan.sh            # atau: sh infra/terbitkan.sh --cepat (tanpa tes)
   ```

4. Matikan jalur kerja bila tidak dipakai: `docker compose stop web-dev`.

Perubahan kode PHP langsung berlaku di API (opcache memeriksa file tiap 2 detik); perubahan `.env` core-api
perlu `terbitkan.sh` atau restart `core-api`. Karena `APP_ENV=production`, migrasi dijalankan dengan
`php artisan migrate --force` setelah backup. Detail error tidak tampil di layar; bacalah di
`services/core-api/storage/logs/laravel-<tanggal>.log` (disimpan 30 hari).

## Menjalankan secara lokal (tanpa Docker)

### Core API (Laravel)

```bash
cd services/core-api
cp .env.example .env        # sesuaikan DB_* dengan database lokal Anda
composer install
php artisan key:generate
php artisan migrate --seed
php artisan storage:link
php artisan serve --port=8000
```

### Web (Next.js)

```bash
cd apps/web
npm install
npm run dev                 # http://localhost:3000
```

> Browser memanggil API lewat `/api` di domain web; Next.js meneruskan `/api/*` dan `/storage/*` ke core-api
> ([apps/web/next.config.mjs](apps/web/next.config.mjs)). Karena itu aplikasi tetap berjalan lewat tunnel, domain sekolah,
> atau HP guru tanpa membuka port API. Alamat core-api dari sisi server diatur dengan `API_INTERNAL_URL`
> (bawaan `http://localhost:8000`; di Docker `http://core-api:8000`). Isi `NEXT_PUBLIC_API_URL` hanya bila API
> sengaja dipasang di domain lain ([apps/web/app/lib/config.js](apps/web/app/lib/config.js)).

### AI Engine (Django)

```bash
cd services/ai-engine
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
python manage.py runserver 8001
```

## Akses publik (Cloudflare Tunnel)

Aplikasi dibuka dari internet lewat Cloudflare named tunnel di **https://web.saprapor.com**, tanpa membuka port
di router. Konektornya adalah layanan `cloudflared` di [infra/docker-compose.yml](infra/docker-compose.yml)
(container `school_cloudflared`, `restart: unless-stopped`).

1. Di dashboard Cloudflare Zero Trust → Networks → Tunnels, buat tunnel lalu salin tokennya (bagian setelah
   `--token` pada perintah `docker run` yang ditampilkan Cloudflare).
2. Simpan token di `infra/.env` (diabaikan git, jangan di-commit):

   ```env
   CLOUDFLARE_TUNNEL_TOKEN=eyJ...
   ```

3. Jalankan `docker compose up -d cloudflared` dari folder `infra`. Jangan jalankan juga perintah `docker run`
   dari Cloudflare, karena akan membuat konektor ganda.
4. Tambahkan **Public Hostname** di tunnel tersebut: domain `web.saprapor.com`, service **HTTP** ke `web:3000`
   (nama layanan di jaringan Docker; `host.docker.internal:3000` juga bisa).
5. Tunnel diarahkan ke `web` (build produksi). Bila suatu saat tunnel diarahkan ke `web-dev`, domainnya harus
   terdaftar di `allowedDevOrigins` ([apps/web/next.config.mjs](apps/web/next.config.mjs)); tanpa itu Next.js
   mode dev memblokir aset JavaScript dan halaman tertahan di "Redirecting...".

Cek koneksi dengan `docker logs school_cloudflared`: harus ada 4 baris `Registered tunnel connection` dan baris
`Updated to new configuration` yang memuat hostname tadi.

## Keamanan akses publik

Aplikasi bisa dibuka dari internet lewat tunnel cloudflared, jadi beberapa pengaman dipasang:

- **Port Docker hanya untuk komputer host.** Database, Redis, core-api, dan AI engine terikat ke `127.0.0.1`.
  Web juga terikat ke `127.0.0.1` secara bawaan; perangkat lain memakai alamat tunnel (HTTPS). Untuk membuka
  web ke jaringan lokal (HTTP tanpa enkripsi), jalankan `WEB_BIND=0.0.0.0 docker compose up -d web`.
- **HTTPS saja.** Akses `http://` lewat Cloudflare dialihkan ke `https://` ([apps/web/proxy.js](apps/web/proxy.js)),
  dan semua respons membawa header HSTS, `X-Frame-Options`, `X-Content-Type-Options`, serta `Referrer-Policy`.
- **IP asli pengguna.** Laravel memercayai `X-Forwarded-For` hanya dari jaringan privat (proxy Next.js dan
  cloudflared), diatur dengan `TRUSTED_PROXIES` di `.env` core-api.
- **Batas percobaan login.** Gagal 5 kali per menit per akun+IP, atau 20 kali per 15 menit per akun dari IP
  mana pun, membuat login akun itu ditahan sementara. Ada juga batas 30 permintaan login per menit per IP.
  Ganti kata sandi dibatasi 10 kali per menit.
- **Peringatan login gagal.** Bila satu akun gagal login 10 kali dalam 15 menit, admin menerima WA otomatis
  (nomor di Pengaturan → Nomor WA Admin; perlu Fonnte aktif), paling banyak sekali per jam per akun.
  Percobaan berulang juga muncul di Pusat Notifikasi admin.
- **Batas laju seluruh API**: 300 permintaan per menit per akun (per IP bila belum login).
- **Token login berlaku 7 hari** (`SANCTUM_EXPIRATION`, dalam menit; `0` = tanpa batas). Token kedaluwarsa
  dibersihkan saat pengguna login.
- **CORS** hanya untuk origin di `CORS_ALLOWED_ORIGINS` (bawaan `http://localhost:3000`). Frontend sendiri
  memakai domain yang sama sehingga tidak bergantung pada CORS.

- **Mode produksi**: `APP_ENV=production`, `APP_DEBUG=false` (error tidak menampilkan detail kode), web memakai
  `next build` + `next start`. Kata sandi database ada di `infra/.env`, bukan di repo.
- **Pemantau uptime**: `GET /api/health` menjawab `{"status":"ok"}` bila API dan database hidup (503 bila
  database tidak terjangkau). Daftarkan `https://web.saprapor.com/api/health` di layanan pemantau seperti
  UptimeRobot (gratis, cek tiap 5 menit) agar ada pemberitahuan saat situs mati. Container `core-api` juga
  memakai endpoint ini sebagai healthcheck Docker.

## Backup data

Service `db-backup` (lihat [infra/backup/backup.sh](infra/backup/backup.sh)) membuat backup harian ke folder
`backups/` di root repo (di luar container, tidak ikut git):

- `backups/harian/db_<tanggal>_<jam>.dump`: isi database (format `pg_dump -Fc`), diperiksa bisa dibaca sebelum disimpan
- `backups/harian/storage_<tanggal>_<jam>.tar.gz`: file unggahan (tanda tangan, lampiran jadwal/jurnal)
- `backups/bulanan/`: salinan pertama tiap bulan

Backup dibuat sekali sehari begitu lewat jam 01.00. Bila komputer mati pada jam itu, backup dibuat saat komputer
menyala lagi. Backup harian disimpan 14 hari, bulanan 12 bulan. Semua bisa diatur di `infra/.env`:

| Variabel             | Bawaan          | Arti                                                         |
|----------------------|-----------------|--------------------------------------------------------------|
| `BACKUP_DIR`         | `../backups`    | Folder tujuan; sebaiknya disk lain atau folder Google Drive/OneDrive |
| `BACKUP_HOUR`        | `1`             | Jam paling awal backup harian dibuat                         |
| `BACKUP_KEEP_DAYS`   | `14`            | Lama backup harian disimpan (hari)                           |
| `BACKUP_KEEP_MONTHS` | `12`            | Lama backup bulanan disimpan (bulan)                         |
| `BACKUP_TZ`          | `Asia/Jayapura` | Zona waktu penamaan dan jadwal                               |
| `BACKUP_SALINAN_DIR` | (kosong)        | Salinan kedua opsional, mis. flashdisk (Google Drive cukup lewat cara di bawah) |
| `BACKUP_SALINAN_KEEP`| `7`             | Jumlah backup terakhir yang disimpan di salinan kedua        |

```bash
cd infra
docker compose logs db-backup                                   # riwayat backup
docker compose exec db-backup sh /backup/backup.sh sekarang     # backup manual saat ini juga
docker compose exec db-backup sh /backup/restore.sh             # daftar backup yang tersedia
docker compose exec db-backup sh /backup/uji-restore.sh         # uji pulihkan backup terbaru ke database sementara
docker compose exec db-backup sh /backup/restore.sh /backups/harian/db_2026-11-02_0100.dump YA
```

**Salinan di luar laptop (Google Drive).** Folder `backups/` disinkronkan ke Google Drive lewat Google Drive
for Desktop dalam mode *Stream files* (isi Drive tidak diunduh ke laptop): Preferences → **My Computer** →
**Add folder** → pilih folder `backups` → **Sync with Google Drive**. Hasilnya tampil di drive.google.com bagian
**Computers**. Backup yang dihapus karena lewat masa simpan ikut terhapus di Drive (masih ada di Sampah 30 hari).

Restore menimpa seluruh database, jadi kondisi saat itu dibackup dulu secara otomatis, dan pemulihan berjalan
dalam satu transaksi. File unggahan dipulihkan dengan mengekstrak arsipnya ke
`services/core-api/storage/app/` (misalnya `tar -xzf backups/harian/storage_<tanggal>.tar.gz -C services/core-api/storage/app`).

## Akun default

Setelah `php artisan migrate --seed`, tersedia akun admin (akun peran lain dibuat admin lewat Manajemen Pengguna):

| Email               | Password      |
|---------------------|---------------|
| `admin@sekolah.com` | `password123` |

Seeder bersifat idempoten, jadi `php artisan db:seed` aman dijalankan ulang. **Segera ganti kata sandi ini**
lewat menu Akun setelah login pertama, karena kata sandi bawaan tercantum di repo.

## Endpoint API

Base URL: `/api` di domain web (proxy ke core-api), atau `http://localhost:8000/api` langsung

| Method | Endpoint | Keterangan | Peran | Auth |
|---|---|---|---|---|
| POST | `/login` | Login (throttle 20/menit), mengembalikan token | – | – |
| GET | `/health` | Status API dan database untuk pemantau uptime | – | – |
| GET | `/signature/{filename}` | Gambar tanda tangan (proxy CORS) | – | – |
| GET | `/me`, `/user` | Data user yang sedang login | semua peran | ✔ |
| POST | `/akun/password` | Ganti password sendiri | semua peran | ✔ |
| POST | `/logout` | Logout | semua peran | ✔ |
| POST | `/log-aktivitas/event` | Catat tindakan di browser (buka halaman, ekspor, cetak, chat WA, salin) | semua peran | ✔ |
| GET | `/log-aktivitas` | Daftar log (filter `dari`, `sampai`, `kategori`, `aksi`, `modul`, `user_id`, `status`, `q`; paginasi) | staf (guru: miliknya) | ✔ |
| GET | `/log-aktivitas/ringkasan` | Statistik: per kategori, per hari, per jam, pengguna & modul teratas | staf (guru: miliknya) | ✔ |
| GET | `/log-aktivitas/opsi` | Pilihan filter (pengguna, modul, aksi) | staf | ✔ |
| GET | `/log-aktivitas/{id}` | Detail log beserta perubahan data sebelum/sesudah | staf (guru: miliknya) | ✔ |
| GET | `/notifikasi` | Notifikasi Perlu Tindakan sesuai peran (+ jumlah belum dibaca & mendesak) | semua peran | ✔ |
| GET | `/diagnostik/kognitif` | Nilai diagnostik kelas (+ nilai per indikator) untuk pengelompokan | staf | ✔ |
| GET/PUT | `/diagnostik/nonkognitif` | Diagnostik non-kognitif kelas per semester (ubah: wali kelas/pengelola) | staf | ✔ |
| POST | `/notifikasi/baca` | Tandai dibaca (`kunci[]`, atau semua bila kosong) | semua peran | ✔ |
| GET | `/settings` | Ambil pengaturan sekolah | semua peran | ✔ |
| GET | `/portal/anak` | Data anak (portal) | siswa, ortu | ✔ |
| GET | `/portal/rapor` | Rapor anak (portal) + `remedial` (rencana tindak lanjut & hasil) + `jadwal_pekan` (jadwal kelas 7 hari ke depan) | siswa, ortu | ✔ |
| POST | `/settings` | Simpan pengaturan sekolah | admin | ✔ |
| POST/PUT/DELETE | `/students, /teachers, /classes, /subjects, /periodes, /kategori-penilaian` | Tambah/ubah/hapus data master | admin | ✔ |
| PUT/DELETE | `/mbk/{id}` | Ubah/hapus aktivitas | admin | ✔ |
| POST | `/mbk` | Tambah aktivitas (`jenis_asesmen`: DIAGNOSTIK/FORMATIF/SUMATIF) | admin, guru | ✔ |
| POST/PUT | `/materi` | Tambah/ubah materi beserta daftar `indikator` (guru hanya mapel yang diampu) | admin, guru | ✔ |
| GET · POST/PUT | `/indikator` | Daftar (staf) · tambah/ubah (admin, guru) indikator (IKTP) suatu materi | staf | ✔ |
| DELETE | `/indikator/{id}` | Hapus indikator yang belum pernah dipakai menilai | admin | ✔ |
| DELETE | `/materi/{id}` | Hapus materi | admin | ✔ |
| GET/POST/PUT/DELETE | `/users, /users/{id}` | Kelola akun pengguna | admin | ✔ |
| POST | `/users/generate` | Buat akun massal | admin | ✔ |
| POST | `/users/{id}/reset-password` | Reset password pengguna | admin | ✔ |
| GET | `/students/master-data` | Data referensi untuk form siswa | staf | ✔ |
| GET | `/keluarga` | Orang tua & wali beserta anak, akun portal, daftar pekerjaan dan siswa | admin, kepsek | ✔ |
| POST/PUT/DELETE | `/keluarga/{ortu\|wali}[/{id}]` | Tambah/ubah/hapus data keluarga dan anaknya (`anak`: daftar `id_siswa`); hapus ditolak bila ada akun portal | admin | ✔ |
| GET | `/students, /teachers, /classes, /subjects, /periodes, /kategori-penilaian, /mbk, /materi` | Daftar data master | staf | ✔ |
| GET | `/materi/by-context` | Materi berdasarkan konteks | staf | ✔ |
| GET | `/dashboard` | Data dasbor analitik | staf | ✔ |
| GET | `/nilai/filters` | Opsi filter input nilai | staf | ✔ |
| GET | `/nilai/materi` | Materi berdasarkan konteks filter | staf | ✔ |
| GET | `/nilai/students` | Daftar siswa beserta nilainya | staf | ✔ |
| GET | `/nilai` | Daftar nilai | staf | ✔ |
| GET | `/nilai/remedial` | Daftar siswa remedial | staf | ✔ |
| POST | `/nilai/batch` | Simpan nilai secara batch | staf | ✔ |
| DELETE | `/nilai/{id}` | Hapus nilai | staf | ✔ |
| POST | `/remedial` | Tambah rencana tindak lanjut remedial | staf | ✔ |
| POST | `/remedial/notifikasi` | Susun pesan WA orang tua: rencana tindak lanjut atau hasil remedial | staf | ✔ |
| PUT/DELETE | `/remedial/{id}` | Ubah/hapus rencana remedial | staf | ✔ |
| GET | `/bank-soal` | Daftar soal (filter mapel/status/bentuk/level/cari/milik, per halaman) + jumlah per status | staf | ✔ |
| GET | `/bank-soal/referensi` | Mapel (guru: diampu), kelas, materi + TP, konstanta, penyedia AI | staf | ✔ |
| POST/PUT/DELETE | `/bank-soal`, `/bank-soal/{id}` | Tulis/ubah/hapus soal (isi & kunci divalidasi per bentuk) | staf | ✔ |
| POST | `/bank-soal/ajukan`, `/bank-soal/{id}/tarik` | Ajukan soal ke kepala sekolah / tarik pengajuan | staf | ✔ |
| POST | `/bank-soal/setujui`, `/bank-soal/revisi` | Setujui / kembalikan dengan catatan | kepsek | ✔ |
| POST | `/bank-soal/ai/draf` | Draf soal oleh AI untuk satu baris kisi-kisi atau satu TP (disimpan sebagai draf) | staf | ✔ |
| POST | `/bank-soal/impor` | Pecah paket soal lama (teks/Word/PDF/foto) menjadi draf | staf | ✔ |
| POST | `/bank-soal/gambar` | Unggah gambar soal (PNG/JPG/WEBP, maks. 2MB) | staf | ✔ |
| GET | `/perangkat-ajar/referensi` | Pilihan formulir perangkat ajar (mapel diampu, kelas + fase, periode, materi & TP, profil lulusan) | staf | ✔ |
| GET/POST/PUT/DELETE | `/perangkat-ajar/cp`, `/perangkat-ajar/cp/{id}` | Capaian Pembelajaran per mapel, fase, elemen | staf | ✔ |
| POST | `/perangkat-ajar/cp/pecah`, `/perangkat-ajar/cp/banyak` | AI memecah teks CP per elemen (pratinjau) / simpan banyak elemen | staf | ✔ |
| GET/POST/PUT/DELETE | `/perangkat-ajar/atp`, `/perangkat-ajar/atp/{id}` | ATP beserta barisnya (TP lama atau usulan) | staf | ✔ |
| POST | `/perangkat-ajar/atp/{id}/ai` | Draf baris ATP dari AI (tidak disimpan) | staf | ✔ |
| POST | `/perangkat-ajar/atp/{id}/ajukan`, `/tarik`, `/setujui`, `/revisi` | Alur persetujuan ATP (setujui/revisi: kepala sekolah) | staf | ✔ |
| GET/POST/PUT/DELETE | `/perangkat-ajar/modul`, `/perangkat-ajar/modul/{id}` | Modul ajar RPM (isi JSON, TP yang dicakup, paket soal asesmen) | staf | ✔ |
| GET/POST | `/video-belajar` | Pustaka video (saring status/mapel/kelas) / unggah multipart (`video`, `poster` data URL) | staf | ✔ |
| GET/POST/DELETE | `/video-belajar/{id}` | Detail & tempat dipakai / ubah (multipart, berkas pengganti opsional) / hapus | staf | ✔ |
| POST | `/video-belajar/{id}/ajukan`, `/setujui`, `/revisi` | Alur persetujuan video (setujui/revisi: kepala sekolah) | staf | ✔ |
| GET/POST/DELETE | `/video-belajar/tautan` | Tautan video ke modul ajar (per pertemuan) atau sesi jadwal | staf | ✔ |
| GET | `/video-belajar/suara` | Pilihan suara narasi & ketersediaannya (API key sudah diisi atau belum) | staf | ✔ |
| POST | `/video-belajar/templat`, `/video-belajar/{id}/render` | Buat video dari templat / ubah isian & render ulang (masuk antrean) | staf | ✔ |
| GET/POST | `/internal/render/berikut`, `/internal/render/suara`, `/internal/render/{id}/selesai`, `/internal/render/{id}/gagal` | Khusus layanan video-render (kunci `RENDER_SECRET`): ambil antrean, suara berbayar, lapor hasil | layanan | kunci |
| GET | `/portal/video` | Video disetujui untuk kelas anak | siswa, ortu | ✔ |
| GET | `/pemakaian` | Dasbor pemakaian: adopsi fitur, per guru, jejak kerja, hambatan, portal (`hari` 7–90) | admin, kepsek | ✔ |
| GET | `/dokumentasi` | Dokumentasi seluruh endpoint API (dibaca dari router) | admin | ✔ |
| GET | `/dokumentasi/openapi.json` | Spesifikasi OpenAPI 3.0 untuk Postman/Insomnia/Swagger | admin | ✔ |
| GET | `/jadwal/rencana-hari` | Rencana sesi bermodul pada satu tanggal (opsional per kelas; guru: sesinya sendiri) | staf | ✔ |
| GET | `/jadwal/{id}/rencana` | Tujuan & langkah pertemuan modul untuk satu sesi | staf | ✔ |
| GET | `/perangkat-ajar/modul/{id}/paket` | Paket soal mapel/kelas untuk ditautkan sebagai asesmen akhir | staf | ✔ |
| POST | `/perangkat-ajar/modul/{id}/ai` | Draf isi modul dari AI dengan ringkasan data kelas (tidak disimpan) | staf | ✔ |
| POST | `/perangkat-ajar/modul/{id}/ajukan`, `/tarik`, `/setujui`, `/revisi` | Alur persetujuan modul ajar | staf | ✔ |
| POST | `/bank-soal/ai/gambar` | Gambar soal dari AI: ilustrasi (Gemini/OpenKey/OpenRouter, model opsional) atau diagram SVG | staf | ✔ |
| GET/POST/PUT/DELETE | `/kisi-kisi`, `/kisi-kisi/{id}` | Kisi-kisi beserta barisnya (dan soal per baris) | staf | ✔ |
| GET/POST/PUT/DELETE | `/paket-soal`, `/paket-soal/{id}` | Paket soal (naskah ujian) beserta butirnya | staf | ✔ |
| POST/PUT | `/paket-soal/{id}/butir` | Tambah soal disetujui / atur urutan & skor; DELETE `/paket-soal/{id}/butir/{idButir}` | staf | ✔ |
| POST | `/paket-soal/{id}/isi-kisi` | Isi paket dari baris kisi-kisi | staf | ✔ |
| GET/PUT | `/paket-soal/{id}/jawaban` | Lembar koreksi: siswa kelas + jawaban; simpan jawaban & skor guru beberapa siswa | staf | ✔ |
| POST/DELETE | `/paket-soal/{id}/jawaban/{idSiswa}/foto` | Unggah / hapus foto lembar jawaban (maks. 4, 8MB) | staf | ✔ |
| POST | `/paket-soal/{id}/jawaban/{idSiswa}/baca` | AI membaca foto lembar jawaban (usulan, tidak disimpan) | staf | ✔ |
| POST | `/paket-soal/{id}/jawaban/{idSiswa}/nilai-ai` | Usulan skor uraian dari AI sesuai rubrik (jawaban online/foto; tidak disimpan) | staf | ✔ |
| POST | `/paket-soal/{id}/kirim-nilai` | Kirim nilai per materi/TP ke Input Nilai | staf | ✔ |
| GET | `/paket-soal/{id}/analisis` | Analisis butir, capaian per TP, profil STNKM | staf | ✔ |
| PUT | `/paket-soal/{id}/online` | Buka/tutup tes online: jadwal, durasi, acak, token, tampilkan nilai | staf | ✔ |
| GET | `/paket-soal/{id}/pantau` | Pantau tes online per siswa | staf | ✔ |
| POST | `/paket-soal/{id}/jawaban/{idSiswa}/akhiri` | Akhiri sesi tes online seorang siswa | staf | ✔ |
| GET | `/ujian`, `/ujian/{id}` | Tes online kelas siswa; soal (tanpa kunci) & jawaban sesi berjalan | siswa | ✔ |
| POST | `/ujian/{id}/mulai`, `/ujian/{id}/selesai` | Mulai (dengan token) / kumpulkan | siswa | ✔ |
| PUT | `/ujian/{id}/jawaban` | Simpan otomatis jawaban (ditolak setelah waktu habis) | siswa | ✔ |
| POST | `/ujian/{id}/rekaman` | Unggah rekaman membaca nyaring (webm/mp4/ogg/wav, maks. 8MB; menggantikan rekaman lama) | siswa | ✔ |
| GET | `/jurnal` | Daftar jurnal anekdotal | staf | ✔ |
| POST | `/jurnal/analyze` | Analisis narasi (STNKM) dengan AI | staf | ✔ |
| POST | `/jurnal/store` | Simpan jurnal | staf | ✔ |
| POST | `/jurnal/import` | Impor jurnal massal (Excel) | staf | ✔ |
| PUT/DELETE | `/jurnal/{id}` | Ubah/hapus jurnal (guru: milik sendiri) | staf | ✔ |
| GET | `/presensi` | Daftar presensi | staf | ✔ |
| POST | `/presensi/batch` | Simpan presensi secara batch | staf | ✔ |
| DELETE | `/presensi/tanggal` | Hapus presensi per tanggal | staf | ✔ |
| GET | `/p5` | Data kegiatan kokurikuler | staf | ✔ |
| POST | `/p5/proyek` | Tambah kegiatan kokurikuler (`bentuk`: PROYEK/KEBIASAAN/INTRAKURIKULER) | staf | ✔ |
| PUT/DELETE | `/p5/proyek/{id}` | Ubah/hapus kegiatan kokurikuler | staf | ✔ |
| POST | `/p5/catatan` | Simpan catatan proses P5 | staf | ✔ |
| POST | `/p5/catatan/generate` | Buat catatan P5 dengan AI | staf | ✔ |
| POST | `/p5/hitung` | Ekstraksi nilai P5 | staf | ✔ |
| PUT | `/p5/nilai/{id}` | Ubah nilai P5 | staf | ✔ |
| GET | `/rapor/data` | Data rapor siswa | staf | ✔ |
| POST | `/rapor/catatan-wali` | Simpan catatan wali kelas | staf | ✔ |
| POST | `/rapor/catatan-wali/generate` | Buat catatan wali dengan AI | staf | ✔ |
| GET | `/laporan/stnkm` | Data laporan STNKM | staf | ✔ |
| POST | `/whatsapp` | Kirim WhatsApp (Fonnte) | staf | ✔ |
| GET | `/jadwal, /jadwal/referensi` | Daftar jadwal & data referensi | staf | ✔ |
| POST | `/jadwal` | Tambah jadwal | staf | ✔ |
| PUT/DELETE | `/jadwal/{id}` | Ubah/hapus jadwal | staf | ✔ |
| PATCH | `/jadwal/{id}/geser` | Geser jadwal (tanggal/jam) | staf | ✔ |
| PATCH | `/jadwal/{id}/status` | Ubah status jadwal | staf | ✔ |
| GET | `/ruangan` | Daftar ruangan | staf | ✔ |
| POST/PUT/DELETE | `/ruangan, /ruangan/{id}` | Kelola ruangan | admin, kepsek | ✔ |

Endpoint bertanda ✔ memerlukan header `Authorization: Bearer <token>`. Kolom Peran: *staf* = `admin`, `kepsek`, `guru`; endpoint `/register` sudah dihapus (akun dibuat admin lewat `/users`).

## Halaman Web

| Path                      | Halaman              |
|---------------------------|----------------------|
| `/login`                  | Login                |
| `/dashboard`              | Dashboard            |
| `/dashboard/master-siswa` | Master Siswa (admin & kepsek)  |
| `/dashboard/master-keluarga` | Orang Tua & Wali (admin & kepsek; tampilan Tabler) |
| `/dashboard/master-guru`  | Master Guru (admin & kepsek)   |
| `/dashboard/master-kelas` | Master Kelas (admin & kepsek)  |
| `/dashboard/master-mapel` | Master Mata Pelajaran (admin & kepsek) |
| `/dashboard/master-periode`  | Semester (admin & kepsek) |
| `/dashboard/master-kategori` | High Level (kategori penilaian) |
| `/dashboard/master-mbk`   | Aktivitas (MBK)      |
| `/dashboard/master-materi`| Materi (admin & guru tambah/ubah, guru hanya mapel diampu; kepsek lihat; hapus khusus admin) |
| `/dashboard/jadwal`       | Jadwal (grup menu "TDU - Jadwal") |
| `/dashboard/nilai`        | Input Nilai (termasuk mode remedial) |
| `/dashboard/video-belajar` | Video Belajar: pustaka, unggah, persetujuan, tempat dipakai |
| `/dashboard/pemakaian` | Pemakaian Aplikasi: adopsi fitur, pemakaian per guru, jejak kerja, hambatan (admin & kepsek) |
| `/dashboard/dokumentasi-api` | Dokumentasi API: daftar endpoint, akses per peran, contoh curl, unduh OpenAPI (admin) |
| `/dashboard/perangkat-ajar` | Perangkat Ajar: ATP, modul ajar RPM, dan Capaian Pembelajaran (persetujuan kepala sekolah) |
| `/dashboard/ujian`        | Tes Online siswa: daftar tes dan halaman mengerjakan (`/dashboard/ujian/{id}`) |
| `/dashboard/bank-soal`    | Bank Soal: daftar & persetujuan soal, kisi-kisi, paket soal (cetak, koreksi, kirim nilai, analisis butir), impor paket soal |
| `/dashboard/jurnal`       | Jurnal (anekdotal & observasi) |
| `/dashboard/presensi`     | Presensi             |
| `/dashboard/p5`           | Proyek (kegiatan kokurikuler) |
| `/dashboard/import-excel` | Import Excel         |
| `/dashboard/laporan-stnkm`| STNKM (laporan)      |
| `/dashboard/rapor`        | Rapor (cetak)        |
| `/dashboard/akun`         | Akun Saya            |
| `/dashboard/pengguna`     | Manajemen Pengguna (admin) |
| `/dashboard/pengaturan`   | Pengaturan Sekolah (admin) |
| `/dashboard/log-aktivitas` | Log Aktivitas / audit trail (admin & kepsek: semua; guru: Aktivitas Saya) |
| `/dashboard/diagnostik`   | Asesmen Diagnostik (kognitif & non-kognitif) |
| `/dashboard/notifikasi`   | Perlu Tindakan / pusat notifikasi (semua peran) |
| `/dashboard/panduan`      | Panduan pengguna per peran, bisa dicari dan dicetak (semua peran) |
| `/dashboard/portal`       | Portal Siswa/Orang Tua |

## Testing

Tes core-api memakai PostgreSQL seperti aplikasi, di database terpisah `school_platform_test` yang dikosongkan
setiap kali tes jalan. Database utama tidak pernah disentuh: tes menolak berjalan bila nama database tidak
berakhiran `_test`.

```bash
cd infra
# Sekali saja: buat database tes
docker compose exec db createdb -U school_admin school_platform_test
# Jalankan semua tes (±1 menit)
docker compose exec core-api php artisan test
# Satu berkas atau satu tes saja
docker compose exec core-api php artisan test --filter RemedialTest
```

| Berkas                                                                 | Yang diuji                                                                                   |
|------------------------------------------------------------------------|----------------------------------------------------------------------------------------------|
| [AksesPeranTest](services/core-api/tests/Feature/AksesPeranTest.php)   | Hak akses per peran: rute admin/kepsek, guru dibatasi mapel diampu, kelas binaan, data miliknya; portal siswa |
| [RemedialTest](services/core-api/tests/Feature/RemedialTest.php)       | Penilaian per tanggal, rencana tindak lanjut & jadwal, nilai remedial (termasuk gaya import), rekap efektif, pembersihan jadwal |
| [SiklusRemedialTest](services/core-api/tests/Feature/SiklusRemedialTest.php) | Batas nilai remedial di rapor sesuai pengaturan, data efektivitas tindak lanjut di dasbor, pesan WA orang tua (rencana & hasil) dan hak aksesnya |
| [LogAktivitasTest](services/core-api/tests/Feature/LogAktivitasTest.php) | Audit trail: login/logout/login gagal, diff sebelum-sesudah, percobaan ditolak, sensor kata sandi, event output, hak lihat, log tidak bisa diubah, aturan guru jurnal |
| [NotifikasiTest](services/core-api/tests/Feature/NotifikasiTest.php) | Notifikasi per peran: nilai belum ditindaklanjuti → remedial terlambat, cakupan mapel guru, tandai dibaca & muncul lagi bila berubah, jadwal & presensi hari ini, login gagal (admin), portal siswa |
| [DiagnostikTest](services/core-api/tests/Feature/DiagnostikTest.php) | Nilai diagnostik tidak masuk rapor/remedial tetapi tersedia untuk pemetaan; non-kognitif hanya diisi wali kelas, validasi isian & anggota kelas |
| [KeluargaTest](services/core-api/tests/Feature/KeluargaTest.php) | Orang tua & wali: anak terhubung/dipindah/dilepas, validasi nama & nomor WA, kepsek hanya lihat, hapus ditolak bila ada akun portal |
| [ProduksiTest](services/core-api/tests/Feature/ProduksiTest.php) | Endpoint health, batas laju API, arsip Log Aktivitas ke file, peringatan WA login gagal sekali per jam, nomor WA admin tersembunyi dari peran lain |
| [PortalTest](services/core-api/tests/Feature/PortalTest.php) | Portal: capaian indikator dengan nama materi, tindak lanjut hanya milik anak, jadwal sepekan tanpa sesi remedial/catatan yang memuat nama siswa lain |
| [LoginTest](services/core-api/tests/Feature/LoginTest.php)             | Login, batas percobaan per akun/IP, IP asli di balik proxy tepercaya, masa berlaku token      |

Data uji (sekolah mini: 2 guru, 2 kelas, 2 mapel, 4 siswa, akun tiap peran) dibuat oleh
[MembuatDataSekolah](services/core-api/tests/Concerns/MembuatDataSekolah.php). Jalankan tes sebelum commit,
terutama setelah mengubah controller, aturan akses, atau migrasi.

### Tes web (end-to-end)

Tes Playwright di [tests/web](tests/web) membuka halaman dari jalur kerja (`localhost:3001`) seperti pengguna
sungguhan, sedangkan semua panggilan `/api` dialihkan ke **API tes** (`core-api-e2e`, port 8090, profile `e2e`).
API tes memakai kode yang sama dengan database terpisah `school_platform_e2e`, yang dikosongkan lalu diisi
sekolah fiktif setiap kali tes jalan oleh `php artisan e2e:siapkan`. Perintah itu menolak berjalan bila nama
database tidak berakhiran `_e2e`, jadi data sekolah tidak tersentuh. Semua akun tes memakai sandi `Uji-E2E-2026`.

```bash
# Sekali saja
docker compose -f infra/docker-compose.yml exec db createdb -U school_admin school_platform_e2e
cd tests/web && npm ci && npx playwright install chromium
# Jalankan (API tes dinyalakan & dihentikan otomatis)
npx playwright test                                   # semua (±10 menit)
npx playwright test --project=desktop tes/alur.spec.js # alur kerja saja (±2 menit)
npx playwright show-report laporan                    # laporan, termasuk trace tes yang gagal
```

| Berkas | Yang diuji |
|---|---|
| [masuk.spec.js](tests/web/tes/masuk.spec.js) | Login lewat formulir: admin ke Dashboard, orang tua ke Portal, sandi salah ditolak, halaman terlindung tanpa login |
| [halaman.spec.js](tests/web/tes/halaman.spec.js) | Semua halaman admin, guru, dan orang tua terbuka tanpa error JavaScript dan tanpa geser ke samping, di desktop & HP; guru tidak bisa membuka halaman admin |
| [offline.spec.js](tests/web/tes/offline.spec.js) | Sinyal putus: jurnal, nilai, dan presensi masuk antrean HP (lencana awan + pita offline), lalu terkirim otomatis saat online; jurnal dianalisis STNKM saat terkirim |
| [alur.spec.js](tests/web/tes/alur.spec.js) | Guru menilai 2 indikator (nilai = rata-rata, tersimpan di API) → presensi + panel WA → jurnal muncul di linimasa → tombol remedial nonaktif untuk asesmen diagnostik → rapor memuat nilai & deskripsi capaian → panel WA rapor/presensi/jurnal pulih setelah dimuat ulang → portal orang tua → ganti gaya Klasik |

`infra/terbitkan.sh` menjalankan tes backend dan tes web (login, alur, offline) sebelum menerbitkan; `--lengkap` menambah semua halaman.

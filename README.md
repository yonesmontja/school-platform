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
| `web`       | Next.js                           | 3000  |
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
- **Master Guru, Kelas, Mata Pelajaran** — CRUD; mata pelajaran memiliki KKM per mapel
- **Referensi Penilaian (selaras kurikulum nasional)** — Semester; High Level = Elemen CP, bisa khusus satu mapel atau semua mapel; Aktivitas dengan jenis asesmen (diagnostik/formatif/sumatif); Materi memuat Tujuan Pembelajaran (TP) dan banyak Indikator Ketercapaian TP (IKTP) yang bisa diurutkan dan dinonaktifkan. Indikator dan aktivitas ditambah admin atau guru (guru hanya mapel yang diampu), kepsek melihat saja; indikator dihapus admin dan hanya bila belum pernah dipakai menilai
- **Input Nilai** — filter per periode/kelas/mapel/materi, simpan nilai secara batch (nilai bertanggal), dilengkapi analitik kelas dan riwayat nilai; mode remedial dengan rencana tindak lanjut per siswa; **penilaian per indikator**: satu sesi memilih satu atau lebih indikator (IKTP) materi, termasuk menambah indikator baru di tempat, lalu nilai 0–100 diisi per indikator dan nilai materi = rata-rata indikator yang terisi (mengalir ke STNKM, KKM, dan remedial seperti biasa); predikat capaian mengikuti **KKTP** sekolah (batas Cukup/Baik/Sangat Baik diatur di Pengaturan Sekolah, bawaan 70/80/90; tuntas tetap KKM mapel); remedial per indikator: hanya indikator di bawah KKM yang diulang, nilai remedial = rata-rata indikator setelah perbaikan; setiap nilai mencatat **guru penilai** (ID Master Guru: guru pemilik akun, atau guru pengampu mapel bila diisi admin/kepsek) dan **akun pengisinya** secara terpisah; **siklus remedial**: kebijakan nilai remedial di rapor diatur di Pengaturan Sekolah (bawaan dibatasi setinggi KKM mapel, atau apa adanya; nilai asli tetap tersimpan dan status tuntas mengikuti nilai sebenarnya), dan orang tua/wali bisa dikabari lewat WhatsApp saat rencana tindak lanjut dibuat maupun saat hasil remedial dicatat (otomatis via Fonnte bila aktif, selain itu tombol chat WA per siswa)
- **Jurnal Anekdotal** — catatan kejadian siswa yang dianalisis ke dimensi STNKM (nilai S, T, N, K, M); mode analisis: Heuristik (tanpa AI), Gemini, Qwen, Claude, DeepSeek, dan OpenKey. Jika AI gagal, otomatis fallback ke Heuristik. Dilengkapi tabel analitik, pencarian, ekspor Excel, dan edit jurnal. Guru jurnal: akun guru = dirinya sendiri; bila diisi admin/kepsek = guru yang dipilih di form, atau guru pengampu mapel materinya, atau wali kelas (jurnal observasi tanpa materi)
- **Import Excel** — impor massal nilai dan jurnal dari file Excel (template tersedia beserta lembar referensi siswa); template nilai otomatis memuat satu kolom per indikator aktif materi (judul berkode `[IND-…]`)
- **Presensi** — input kehadiran siswa per tanggal secara batch
- **Proyek (kokurikuler)** — kegiatan kokurikuler pengganti P5 (Permendikdasmen 13/2025): bentuk kegiatan (proyek lintas mapel, 7 Kebiasaan Anak Indonesia Hebat, penguatan intrakurikuler), target **8 Dimensi Profil Lulusan**, catatan proses (dapat dibuat dengan AI), dan ekstraksi predikat dari STNKM. Skala predikat diatur sekolah: 4 tingkat BB/MB/BSH/SB atau 3 tingkat e-Rapor Berkembang/Cakap/Mahir (predikat tetap tersimpan 4 tingkat). Rapor memuat deskripsi capaian dimensi otomatis; tampilan *deskripsi saja* atau *deskripsi + tabel* dipilih saat mencetak
- **Laporan STNKM** — laporan rata-rata STNKM per kelas/siswa dengan grafik tren, detail siswa, dan ekspor multi-halaman
- **Cetak Rapor** — data rapor, catatan wali kelas (dapat dibuat dengan AI), cetak, dan distribusi; deskripsi capaian mapel yang dinilai per indikator disusun dari indikatornya (penguasaan terbaik, perlu bimbingan di bawah KKM, atau perlu peningkatan)
- **WhatsApp (Fonnte)** — kirim pesan otomatis untuk rapor dan presensi lewat gateway Fonnte
- **Dashboard** — dasbor analitik bergaya SaaS dengan grafik (Chart.js) dan menu sidebar berkelompok yang dapat dilipat, dengan pencarian menu (Ctrl+K) dan mode mini; panel **Indikator Perlu Perhatian**: indikator (IKTP) diurutkan dari ketuntasan terendah, dengan rata-rata, persentase tuntas terhadap KKM, dan daftar siswa belum tuntas (nilai remedial terbaru menggantikan nilai asal); panel **Efektivitas Tindak Lanjut**: per bentuk tindak lanjut (Tes Ulang, Tutor Sebaya, dst.) jumlah yang sudah dilaksanakan, persentase siswa tuntas sesudahnya, rata-rata kenaikan nilai, serta rencana yang menunggu atau lewat tanggal
- **Tema** — mode terang/gelap/otomatis dan pilihan warna aksen untuk seluruh aplikasi
- **Log Aktivitas (audit trail)** — mencatat seluruh tindakan pengguna: login/logout/login gagal, setiap tambah/ubah/hapus data beserta nilai **sebelum → sesudah** per record (otomatis dari semua model, termasuk proses sistem/migrasi), percobaan yang ditolak, serta output di browser (unduh Excel/CSV/PDF, cetak, chat WhatsApp, salin teks) dan halaman yang dibuka. Kata sandi, token, API key, dan berkas base64 disensor. Log hanya-tambah (tidak bisa diubah/dihapus). Halaman bergaya AdminLTE 4: info-box statistik, tren per kategori, peta jam sibuk, pengguna & modul teraktif, linimasa (timeline) atau tabel, filter (rentang waktu, kategori, pengguna, modul, aksi, status, pencarian), drawer detail dengan diff, mode langsung (muat ulang otomatis), dan ekspor CSV. Admin & kepsek melihat semua aktivitas; guru melihat aktivitasnya sendiri (Aktivitas Saya)
- **Asesmen Diagnostik** — pemetaan awal semester untuk pembelajaran berdiferensiasi. **Kognitif**: nilai dari aktivitas berjenis Diagnostik (diisi lewat Input Nilai/Import Excel; tidak masuk rapor, laporan, dasbor, maupun remedial) dikelompokkan otomatis menurut KKTP sekolah — *perlu pendampingan intensif*, *siap dengan penguatan*, *siap/mahir* — lengkap dengan rekomendasi pembelajaran per kelompok, kemampuan terlemah tiap siswa, rata-rata kelas per indikator prasyarat, daftar yang belum mengikuti, dan unduhan Excel pengelompokan. **Non-kognitif**: gaya belajar (visual/auditori/kinestetik), minat/bakat, kesejahteraan sosial-emosional, dukungan belajar di rumah, dan catatan per siswa per semester (diisi wali kelas/pengelola; data pribadi, tidak tampil di rapor/portal), dengan profil gaya belajar kelas beserta tips mengajar dan daftar siswa yang perlu perhatian. Wali kelas diingatkan lewat Perlu Tindakan bila belum lengkap
- **Ekspor e-Rapor** — tombol **e-Rapor** di halaman Rapor mengunduh rekap satu kelas (Excel) untuk disalin ke format nilai aplikasi e-Rapor SD: lembar Petunjuk, satu lembar per mapel (NISN, nama, nilai akhir, ceklis TP — T tercapai/P perlu pendampingan — serta deskripsi capaian kompetensi tercapai & perlu pendampingan, maks. 300 karakter), Kehadiran (S/I/A), Kokurikuler, Catatan Wali, dan Referensi TP. Bukan format impor resmi (format resmi diunduh dari aplikasi e-Rapor tiap sekolah dan berubah tiap versi); kolomnya disusun agar mudah dicocokkan per NISN
- **Pusat Notifikasi (Perlu Tindakan)** — lonceng di topbar (angka merah bila ada yang mendesak) dan halaman Perlu Tindakan. Notifikasi dihitung otomatis dari data sesuai peran dan hilang sendiri setelah pekerjaannya selesai: **guru** — remedial lewat tanggal, remedial hari ini/besok, nilai di bawah KKM tanpa rencana tindak lanjut, sesi mengajar hari ini, sesi lalu yang belum ditandai Selesai/Batal, presensi kelas binaan yang belum diisi, catatan wali kelas yang belum lengkap; **admin & kepsek** — rekap yang sama untuk seluruh sekolah, kelas yang belum presensi hari ini, dan (admin) percobaan login gagal berulang; **siswa & orang tua** — jadwal & hasil remedial anak serta ketidakhadiran tanpa keterangan. Status dibaca disimpan per pengguna; notifikasi yang isinya berubah muncul lagi sebagai baru. Opsional: notifikasi di perangkat (HP/laptop) untuk hal yang mendesak. "Hari ini" mengikuti zona waktu sekolah (`ZONA_SEKOLAH`, bawaan `Asia/Jayapura`)
- **Aplikasi terpasang (PWA)** — EduRapor bisa dipasang ke layar utama HP/laptop (tombol **Pasang aplikasi** di topbar; iPhone lewat Bagikan → Tambah ke Layar Utama), terbuka layar penuh dengan ikon sendiri dan pintasan ke Perlu Tindakan, Input Nilai, Presensi, dan Jurnal. Service worker sengaja minimal: tidak menyimpan aset aplikasi (tampilan selalu versi terbaru), hanya menampilkan halaman offline saat koneksi putus dan meneruskan klik notifikasi perangkat
- **Pengaturan Sekolah** — profil sekolah, tanda tangan, serta API key & model untuk provider AI serta konfigurasi WhatsApp (diisi di halaman Pengaturan, tersimpan terenkripsi)
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
   ```

2. Ubah koneksi database di `services/core-api/.env` agar memakai PostgreSQL dari compose:

   ```env
   DB_CONNECTION=pgsql
   DB_HOST=db
   DB_PORT=5432
   DB_DATABASE=school_platform
   DB_USERNAME=school_admin
   DB_PASSWORD=school_password

   REDIS_HOST=redis
   ```

3. Jalankan semua layanan:

   ```bash
   cd infra
   docker compose up -d --build
   ```

4. Inisialisasi backend (sekali saja). Dependensi Composer dipasang otomatis saat container start (hanya bila `composer.lock` berubah):

   ```bash
   docker compose exec core-api php artisan key:generate
   docker compose exec core-api php artisan migrate --seed
   docker compose exec core-api php artisan storage:link
   ```

5. Buka aplikasi:
   - Web: http://localhost:3000
   - API: http://localhost:8000/api (langsung), atau http://localhost:3000/api lewat proxy web
   - AI Engine health check: http://localhost:8001/api/health/

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
5. Web berjalan dalam mode dev, jadi domain tunnel harus terdaftar di `allowedDevOrigins`
   ([apps/web/next.config.mjs](apps/web/next.config.mjs)). Tanpa itu, Next.js memblokir aset JavaScript dan
   halaman tertahan di "Redirecting...". Domain baru di luar `*.saprapor.com` perlu ditambahkan di sana, lalu
   restart container `web`.

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
- **Token login berlaku 7 hari** (`SANCTUM_EXPIRATION`, dalam menit; `0` = tanpa batas). Token kedaluwarsa
  dibersihkan saat pengguna login.
- **CORS** hanya untuk origin di `CORS_ALLOWED_ORIGINS` (bawaan `http://localhost:3000`). Frontend sendiri
  memakai domain yang sama sehingga tidak bergantung pada CORS.

Sebelum dipakai di server sungguhan, set `APP_ENV=production` dan `APP_DEBUG=false` di `.env` core-api agar
pesan error tidak menampilkan detail kode.

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

```bash
cd infra
docker compose logs db-backup                                   # riwayat backup
docker compose exec db-backup sh /backup/backup.sh sekarang     # backup manual saat ini juga
docker compose exec db-backup sh /backup/restore.sh             # daftar backup yang tersedia
docker compose exec db-backup sh /backup/restore.sh /backups/harian/db_2026-11-02_0100.dump YA
```

Restore menimpa seluruh database, jadi kondisi saat itu dibackup dulu secara otomatis, dan pemulihan berjalan
dalam satu transaksi. File unggahan dipulihkan dengan mengekstrak arsipnya ke
`services/core-api/storage/app/` (misalnya `tar -xzf backups/harian/storage_<tanggal>.tar.gz -C services/core-api/storage/app`).

## Akun default

Setelah `php artisan migrate --seed`, tersedia akun admin (akun peran lain dibuat admin lewat Manajemen Pengguna):

| Email               | Password      |
|---------------------|---------------|
| `admin@sekolah.com` | `password123` |

Seeder bersifat idempoten, jadi `php artisan db:seed` aman dijalankan ulang.

## Endpoint API

Base URL: `/api` di domain web (proxy ke core-api), atau `http://localhost:8000/api` langsung

| Method | Endpoint | Keterangan | Peran | Auth |
|---|---|---|---|---|
| POST | `/login` | Login (throttle 20/menit), mengembalikan token | – | – |
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
| `/dashboard/master-guru`  | Master Guru (admin & kepsek)   |
| `/dashboard/master-kelas` | Master Kelas (admin & kepsek)  |
| `/dashboard/master-mapel` | Master Mata Pelajaran (admin & kepsek) |
| `/dashboard/master-periode`  | Semester (admin & kepsek) |
| `/dashboard/master-kategori` | High Level (kategori penilaian) |
| `/dashboard/master-mbk`   | Aktivitas (MBK)      |
| `/dashboard/master-materi`| Materi (admin & guru tambah/ubah, guru hanya mapel diampu; kepsek lihat; hapus khusus admin) |
| `/dashboard/jadwal`       | Jadwal (grup menu "TDU - Jadwal") |
| `/dashboard/nilai`        | Input Nilai (termasuk mode remedial) |
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
| [PortalTest](services/core-api/tests/Feature/PortalTest.php) | Portal: capaian indikator dengan nama materi, tindak lanjut hanya milik anak, jadwal sepekan tanpa sesi remedial/catatan yang memuat nama siswa lain |
| [LoginTest](services/core-api/tests/Feature/LoginTest.php)             | Login, batas percobaan per akun/IP, IP asli di balik proxy tepercaya, masa berlaku token      |

Data uji (sekolah mini: 2 guru, 2 kelas, 2 mapel, 4 siswa, akun tiap peran) dibuat oleh
[MembuatDataSekolah](services/core-api/tests/Concerns/MembuatDataSekolah.php). Jalankan tes sebelum commit,
terutama setelah mengubah controller, aturan akses, atau migrasi.

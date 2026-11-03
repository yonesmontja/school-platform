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
- **Portal Siswa & Orang Tua** — siswa dan orang tua melihat data anak dan rapor miliknya (read-only)
- **Jadwal Pembelajaran** — kalender (FullCalendar) dengan geser-jadwal (drag), ubah status, dan master ruangan (kelola oleh admin/kepsek)
- **Master Siswa** — CRUD siswa beserta data referensi (agama, suku, pekerjaan, wilayah, orang tua/wali, sekolah asal)
- **Master Guru, Kelas, Mata Pelajaran** — CRUD; mata pelajaran memiliki KKM per mapel
- **Referensi Penilaian (selaras kurikulum nasional)** — Semester; High Level = Elemen CP, bisa khusus satu mapel atau semua mapel; Aktivitas dengan jenis asesmen (diagnostik/formatif/sumatif); Materi memuat Tujuan Pembelajaran (TP) dan banyak Indikator Ketercapaian TP (IKTP) yang bisa diurutkan dan dinonaktifkan. Indikator dan aktivitas ditambah admin atau guru (guru hanya mapel yang diampu), kepsek melihat saja; indikator dihapus admin dan hanya bila belum pernah dipakai menilai
- **Input Nilai** — filter per periode/kelas/mapel/materi, simpan nilai secara batch (nilai bertanggal), dilengkapi analitik kelas dan riwayat nilai; mode remedial dengan rencana tindak lanjut per siswa; **penilaian per indikator**: satu sesi memilih satu atau lebih indikator (IKTP) materi, termasuk menambah indikator baru di tempat, lalu nilai 0–100 diisi per indikator dan nilai materi = rata-rata indikator yang terisi (mengalir ke STNKM, KKM, dan remedial seperti biasa); predikat capaian mengikuti **KKTP** sekolah (batas Cukup/Baik/Sangat Baik diatur di Pengaturan Sekolah, bawaan 70/80/90; tuntas tetap KKM mapel); remedial per indikator: hanya indikator di bawah KKM yang diulang, nilai remedial = rata-rata indikator setelah perbaikan
- **Jurnal Anekdotal** — catatan kejadian siswa yang dianalisis ke dimensi STNKM (nilai S, T, N, K, M); mode analisis: Heuristik (tanpa AI), Gemini, Qwen, Claude, DeepSeek, dan OpenKey. Jika AI gagal, otomatis fallback ke Heuristik. Dilengkapi tabel analitik, pencarian, ekspor Excel, dan edit jurnal
- **Import Excel** — impor massal nilai dan jurnal dari file Excel (template tersedia beserta lembar referensi siswa); template nilai otomatis memuat satu kolom per indikator aktif materi (judul berkode `[IND-…]`)
- **Presensi** — input kehadiran siswa per tanggal secara batch
- **Proyek (kokurikuler)** — kegiatan kokurikuler pengganti P5 (Permendikdasmen 13/2025): bentuk kegiatan (proyek lintas mapel, 7 Kebiasaan Anak Indonesia Hebat, penguatan intrakurikuler), target **8 Dimensi Profil Lulusan**, catatan proses (dapat dibuat dengan AI), dan ekstraksi predikat dari STNKM. Skala predikat diatur sekolah: 4 tingkat BB/MB/BSH/SB atau 3 tingkat e-Rapor Berkembang/Cakap/Mahir (predikat tetap tersimpan 4 tingkat). Rapor memuat deskripsi capaian dimensi otomatis; tampilan *deskripsi saja* atau *deskripsi + tabel* dipilih saat mencetak
- **Laporan STNKM** — laporan rata-rata STNKM per kelas/siswa dengan grafik tren, detail siswa, dan ekspor multi-halaman
- **Cetak Rapor** — data rapor, catatan wali kelas (dapat dibuat dengan AI), cetak, dan distribusi; deskripsi capaian mapel yang dinilai per indikator disusun dari indikatornya (penguasaan terbaik, perlu bimbingan di bawah KKM, atau perlu peningkatan)
- **WhatsApp (Fonnte)** — kirim pesan otomatis untuk rapor dan presensi lewat gateway Fonnte
- **Dashboard** — dasbor analitik bergaya SaaS dengan grafik (Chart.js) dan menu sidebar berkelompok yang dapat dilipat, dengan pencarian menu (Ctrl+K) dan mode mini
- **Tema** — mode terang/gelap/otomatis dan pilihan warna aksen untuk seluruh aplikasi
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
| GET | `/settings` | Ambil pengaturan sekolah | semua peran | ✔ |
| GET | `/portal/anak` | Data anak (portal) | siswa, ortu | ✔ |
| GET | `/portal/rapor` | Rapor anak (portal) | siswa, ortu | ✔ |
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
| [LoginTest](services/core-api/tests/Feature/LoginTest.php)             | Login, batas percobaan per akun/IP, IP asli di balik proxy tepercaya, masa berlaku token      |

Data uji (sekolah mini: 2 guru, 2 kelas, 2 mapel, 4 siswa, akun tiap peran) dibuat oleh
[MembuatDataSekolah](services/core-api/tests/Concerns/MembuatDataSekolah.php). Jalankan tes sebelum commit,
terutama setelah mengubah controller, aturan akses, atau migrasi.

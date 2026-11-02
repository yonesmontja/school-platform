# School Platform

Platform manajemen sekolah berbasis monorepo: data master (siswa, guru, kelas, mata pelajaran, periode, kategori penilaian, MBK, materi), jadwal pembelajaran, input nilai dengan remedial, jurnal anekdotal dengan analisis STNKM berbasis AI, presensi, projek P5, cetak rapor, laporan STNKM, pengiriman WhatsApp, pengaturan sekolah, manajemen pengguna berbasis peran, portal siswa/orang tua, serta ekspor laporan ke PDF/Excel.

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
| `cloudflared` | Cloudflare named tunnel ke `web` (domain tetap; token `CLOUDFLARE_TUNNEL_TOKEN` di `infra/.env`) | –  |
| `db`        | PostgreSQL 16                     | 5432  |
| `redis`     | Redis 7                           | 6379  |

## Fitur

- **Autentikasi & Peran** — login/logout dengan token Laravel Sanctum (login dibatasi throttle), ganti password di halaman Akun Saya, akun nonaktif ditolak. Lima peran: `admin`, `kepsek`, `guru` (staf) serta `siswa`, `ortu` (portal baca). Guru dibatasi ke mapel yang diampu, kelas binaan, dan data miliknya
- **Manajemen Pengguna** — admin membuat/mengubah/menghapus akun, membuat akun massal (generate), dan reset password
- **Portal Siswa & Orang Tua** — siswa dan orang tua melihat data anak dan rapor miliknya (read-only)
- **Jadwal Pembelajaran** — kalender (FullCalendar) dengan geser-jadwal (drag), ubah status, dan master ruangan (kelola oleh admin/kepsek)
- **Master Siswa** — CRUD siswa beserta data referensi (agama, suku, pekerjaan, wilayah, orang tua/wali, sekolah asal)
- **Master Guru, Kelas, Mata Pelajaran** — CRUD; mata pelajaran memiliki KKM per mapel
- **Master Referensi Penilaian** — CRUD periode, kategori penilaian, MBK, dan materi
- **Input Nilai** — filter per periode/kelas/mapel/materi, simpan nilai secara batch (nilai bertanggal), dilengkapi analitik kelas dan riwayat nilai; mode remedial dengan rencana tindak lanjut per siswa
- **Jurnal Anekdotal** — catatan kejadian siswa yang dianalisis ke dimensi STNKM (nilai S, T, N, K, M); mode analisis: Heuristik (tanpa AI), Gemini, Qwen, Claude, DeepSeek, dan OpenKey. Jika AI gagal, otomatis fallback ke Heuristik. Dilengkapi tabel analitik, pencarian, ekspor Excel, dan edit jurnal
- **Import Excel** — impor massal nilai dan jurnal dari file Excel (template tersedia beserta lembar referensi siswa)
- **Presensi** — input kehadiran siswa per tanggal secara batch
- **Projek P5** — kelola projek & target, catatan proses (dapat dibuat dengan AI), dan ekstraksi nilai
- **Laporan STNKM** — laporan rata-rata STNKM per kelas/siswa dengan grafik tren, detail siswa, dan ekspor multi-halaman
- **Cetak Rapor** — data rapor, catatan wali kelas (dapat dibuat dengan AI), cetak, dan distribusi
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
| POST/PUT/DELETE | `/students, /teachers, /classes, /subjects, /periodes, /kategori-penilaian, /mbk, /materi` | Tambah/ubah/hapus data master | admin | ✔ |
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
| GET | `/p5` | Data projek P5 | staf | ✔ |
| POST | `/p5/proyek` | Tambah projek P5 | staf | ✔ |
| PUT/DELETE | `/p5/proyek/{id}` | Ubah/hapus projek P5 | staf | ✔ |
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
| `/dashboard/master-siswa` | Master Siswa         |
| `/dashboard/master-guru`  | Master Guru          |
| `/dashboard/master-kelas` | Master Kelas         |
| `/dashboard/master-mapel` | Master Mata Pelajaran|
| `/dashboard/master-periode`  | Master Periode    |
| `/dashboard/master-kategori` | Master Kategori Penilaian |
| `/dashboard/master-mbk`   | Master MBK           |
| `/dashboard/master-materi`| Master Materi        |
| `/dashboard/jadwal`       | Jadwal Pembelajaran  |
| `/dashboard/nilai`        | Input Nilai (termasuk mode remedial) |
| `/dashboard/jurnal`       | Jurnal Anekdotal     |
| `/dashboard/presensi`     | Presensi             |
| `/dashboard/p5`           | Projek P5            |
| `/dashboard/import-excel` | Import Excel         |
| `/dashboard/laporan-stnkm`| Laporan STNKM        |
| `/dashboard/rapor`        | Cetak Rapor          |
| `/dashboard/akun`         | Akun Saya            |
| `/dashboard/pengguna`     | Manajemen Pengguna (admin) |
| `/dashboard/pengaturan`   | Pengaturan Sekolah (admin) |
| `/dashboard/portal`       | Portal Siswa/Orang Tua |

## Testing

```bash
cd services/core-api
php artisan test
```

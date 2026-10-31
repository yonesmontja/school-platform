# School Platform

Platform manajemen sekolah berbasis monorepo: data master (siswa, guru, kelas, mata pelajaran, periode, kategori penilaian, MBK, materi), input nilai, jurnal anekdotal dengan analisis STNKM berbasis AI, pengaturan sekolah, serta ekspor laporan ke PDF/Excel.

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

## Fitur

- **Autentikasi** — login/logout dengan token Laravel Sanctum
- **Master Siswa** — CRUD siswa beserta data referensi (agama, suku, pekerjaan, wilayah, orang tua/wali, sekolah asal)
- **Master Guru, Kelas, Mata Pelajaran** — CRUD
- **Master Referensi Penilaian** — CRUD periode, kategori penilaian, MBK, dan materi
- **Input Nilai** — filter per periode/kelas/mapel/materi, simpan nilai secara batch
- **Jurnal Anekdotal** — catatan kejadian siswa yang dianalisis ke dimensi STNKM (nilai S, T, N, K, M); mode analisis: Heuristik (tanpa AI), Gemini, Qwen, Claude, DeepSeek, dan OpenKey. Jika AI gagal, otomatis fallback ke Heuristik
- **Dashboard** — ringkasan statistik (jumlah siswa, guru, kelas, mata pelajaran) dan menu sidebar berkelompok
- **Pengaturan Sekolah** — profil sekolah, tanda tangan, serta API key & model untuk provider AI (diisi di halaman Pengaturan, tersimpan terenkripsi)
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

4. Inisialisasi backend (sekali saja):

   ```bash
   docker compose exec core-api composer install
   docker compose exec core-api php artisan key:generate
   docker compose exec core-api php artisan migrate --seed
   docker compose exec core-api php artisan storage:link
   ```

5. Buka aplikasi:
   - Web: http://localhost:3000
   - API: http://localhost:8000/api
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

> URL API saat ini di-hardcode di [apps/web/app/lib/api.js](apps/web/app/lib/api.js) (`http://localhost:8000/api`).

### AI Engine (Django)

```bash
cd services/ai-engine
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
python manage.py runserver 8001
```

## Akun default

Setelah `php artisan migrate --seed`, tersedia akun:

| Email               | Password      |
|---------------------|---------------|
| `admin@sekolah.com` | `password123` |

Seeder bersifat idempoten, jadi `php artisan db:seed` aman dijalankan ulang.

## Endpoint API

Base URL: `http://localhost:8000/api`

| Method | Endpoint                    | Keterangan                          | Auth |
|--------|-----------------------------|-------------------------------------|------|
| POST   | `/register`                 | Registrasi user                     | –    |
| POST   | `/login`                    | Login, mengembalikan token          | –    |
| POST   | `/logout`                   | Logout                              | ✔    |
| GET    | `/user`                     | Data user yang sedang login         | ✔    |
| GET    | `/students/master-data`     | Data referensi untuk form siswa     | ✔    |
| *      | `/students`                 | CRUD siswa (apiResource)            | ✔    |
| *      | `/teachers`                 | CRUD guru (apiResource)             | ✔    |
| *      | `/classes`                  | CRUD kelas (apiResource)            | ✔    |
| *      | `/subjects`                 | CRUD mata pelajaran (apiResource)   | ✔    |
| GET    | `/settings`                 | Ambil pengaturan sekolah            | ✔    |
| POST   | `/settings`                 | Simpan pengaturan sekolah           | ✔    |
| GET    | `/signature/{filename}`     | Gambar tanda tangan (proxy CORS)    | –    |
| GET    | `/nilai/filters`            | Opsi filter input nilai             | ✔    |
| GET    | `/nilai/materi`             | Materi berdasarkan konteks filter   | ✔    |
| GET    | `/nilai/students`           | Daftar siswa beserta nilainya       | ✔    |
| POST   | `/nilai/batch`              | Simpan nilai secara batch           | ✔    |
| *      | `/periodes`                 | CRUD periode (apiResource)          | ✔    |
| *      | `/kategori-penilaian`       | CRUD kategori penilaian (apiResource) | ✔  |
| *      | `/mbk`                      | CRUD MBK (tanpa show)               | ✔    |
| GET    | `/materi/by-context`        | Materi berdasarkan konteks          | ✔    |
| *      | `/materi`                   | CRUD materi (tanpa show)            | ✔    |
| GET    | `/jurnal`                   | Daftar jurnal anekdotal             | ✔    |
| POST   | `/jurnal/analyze`           | Analisis narasi (STNKM) dengan AI   | ✔    |
| POST   | `/jurnal/store`             | Simpan jurnal                       | ✔    |
| DELETE | `/jurnal/{id}`              | Hapus jurnal                        | ✔    |

Endpoint bertanda ✔ memerlukan header `Authorization: Bearer <token>`.

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
| `/dashboard/nilai`        | Input Nilai          |
| `/dashboard/jurnal`       | Jurnal Anekdotal     |
| `/dashboard/pengaturan`   | Pengaturan Sekolah   |

## Testing

```bash
cd services/core-api
php artisan test
```

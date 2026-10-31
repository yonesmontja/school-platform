---
name: update-readme
description: Cek README.md dan perbarui sesuai perubahan aplikasi sejak README terakhir diubah (fitur, endpoint API, halaman web, arsitektur, cara setup). Panggil dengan /update-readme; tambahkan argumen "push" agar hasilnya langsung di-commit dan di-push.
---

# Update README

Tugas: pastikan `README.md` di root repo mencerminkan kondisi aplikasi **saat ini**. README ditulis dalam Bahasa Indonesia; pertahankan gaya, urutan bagian, dan format tabel yang sudah ada.

## 1. Cari perubahan sejak README terakhir diperbarui

```bash
git log -1 --format=%H -- README.md          # commit terakhir yang menyentuh README
git log --oneline <hash>..HEAD               # commit setelahnya
git diff --stat <hash>..HEAD                 # file yang berubah
git status --short                           # perubahan yang belum di-commit (abaikan, jangan didokumentasikan)
```

Jika tidak ada commit baru yang relevan (hanya perubahan kecil, refactor, atau dokumen), **berhenti** dan laporkan "README sudah up to date". Jangan membuat commit kosong atau mengubah README hanya demi berubah.

## 2. Bandingkan README dengan sumber kebenaran

Baca file sumber berikut, jangan mengandalkan pesan commit saja:

| Bagian README | Sumber kebenaran |
|---|---|
| Arsitektur, port, layanan | `infra/docker-compose.yml`, `apps/web/package.json`, `services/core-api/composer.json`, `services/ai-engine/requirements.txt` |
| Fitur | commit `feat:` + halaman di `apps/web/app/dashboard/**/page.js` + controller di `services/core-api/app/Http/Controllers/Api/` |
| Endpoint API | `services/core-api/routes/api.php` — perhatikan route mana yang berada di dalam grup `auth:sanctum` (kolom Auth ✔) |
| Halaman Web | folder di `apps/web/app/dashboard/` dan menu di `apps/web/app/dashboard/layout.js` |
| Setup / env | `.env.example`, migrasi baru di `services/core-api/database/migrations/`, langkah artisan baru |
| Akun default | `services/core-api/database/seeders/` |

Periksa setiap baris tabel endpoint dan halaman: tambahkan yang baru, hapus yang sudah tidak ada, perbaiki kolom Auth yang berubah.

## 3. Edit README

- Ubah hanya bagian yang memang tidak akurat; jangan menulis ulang bagian yang masih benar.
- Fitur dijelaskan singkat (satu baris per fitur) dengan format `- **Nama** — penjelasan`.
- Untuk fitur AI: sebutkan provider yang didukung dan bahwa API key diisi di halaman Pengaturan (tersimpan terenkripsi). **Jangan pernah** menulis API key, password asli, token, atau isi `.env` ke README.
- Jangan mendokumentasikan perubahan yang belum di-commit.

## 4. Commit (dan push jika diminta)

Commit hanya `README.md`:

```bash
git add README.md
git commit -m "docs: update README for <ringkasan singkat perubahan>" -m "<daftar bagian yang diperbarui>"
```

Akhiri pesan commit dengan baris atribusi yang berlaku di sesi ini.

- Tanpa argumen: commit lokal saja, lalu tampilkan diff dan pesan commit ke user.
- Argumen `push`: setelah commit, `git pull --rebase origin main` lalu `git push origin main`. Jika rebase konflik atau push ditolak, batalkan (`git rebase --abort`) dan laporkan; jangan force push.
- Jika ada perubahan lain yang belum di-commit di working tree, jangan ikut di-stage.

## 5. Laporan

Tutup dengan ringkasan singkat dalam Bahasa Indonesia: commit apa saja yang ditinjau, bagian README yang diubah, dan hash commit (atau "tidak ada perubahan").

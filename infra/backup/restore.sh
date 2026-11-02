#!/bin/sh
# Pulihkan database dari file backup. Data saat ini DITIMPA, jadi perlu konfirmasi "YA".
#
#   docker compose exec db-backup sh /backup/restore.sh /backups/harian/db_2026-11-02_0100.dump YA
#
# Sebelum menimpa, kondisi database saat ini dibackup dulu sebagai pengaman.
set -eu

file=${1:-}
if [ -z "$file" ] || [ ! -f "$file" ]; then
  echo "Pakai: sh /backup/restore.sh /backups/<harian|bulanan>/db_<tanggal>.dump YA"
  echo "Backup yang tersedia:"
  ls -1 /backups/harian/db_* /backups/bulanan/db_* 2>/dev/null || echo "  (belum ada)"
  exit 1
fi

pg_restore -l "$file" > /dev/null || { echo "File bukan arsip pg_dump yang valid: $file"; exit 1; }

if [ "${2:-}" != "YA" ]; then
  echo "Database '$PGDATABASE' akan DITIMPA dengan isi $file."
  echo "Jalankan ulang dengan argumen YA di akhir untuk melanjutkan."
  exit 1
fi

echo "Membuat backup pengaman kondisi saat ini..."
sh /backup/backup.sh sekarang

echo "Memulihkan $file ..."
# Satu transaksi: bila gagal di tengah jalan, database kembali seperti semula
pg_restore --clean --if-exists --no-owner --single-transaction -d "$PGDATABASE" "$file"
echo "Selesai. File unggahan dipulihkan terpisah dari storage_<tanggal>.tar.gz (lihat README)."

#!/bin/sh
# Backup otomatis database (pg_dump) dan file unggahan (tanda tangan, lampiran jadwal/jurnal).
#
#   sh /backup/backup.sh            → berjalan terus: tiap 10 menit cek apakah backup hari ini sudah ada
#   sh /backup/backup.sh sekarang   → buat satu backup saat ini juga
#
# Komputer sekolah belum tentu menyala tengah malam, jadi backup tidak menunggu jam tertentu:
# begitu lewat BACKUP_HOUR dan backup hari ini belum ada, backup langsung dibuat.
set -eu

DIR=/backups
KEEP_DAYS=${BACKUP_KEEP_DAYS:-14}
KEEP_MONTHS=${BACKUP_KEEP_MONTHS:-12}
JAM=${BACKUP_HOUR:-1}

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }

backup_sekarang() {
  stamp=$(date +%Y-%m-%d_%H%M)
  mkdir -p "$DIR/harian" "$DIR/bulanan"
  db="$DIR/harian/db_$stamp.dump"
  files="$DIR/harian/storage_$stamp.tar.gz"

  # Tulis ke file sementara dulu agar backup setengah jadi tidak dianggap backup sah
  if ! pg_dump -Fc -Z 6 -f "$db.tmp"; then
    rm -f "$db.tmp"; log "GAGAL: pg_dump"; return 1
  fi
  # Pastikan arsip bisa dibaca kembali sebelum disimpan
  if ! pg_restore -l "$db.tmp" > /dev/null; then
    rm -f "$db.tmp"; log "GAGAL: arsip database rusak"; return 1
  fi
  mv "$db.tmp" "$db"

  if ! tar -czf "$files.tmp" -C /storage .; then
    rm -f "$files.tmp"; log "GAGAL: arsip file unggahan"; return 1
  fi
  mv "$files.tmp" "$files"

  # Salinan pertama tiap bulan disimpan lebih lama
  bulan=$(date +%Y-%m)
  if ! ls "$DIR/bulanan/db_$bulan"-* > /dev/null 2>&1; then
    cp "$db" "$files" "$DIR/bulanan/"
    log "Salinan bulanan $bulan disimpan"
  fi

  find "$DIR/harian" -type f \( -name 'db_*' -o -name 'storage_*' \) -mtime +"$KEEP_DAYS" -delete
  find "$DIR/bulanan" -type f \( -name 'db_*' -o -name 'storage_*' \) -mtime +"$((KEEP_MONTHS * 31))" -delete

  log "Backup selesai: $(basename "$db") ($(du -h "$db" | cut -f1)), $(basename "$files") ($(du -h "$files" | cut -f1))"
}

if [ "${1:-}" = "sekarang" ]; then
  backup_sekarang
  exit $?
fi

log "Layanan backup aktif: harian setelah jam $JAM, simpan $KEEP_DAYS hari + $KEEP_MONTHS bulan, folder $DIR"
until pg_isready -q; do sleep 5; done
while true; do
  if [ "$(date +%-H)" -ge "$JAM" ] && ! ls "$DIR/harian/db_$(date +%Y-%m-%d)"_* > /dev/null 2>&1; then
    # Gagal hari ini dicoba lagi pada pengecekan berikutnya
    backup_sekarang || true
  fi
  sleep 600
done

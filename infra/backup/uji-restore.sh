#!/bin/sh
# Uji restore: pulihkan backup database terbaru ke database sementara, bandingkan jumlah baris
# tabel utama dengan database asli, lalu hapus database sementara. Database asli tidak disentuh.
#
#   docker exec school_db_backup sh /backup/uji-restore.sh            → backup harian terbaru
#   docker exec school_db_backup sh /backup/uji-restore.sh <file>     → file tertentu
set -eu

UJI=school_platform_uji_restore
FILE=${1:-$(ls -1t /backups/harian/db_*.dump | head -n 1)}
[ -f "$FILE" ] || { echo "File backup tidak ditemukan: $FILE"; exit 1; }

echo "Menguji $(basename "$FILE") ..."
dropdb --if-exists "$UJI"
createdb "$UJI"
trap 'dropdb --if-exists "$UJI"' EXIT
pg_restore --no-owner --no-privileges -d "$UJI" "$FILE"

hasil=0
for t in users students teachers classes trans_nilai trans_presensi trans_jurnal log_aktivitas; do
  asli=$(psql -tAc "select count(*) from $t" "$PGDATABASE" 2>/dev/null || echo "-")
  pulih=$(psql -tAc "select count(*) from $t" "$UJI" 2>/dev/null || echo "-")
  status=OK
  # Database asli bisa bertambah sejak backup dibuat; yang dicek: hasil pulih terbaca dan tidak melebihi asli
  if [ "$pulih" = "-" ]; then status=GAGAL; hasil=1
  elif [ "$asli" != "-" ] && [ "$pulih" -gt "$asli" ]; then status=ANEH; fi
  printf '%-16s asli=%-7s pulih=%-7s %s\n' "$t" "$asli" "$pulih" "$status"
done

[ "$hasil" -eq 0 ] && echo "UJI RESTORE BERHASIL" || echo "UJI RESTORE GAGAL"
exit "$hasil"

#!/bin/sh
# Gladi Tutup Semester pada SALINAN data asli. Database utama tidak disentuh.
#
#   sh infra/gladi-tutup-semester.sh                         → backup baru, salin, gladi, hapus salinan
#   sh infra/gladi-tutup-semester.sh --simpan                → salinan school_platform_gladi dibiarkan untuk diperiksa
#   sh infra/gladi-tutup-semester.sh --tanggal-mulai=2027-01-04 --tanggal-selesai=2027-06-19
#   sh infra/gladi-tutup-semester.sh --tanpa-jadwal          → tanpa menyalin pola jadwal mingguan
#
# Langkah: 1) backup baru DB utama (dibaca saja) dan periksa dump-nya, 2) pulihkan ke database terpisah
# school_platform_gladi, 3) jalankan `php artisan semester:gladi` dengan DB_DATABASE diarahkan ke salinan
# (cache & antrean Laravel ada di database, jadi ikut ke salinan), 4) hapus salinan (kecuali --simpan).
# Keluar dengan kode 1 bila ada pemeriksaan yang gagal.
set -eu

GLADI=school_platform_gladi
SIMPAN=0
OPSI=""
for a in "$@"; do
  case "$a" in
    --simpan) SIMPAN=1 ;;
    --tanggal-mulai=*|--tanggal-selesai=*|--tanpa-jadwal) OPSI="$OPSI $a" ;;
    *) echo "Opsi tidak dikenal: $a"; exit 2 ;;
  esac
done

bk() { MSYS_NO_PATHCONV=1 docker exec school_db_backup "$@"; }
hapus() { [ "$SIMPAN" = 1 ] || bk dropdb --if-exists "$GLADI" > /dev/null 2>&1 || true; }
trap hapus EXIT

echo "== 1. Backup baru database utama"
bk sh /backup/backup.sh sekarang | tail -1
DUMP=$(bk sh -c 'ls -t /backups/harian/db_*.dump | head -1')
TABEL=$(bk pg_restore -l "$DUMP" | grep -c "TABLE DATA" || true)
echo "   $DUMP: $TABEL tabel berisi data"
if [ "$TABEL" -lt 50 ]; then echo "Dump tampak tidak lengkap; gladi dibatalkan."; exit 1; fi

echo "== 2. Salin ke database $GLADI"
bk dropdb --if-exists "$GLADI"
bk createdb "$GLADI"
bk pg_restore --no-owner --no-privileges -d "$GLADI" "$DUMP"
echo "   $(bk psql -d "$GLADI" -tAc 'select count(*) from students') siswa di salinan"

echo "== 3. Gladi"
set +e
# shellcheck disable=SC2086
MSYS_NO_PATHCONV=1 docker exec -e DB_DATABASE="$GLADI" school_core_api php artisan semester:gladi $OPSI
HASIL=$?
set -e

if [ "$SIMPAN" = 1 ]; then
  echo "== Salinan $GLADI dibiarkan. Hapus bila sudah selesai: docker exec school_db_backup dropdb $GLADI"
else
  echo "== 4. Salinan dihapus. Database utama tidak berubah."
fi
exit $HASIL

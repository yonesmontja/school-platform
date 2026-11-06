#!/bin/sh
# Terbitkan perubahan ke situs publik (web.saprapor.com) setelah dicek di jalur kerja (localhost:3001).
#
#   sh infra/terbitkan.sh           → tes backend + tes alur web, build web produksi, muat ulang API & scheduler
#   sh infra/terbitkan.sh --lengkap → seperti di atas, ditambah semua halaman di desktop & HP (±10 menit)
#   sh infra/terbitkan.sh --cepat   → tanpa tes (mis. hanya ubah teks)
set -eu
cd "$(dirname "$0")"

if [ "${1:-}" != "--cepat" ]; then
  echo "== Tes backend"
  MSYS_NO_PATHCONV=1 docker exec school_core_api php artisan test

  # Tes web (tests/web) memakai jalur kerja :3001 dan API tes berisi sekolah fiktif
  echo "== Tes web"
  docker compose --profile dev up -d web-dev
  [ -d ../tests/web/node_modules ] || (cd ../tests/web && npm ci --no-audit --no-fund && npx playwright install chromium)
  if [ "${1:-}" = "--lengkap" ]; then
    (cd ../tests/web && npx playwright test)
  else
    (cd ../tests/web && npx playwright test --project=desktop tes/masuk.spec.js tes/alur.spec.js tes/offline.spec.js)
  fi
fi

echo "== Build web produksi"
docker compose build web
docker compose up -d web

echo "== Muat ulang API & scheduler (perubahan .env/konfigurasi ikut terbaca)"
docker compose up -d core-api scheduler
docker compose restart core-api scheduler

echo "== Selesai. Situs publik memakai versi terbaru."

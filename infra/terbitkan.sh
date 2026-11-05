#!/bin/sh
# Terbitkan perubahan ke situs publik (web.saprapor.com) setelah dicek di jalur kerja (localhost:3001).
#
#   sh infra/terbitkan.sh          → tes backend, build web produksi, muat ulang API & scheduler
#   sh infra/terbitkan.sh --cepat  → tanpa tes (mis. hanya ubah teks)
set -eu
cd "$(dirname "$0")"

if [ "${1:-}" != "--cepat" ]; then
  echo "== Tes backend"
  MSYS_NO_PATHCONV=1 docker exec school_core_api php artisan test
fi

echo "== Build web produksi"
docker compose build web
docker compose up -d web

echo "== Muat ulang API & scheduler (perubahan .env/konfigurasi ikut terbaca)"
docker compose up -d core-api scheduler
docker compose restart core-api scheduler

echo "== Selesai. Situs publik memakai versi terbaru."

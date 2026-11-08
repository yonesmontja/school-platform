#!/bin/sh
# Terbitkan perubahan ke situs publik (web.saprapor.com) setelah dicek di jalur kerja (localhost:3001).
#
#   sh infra/terbitkan.sh           → tes backend + tes alur web, build web produksi, muat ulang API & scheduler
#   sh infra/terbitkan.sh --lengkap → seperti di atas, ditambah semua halaman di desktop & HP
#   sh infra/terbitkan.sh --cepat   → tanpa tes (mis. hanya ubah teks)
#   sh infra/terbitkan.sh --uji     → build & tes saja, situs publik tidak diubah
#
# Agar singkat, tes backend berjalan bersamaan dengan build web, lalu tes web dijalankan pada build
# produksi yang baru (wadah sementara di :3002, halamannya sudah terkompilasi) sebelum menggantikan situs.
set -eu
cd "$(dirname "$0")"

UJI=school_web_uji
LOG_BACKEND=$(mktemp)
bersihkan() { docker rm -f "$UJI" > /dev/null 2>&1 || true; rm -f "$LOG_BACKEND"; }
trap bersihkan EXIT

if [ "${1:-}" != "--cepat" ]; then
  echo "== Tes backend (berjalan di latar belakang)"
  (MSYS_NO_PATHCONV=1 docker exec school_core_api php artisan test > "$LOG_BACKEND" 2>&1; echo $? >> "$LOG_BACKEND") &
  PID_BACKEND=$!
fi

echo "== Build web produksi"
docker compose build -q web

if [ "${1:-}" != "--cepat" ]; then
  # Tes web (tests/web): build baru di :3002, semua /api dialihkan ke API tes berisi sekolah fiktif
  echo "== Tes web pada build baru"
  docker rm -f "$UJI" > /dev/null 2>&1 || true
  docker run -d --name "$UJI" -p 127.0.0.1:3002:3000 infra-web > /dev/null
  [ -d ../tests/web/node_modules ] || (cd ../tests/web && npm ci --no-audit --no-fund && npx playwright install chromium)
  if [ "${1:-}" = "--lengkap" ]; then
    (cd ../tests/web && WEB_URL=http://localhost:3002 npx playwright test --reporter=dot)
  else
    (cd ../tests/web && WEB_URL=http://localhost:3002 npx playwright test --reporter=dot --project=desktop tes/masuk.spec.js tes/alur.spec.js tes/offline.spec.js tes/banksoal.spec.js tes/perangkatajar.spec.js tes/pemakaian.spec.js)
  fi

  echo "== Menunggu tes backend"
  wait "$PID_BACKEND" || true
  grep -E "Tests:|FAIL" "$LOG_BACKEND" | tail -3
  if [ "$(tail -1 "$LOG_BACKEND")" != "0" ]; then
    cat "$LOG_BACKEND"
    echo "== Tes backend gagal; situs publik tidak diubah."
    exit 1
  fi
fi

if [ "${1:-}" = "--uji" ]; then
  echo "== Semua tes lulus (situs publik tidak diubah)."
  exit 0
fi

echo "== Ganti situs publik dengan build baru"
docker compose up -d web

echo "== Muat ulang API & scheduler (perubahan .env/konfigurasi ikut terbaca)"
docker compose up -d core-api scheduler
docker compose restart core-api scheduler

echo "== Selesai. Situs publik memakai versi terbaru."

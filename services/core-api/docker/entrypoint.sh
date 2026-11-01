#!/bin/sh
set -e

# vendor/ ada di named volume (bukan bind mount Windows) agar Laravel tidak lambat.
# composer install hanya dijalankan bila composer.lock berubah sejak install terakhir,
# supaya API langsung siap saat container start (tanpa jeda beberapa menit).
STAMP=vendor/.composer-lock.sha1
LOCK_HASH=$(sha1sum composer.lock | cut -d' ' -f1)

if [ ! -f vendor/autoload.php ] || [ "$(cat "$STAMP" 2>/dev/null)" != "$LOCK_HASH" ]; then
  composer install --no-interaction --prefer-dist --optimize-autoloader
  echo "$LOCK_HASH" > "$STAMP"
else
  echo "Dependensi sesuai composer.lock, composer install dilewati."
fi

exec "$@"

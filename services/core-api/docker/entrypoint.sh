#!/bin/sh
set -e

# vendor/ ada di named volume (bukan bind mount Windows) agar Laravel tidak lambat.
# composer install di sini menyamakan isinya dengan composer.lock setiap container start.
composer install --no-interaction --prefer-dist --optimize-autoloader

exec "$@"

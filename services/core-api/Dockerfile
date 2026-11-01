FROM php:8.3-cli
RUN apt-get update && apt-get install -y git unzip libpq-dev \
    && docker-php-ext-install pdo pdo_pgsql opcache
COPY --from=composer:latest /usr/bin/composer /usr/bin/composer
COPY docker/php.ini /usr/local/etc/php/conf.d/zz-performance.ini
COPY docker/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh
WORKDIR /var/www/html

# Isi awal volume vendor; autoloader & package discovery dibuat ulang di entrypoint
COPY composer.json composer.lock ./
RUN composer install --no-interaction --prefer-dist --no-scripts --no-autoloader

# Built-in server PHP hanya melayani 1 request sekaligus; worker membuat request halaman berjalan paralel
ENV PHP_CLI_SERVER_WORKERS=4
EXPOSE 8000
ENTRYPOINT ["entrypoint.sh"]
# --no-reload wajib agar PHP_CLI_SERVER_WORKERS dipakai; perubahan .env perlu restart container
CMD ["php", "artisan", "serve", "--host=0.0.0.0", "--port=8000", "--no-reload"]

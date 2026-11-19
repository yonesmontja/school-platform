#!/bin/sh
# Membuat APK Android SAPrapor (TWA, Trusted Web Activity) dari twa-manifest.json.
# Aplikasi membuka https://web.saprapor.com dalam layar penuh, jadi perubahan web langsung berlaku tanpa APK baru.
# APK baru hanya perlu bila ikon, nama, warna, atau pengaturan Android di twa-manifest.json berubah
# (naikkan appVersionCode & appVersion dulu agar HP mau memperbarui).
#
# Alat (di luar repo): JDK 17 + Android SDK di D:/Tools/saprapor-android (dicatat di ~/.bubblewrap/config.json),
# Bubblewrap CLI di D:/Tools/saprapor-android/bubblewrap, kunci tanda tangan + sandi di D:/Tools/saprapor-android/kunci.
# Kunci yang sama wajib dipakai selamanya; sidik SHA-256-nya ada di apps/web/public/.well-known/assetlinks.json.
set -e
cd "$(dirname "$0")"
ALAT=D:/Tools/saprapor-android
SANDI=$(cat "$ALAT/kunci/sandi.txt")
export BUBBLEWRAP_KEYSTORE_PASSWORD="$SANDI" BUBBLEWRAP_KEY_PASSWORD="$SANDI" JAVA_HOME="$ALAT/jdk17"
# Cache unduhan Gradle ikut di drive D
export GRADLE_USER_HOME="$ALAT/gradle"
BW="$ALAT/bubblewrap/node_modules/.bin/bubblewrap"
# cmd.exe di sebagian lingkungan tidak mencari program di folder kerja; gradlew.bat ada di folder ini
export PATH="$(pwd):/d/Tools/saprapor-android/jdk17/bin:$PATH"

# Proyek Android dibuat ulang dari twa-manifest.json (hasilnya tidak disimpan di git)
"$BW" update --skipVersionUpgrade --manifest=./twa-manifest.json
"$BW" build --skipPwaValidation --manifest=./twa-manifest.json

VERSI=$(node -e "console.log(require('./twa-manifest.json').appVersion)")
mkdir -p ../web/public/unduh
cp app-release-signed.apk "../web/public/unduh/saprapor-android.apk"
# Info versi untuk halaman unduhan /android
node -e "const m=require('./twa-manifest.json'),fs=require('fs');fs.writeFileSync('../web/public/unduh/saprapor-android.json',JSON.stringify({versi:m.appVersion,kode:m.appVersionCode,ukuran_kb:Math.round(fs.statSync('app-release-signed.apk').size/1024),tanggal:new Date().toISOString().slice(0,10),min_android:'7.0'},null,2)+'\n')"
echo "== APK v$VERSI siap: apps/web/public/unduh/saprapor-android.apk (terbit bersama web lewat infra/terbitkan.sh)"

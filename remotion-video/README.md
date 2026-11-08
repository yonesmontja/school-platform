# Video Belajar (Remotion)

Motion graphic media belajar untuk anak SD yang belajar lewat gambar, dibuat dengan [Remotion](https://www.remotion.dev).

## Menjalankan

```sh
cd remotion-video
npm install          # sekali saja
npm run studio       # Studio di http://localhost:3003 (3000/3001 aplikasi, 3002 uji saat terbit)
```

## Membuat video (jalur A: dibuatkan Claude)

1. Minta Claude membuat komposisi baru di `src/` (mis. "video bagian tumbuhan untuk kelas 4, 1–2 menit") dan
   mendaftarkannya di `src/Root.tsx`.
2. Periksa di Studio, lalu render:
   `npx remotion render src/index.ts <NamaKomposisi> out/<nama>.mp4`
3. Unggah `out/<nama>.mp4` di aplikasi: **Video Belajar → Unggah video**, Asal video = *Motion graphic*,
   isi nama komposisi. Ajukan ke kepala sekolah; setelah disetujui, tautkan ke modul ajar, sesi jadwal, atau soal.

Pedoman: tulisan sesedikit mungkin dan besar, gerak pelan, satu gagasan per adegan, 720p (ukuran ~5–10 MB untuk 1–2 menit).

## Lisensi

Remotion gratis untuk perorangan, organisasi nirlaba, dan perusahaan kecil; organisasi lebih besar memerlukan
lisensi perusahaan. Pastikan status sekolah di https://www.remotion.dev/license.

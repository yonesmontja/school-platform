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

## Templat bersama (jalur B) & suara

- Templat guru ada di `apps/web/components/video/templat` dan tampil di Studio sebagai `Templat-…`. Mengubah
  templat di sana mengubah pratinjau di aplikasi, layanan render server, dan Studio sekaligus.
- Narasi video khusus dibuat dengan Piper (suara Indonesia) memakai image layanan render, contoh untuk Siklus Air:
  teks per baris di `public/narasi/siklus-air/teks.txt` → `s1.wav … s8.wav` + `durasi.json` (lihat riwayat commit).
- Video contoh jalur A: `SiklusAir` (±75 detik, narasi Piper), `PecahanKue`.
- Suara Piper `id_ID-news_tts-medium`: lisensi data latihnya tidak dicantumkan jelas di model card; dipakai untuk
  pendidikan nirlaba. Untuk suara yang lebih natural atau klon suara guru, isi API key ElevenLabs/Gemini di Pengaturan.

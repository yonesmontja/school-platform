// Ikon aplikasi dari logo sekolah: dibuat di peramban (tanpa pustaka gambar di server) dalam ukuran yang dipakai
// favicon, manifest PWA, dan apple-touch-icon. Nama sama dengan ikon bawaan di public/icons, dan disajikan lewat
// /api/ikon-aplikasi/<nama>.png yang otomatis kembali ke ikon bawaan bila admin mematikannya.

// sisi (px), jarak tepi (proporsi sisi), dan latar; maskable memakai zona aman 80% → logo di 60% tengah
const UKURAN = {
  "favicon-32": { sisi: 32, tepi: 0, latar: null },
  "apple-touch-icon": { sisi: 180, tepi: 0.1, latar: "#ffffff" },
  "icon-192": { sisi: 192, tepi: 0.06, latar: null },
  "icon-512": { sisi: 512, tepi: 0.06, latar: null },
  "icon-maskable-512": { sisi: 512, tepi: 0.2, latar: "#ffffff" },
};

const muatGambar = (src) => new Promise((ok, gagal) => {
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.onload = () => ok(img);
  img.onerror = () => gagal(new Error("Logo sekolah tidak bisa dimuat untuk dibuat ikon."));
  img.src = src;
});

/** @returns {Promise<Record<string,string>>} nama → data URL PNG persegi */
export async function buatIkonDariLogo(srcLogo) {
  const img = await muatGambar(srcLogo);
  const hasil = {};
  for (const [nama, { sisi, tepi, latar }] of Object.entries(UKURAN)) {
    const kanvas = document.createElement("canvas");
    kanvas.width = kanvas.height = sisi;
    const ctx = kanvas.getContext("2d");
    ctx.imageSmoothingQuality = "high";
    if (latar) { ctx.fillStyle = latar; ctx.fillRect(0, 0, sisi, sisi); }
    const ruang = sisi * (1 - 2 * tepi);
    const skala = Math.min(ruang / img.naturalWidth, ruang / img.naturalHeight);
    const w = img.naturalWidth * skala, h = img.naturalHeight * skala;
    ctx.drawImage(img, (sisi - w) / 2, (sisi - h) / 2, w, h);
    hasil[nama] = kanvas.toDataURL("image/png");
  }
  return hasil;
}

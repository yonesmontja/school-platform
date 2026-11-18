// app/lib/foto.js — bantuan foto di browser (dipakai editor catatan dan formulir SPMB publik)

/** Perkecil foto di browser (sisi terpanjang 1600 px, JPEG) agar hemat kuota internet sekolah. GIF dikirim apa adanya. */
export async function kecilkanFoto(file, maks = 1600) {
  if (!file.type.startsWith("image/") || file.type === "image/gif") return file;
  try {
    const bmp = await createImageBitmap(file);
    const skala = Math.min(1, maks / Math.max(bmp.width, bmp.height));
    if (skala === 1 && file.size < 1.5 * 1024 * 1024) return file;
    const kanvas = document.createElement("canvas");
    kanvas.width = Math.round(bmp.width * skala); kanvas.height = Math.round(bmp.height * skala);
    kanvas.getContext("2d").drawImage(bmp, 0, 0, kanvas.width, kanvas.height);
    const blob = await new Promise((ok) => kanvas.toBlob(ok, "image/jpeg", 0.85));
    return blob ? new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" }) : file;
  } catch (e) { return file; }
}

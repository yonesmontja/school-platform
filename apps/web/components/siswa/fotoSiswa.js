"use client";
// Pas foto siswa: alamat tampil (tautan bertanda tangan dari API), unduh, unggah, hapus, dan pengolahan gambar di peramban.
import { API_URL, authHeaders } from "@/app/lib/akses";
import { API_ORIGIN } from "@/app/lib/config";

/** foto_url dari API berupa path relatif bertanda tangan ("/api/siswa/X/foto?..."); tempelkan ke asal API. */
export const srcFoto = (url) => (url ? `${API_ORIGIN}${url}` : null);

export const UKURAN = { w: 600, h: 800 }; // keluaran pas foto 3 × 4
export const MAKS_SUMBER = 1600; // sisi terpanjang foto kerja di editor
export const MAKS_ASLI = 2400; // sisi terpanjang foto asli yang disimpan

const namaAman = (nama) => String(nama || "siswa").replace(/[\\/:*?"<>|]+/g, " ").trim();

export function unduhBlob(blob, nama) {
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), { href: url, download: nama });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** Unduh pas foto tersimpan sebagai berkas "Pas foto <nama>.jpg". */
export async function unduhFoto(siswa) {
  const res = await fetch(srcFoto(siswa.foto_url));
  if (!res.ok) throw new Error("Foto tidak bisa diunduh. Muat ulang halaman lalu coba lagi.");
  const blob = await res.blob();
  const ext = blob.type === "image/png" ? "png" : blob.type === "image/webp" ? "webp" : "jpg";
  unduhBlob(blob, `Pas foto ${namaAman(siswa.nama_siswa)}.${ext}`);
}

async function kirim(method, path, form) {
  const res = await fetch(`${API_URL}${path}`, { method, headers: authHeaders(false), body: form });
  if (res.status === 401) { window.location.href = "/login"; throw new Error("Sesi berakhir, silakan masuk lagi."); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data.errors && Object.values(data.errors)[0]?.[0]) || data.message || `Gagal (status ${res.status}).`);
  return data;
}

export const simpanFoto = (idSiswa, foto, asli) => {
  const f = new FormData();
  f.append("foto", foto, "pas.jpg");
  if (asli) f.append("asli", asli, asli.name || "asli.jpg");
  return kirim("POST", `/siswa/${encodeURIComponent(idSiswa)}/foto`, f);
};

export const hapusFoto = (idSiswa) => kirim("DELETE", `/siswa/${encodeURIComponent(idSiswa)}/foto`);

export const editFotoAI = (idSiswa, foto, perintah, aiMode) => {
  const f = new FormData();
  f.append("foto", foto, "pas.jpg");
  f.append("perintah", perintah);
  f.append("ai_mode", aiMode);
  f.append("setuju", "1");
  return kirim("POST", `/siswa/${encodeURIComponent(idSiswa)}/foto/ai`, f);
};

/** Foto asli tersimpan (untuk diedit ulang) sebagai Blob. */
export async function ambilAsli(idSiswa) {
  const res = await fetch(`${API_URL}/siswa/${encodeURIComponent(idSiswa)}/foto/asli`, { headers: authHeaders(false) });
  if (!res.ok) throw new Error("Foto asli tidak bisa dimuat.");
  return res.blob();
}

/** Blob/File/data URL → kanvas, diperkecil agar sisi terpanjang ≤ maks (orientasi EXIF diikuti peramban). */
export async function keKanvas(sumber, maks = MAKS_SUMBER) {
  const blob = typeof sumber === "string" ? await (await fetch(sumber)).blob() : sumber;
  let gambar;
  try {
    gambar = await createImageBitmap(blob, { imageOrientation: "from-image" });
  } catch (e) {
    gambar = await new Promise((ok, gagal) => {
      const img = new Image();
      img.onload = () => ok(img);
      img.onerror = () => gagal(new Error("Berkas ini bukan gambar yang bisa dibuka."));
      img.src = URL.createObjectURL(blob);
    });
  }
  const w0 = gambar.width, h0 = gambar.height;
  const skala = Math.min(1, maks / Math.max(w0, h0));
  const c = document.createElement("canvas");
  c.width = Math.round(w0 * skala);
  c.height = Math.round(h0 * skala);
  c.getContext("2d").drawImage(gambar, 0, 0, c.width, c.height);
  gambar.close?.();
  return c;
}

export const keBlob = (canvas, tipe = "image/jpeg", mutu = 0.92) =>
  new Promise((ok) => canvas.toBlob((b) => ok(b), tipe, mutu));

/**
 * Gambar pas foto: sumber ditutupkan (cover) ke bingkai 3 × 4, lalu digeser, diperbesar, diputar, dan difilter.
 * atur = { zoom, x, y (piksel keluaran), putar (derajat), terang, kontras, saturasi (-100..100), hitamPutih }
 */
export function gambarPasFoto(canvas, sumber, atur) {
  const { w, h } = { w: canvas.width, h: canvas.height };
  const ctx = canvas.getContext("2d");
  ctx.save();
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  const skala = (w / UKURAN.w);
  ctx.translate(w / 2 + atur.x * skala, h / 2 + atur.y * skala);
  ctx.rotate((atur.putar * Math.PI) / 180);
  const dasar = Math.max(w / sumber.width, h / sumber.height);
  const k = dasar * atur.zoom;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(sumber, (-sumber.width * k) / 2, (-sumber.height * k) / 2, sumber.width * k, sumber.height * k);
  ctx.restore();
  terapkanFilter(ctx, w, h, atur);
}

/** Filter per piksel (sama di semua peramban, termasuk Safari yang belum mendukung ctx.filter). */
function terapkanFilter(ctx, w, h, { terang = 0, kontras = 0, saturasi = 0, hitamPutih = false }) {
  if (!terang && !kontras && !saturasi && !hitamPutih) return;
  const data = ctx.getImageData(0, 0, w, h);
  const p = data.data;
  const b = terang * 1.28;
  const c = (259 * (kontras * 1.28 + 255)) / (255 * (259 - kontras * 1.28));
  const s = hitamPutih ? 0 : 1 + saturasi / 100;
  for (let i = 0; i < p.length; i += 4) {
    let r = c * (p[i] + b - 128) + 128;
    let g = c * (p[i + 1] + b - 128) + 128;
    let bl = c * (p[i + 2] + b - 128) + 128;
    const l = 0.299 * r + 0.587 * g + 0.114 * bl;
    r = l + (r - l) * s;
    g = l + (g - l) * s;
    bl = l + (bl - l) * s;
    p[i] = r < 0 ? 0 : r > 255 ? 255 : r;
    p[i + 1] = g < 0 ? 0 : g > 255 ? 255 : g;
    p[i + 2] = bl < 0 ? 0 : bl > 255 ? 255 : bl;
  }
  ctx.putImageData(data, 0, 0);
}

// ===== Ganti latar di peramban (MediaPipe, model selfie multiclass; foto tidak dikirim ke mana pun) =====
const VERSI_MEDIAPIPE = "0.10.21";
const MODEL_LATAR = "https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_multiclass_256x256/float32/latest/selfie_multiclass_256x256.tflite";
let pemisahLatar = null;

async function siapkanPemisah() {
  if (pemisahLatar) return pemisahLatar;
  const { FilesetResolver, ImageSegmenter } = await import("@mediapipe/tasks-vision");
  const fileset = await FilesetResolver.forVisionTasks(`https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VERSI_MEDIAPIPE}/wasm`);
  pemisahLatar = await ImageSegmenter.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: MODEL_LATAR, delegate: "CPU" },
    runningMode: "IMAGE",
    outputCategoryMask: false,
    outputConfidenceMasks: true,
  });
  return pemisahLatar;
}

/** Ganti latar sumber dengan warna polos; mengembalikan kanvas baru seukuran sumber. */
export async function gantiLatar(sumber, warna) {
  const pemisah = await siapkanPemisah();
  const hasil = pemisah.segment(sumber);
  try {
    // Kanal 0 = latar; sisanya (rambut, kulit, pakaian, dll.) = orang
    const masker = hasil.confidenceMasks[0];
    const mw = masker.width, mh = masker.height;
    const latar = masker.getAsFloat32Array();
    const kanvasMasker = document.createElement("canvas");
    kanvasMasker.width = mw;
    kanvasMasker.height = mh;
    const mctx = kanvasMasker.getContext("2d");
    const img = mctx.createImageData(mw, mh);
    for (let i = 0; i < latar.length; i++) {
      // Ambang lunak agar tepi rambut tidak bergerigi
      const orang = Math.min(1, Math.max(0, (1 - latar[i] - 0.25) / 0.5));
      img.data[i * 4 + 3] = Math.round(orang * 255);
    }
    mctx.putImageData(img, 0, 0);

    const orang = document.createElement("canvas");
    orang.width = sumber.width;
    orang.height = sumber.height;
    const octx = orang.getContext("2d");
    octx.drawImage(sumber, 0, 0);
    octx.globalCompositeOperation = "destination-in";
    octx.imageSmoothingQuality = "high";
    octx.drawImage(kanvasMasker, 0, 0, orang.width, orang.height);

    const keluar = document.createElement("canvas");
    keluar.width = sumber.width;
    keluar.height = sumber.height;
    const kctx = keluar.getContext("2d");
    kctx.fillStyle = warna;
    kctx.fillRect(0, 0, keluar.width, keluar.height);
    kctx.drawImage(orang, 0, 0);
    return keluar;
  } finally {
    hasil.close?.();
  }
}

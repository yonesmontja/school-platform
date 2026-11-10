// Render naskah rakitan dengan Revideo (MIT). Langkah: (1) Revideo menggambar video tanpa suara, (2) narasi tiap adegan
// dan musik latar dicampur di sini dengan aturan volume yang sama seperti komposisi Remotion (gerakRakitan.js),
// (3) ffmpeg menempelkan audio ke video dan mengambil gambar sampul.
import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { FPS, awalAdegan, hitungDurasiRakitan, jendelaNarasi, ukuranRasio, volumeMusik } from "../templat/gerakRakitan.js";

const require = createRequire(import.meta.url);
export const FFMPEG = process.env.FFMPEG || require("@ffmpeg-installer/ffmpeg").path;
const LAJU = 48000;
const KERJA = process.env.REVIDEO_KERJA || "/tmp/revideo";
const AKAR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BATAS_MS = Number(process.env.REVIDEO_BATAS_MENIT || 20) * 60_000;

/** Revideo menggambar video tanpa suara di proses anak (lihat anak.mjs), dihentikan bila melewati batas waktu. */
function gambarVideo(tugas, folder) {
  const berkas = path.join(folder, "tugas.json");
  fs.writeFileSync(berkas, JSON.stringify(tugas));
  return new Promise((ok, gagal) => {
    const p = spawn(process.execPath, [path.join(AKAR, "revideo", "anak.mjs"), berkas], { cwd: AKAR, env: { ...process.env, DISABLE_TELEMETRY: "true" } });
    let err = "";
    p.stdout.on("data", () => {});
    p.stderr.on("data", (d) => { err = (err + d).slice(-2000); });
    const waktu = setTimeout(() => { p.kill("SIGKILL"); gagal(new Error("Render Revideo melewati batas waktu.")); }, BATAS_MS);
    p.on("error", (e) => { clearTimeout(waktu); gagal(e); });
    p.on("close", (kode) => {
      clearTimeout(waktu);
      const hasil = path.join(folder, "bisu.mp4");
      if (kode === 0 && fs.existsSync(hasil)) ok(hasil);
      else gagal(new Error(`Render Revideo gagal: ${err.trim().split(/\n/).slice(-3).join(" ").slice(0, 400) || `kode ${kode}`}`));
    });
  });
}

function jalankan(args, keluarBiner = false) {
  return new Promise((ok, gagal) => {
    const p = spawn(FFMPEG, ["-hide_banner", "-loglevel", "error", ...args]);
    const bagian = [];
    let err = "";
    p.stdout.on("data", (d) => bagian.push(d));
    p.stderr.on("data", (d) => { err += d; });
    p.on("error", gagal);
    p.on("close", (kode) => (kode === 0 ? ok(keluarBiner ? Buffer.concat(bagian) : null) : gagal(new Error(`ffmpeg gagal: ${err.slice(-300)}`))));
  });
}

/** Berkas/URL audio → sampel mono float 48 kHz. */
async function dekode(sumber) {
  const b = await jalankan(["-i", sumber, "-f", "f32le", "-ac", "1", "-ar", String(LAJU), "pipe:1"], true);
  return new Float32Array(b.buffer, b.byteOffset, Math.floor(b.length / 4));
}

function tulisWav(file, sampel) {
  const data = Buffer.alloc(sampel.length * 2);
  for (let i = 0; i < sampel.length; i++) data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, sampel[i])) * 32767), i * 2);
  const kepala = Buffer.alloc(44);
  kepala.write("RIFF", 0); kepala.writeUInt32LE(36 + data.length, 4); kepala.write("WAVE", 8); kepala.write("fmt ", 12);
  kepala.writeUInt32LE(16, 16); kepala.writeUInt16LE(1, 20); kepala.writeUInt16LE(1, 22); kepala.writeUInt32LE(LAJU, 24);
  kepala.writeUInt32LE(LAJU * 2, 28); kepala.writeUInt16LE(2, 32); kepala.writeUInt16LE(16, 34); kepala.write("data", 36); kepala.writeUInt32LE(data.length, 40);
  fs.writeFileSync(file, Buffer.concat([kepala, data]));
}

const srcAset = (url, dasar) => (!url ? null : /^https?:|^data:|^blob:/.test(url) ? url : `${dasar || ""}${url}`);

/**
 * Campur narasi (mulai di awal adegannya) dan musik latar berulang (diredam saat narasi, memudar di awal & akhir).
 * @returns {Promise<string|null>} berkas WAV, atau null bila video tanpa suara sama sekali
 */
export async function campurAudio(props, keluar) {
  const durasiFrame = hitungDurasiRakitan(props);
  const n = Math.ceil((durasiFrame / FPS) * LAJU);
  const campur = new Float32Array(n);
  let ada = false;
  const awal = awalAdegan(props);
  for (const [i, a] of (props.adegan || []).entries()) {
    if (!a.audio) continue;
    const s = await dekode(a.audio);
    const mulai = Math.round((awal[i] / FPS) * LAJU);
    for (let j = 0; j < s.length && mulai + j < n; j++) campur[mulai + j] += s[j];
    ada = true;
  }
  const m = props.musik;
  if (m?.src) {
    const s = await dekode(srcAset(m.src, props.asetDasar));
    if (s.length) {
      const jendela = jendelaNarasi(props);
      for (let j = 0; j < n; j++) {
        const f = Math.floor((j / LAJU) * FPS);
        campur[j] += s[j % s.length] * volumeMusik(m, jendela, f, durasiFrame);
      }
      ada = true;
    }
  }
  if (!ada) return null;
  tulisWav(keluar, campur);
  return keluar;
}

/**
 * Render satu naskah rakitan ke MP4 (dengan audio) dan sampul JPG.
 * @returns {Promise<{detik: number}>}
 */
export async function renderRevideo(props, mp4, jpg, opsi = {}) {
  const { lebar, tinggi } = ukuranRasio(props.rasio);
  const id = crypto.randomBytes(6).toString("hex");
  const folder = path.join(KERJA, id);
  fs.mkdirSync(folder, { recursive: true });
  try {
    const bisu = await gambarVideo({ props, lebar, tinggi, folder, ffmpeg: FFMPEG, browser: opsi.browser }, folder);
    const wav = await campurAudio(props, path.join(folder, "audio.wav"));
    const detik = hitungDurasiRakitan(props) / FPS;
    await jalankan(wav
      ? ["-y", "-i", bisu, "-i", wav, "-map", "0:v:0", "-map", "1:a:0", "-c:v", "copy", "-c:a", "aac", "-b:a", "128k", "-t", detik.toFixed(3), "-movflags", "+faststart", mp4]
      : ["-y", "-i", bisu, "-map", "0:v:0", "-c:v", "copy", "-movflags", "+faststart", mp4]);
    await jalankan(["-y", "-ss", String(Math.min(Math.max(0, detik - 0.1), 6)), "-i", mp4, "-frames:v", "1", "-q:v", "4", jpg]);
    return { detik };
  } finally {
    fs.rmSync(folder, { recursive: true, force: true });
  }
}

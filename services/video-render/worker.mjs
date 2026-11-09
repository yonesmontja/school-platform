// Layanan render Video Belajar (Fase 19 Tahap C, jalur B). Mengambil antrean dari core-api, membuat narasi suara
// (Piper lokal, atau ElevenLabs/Gemini lewat core-api), merender MP4 + sampul dengan Remotion, menyimpan hasil ke
// storage core-api (/hasil = storage/app/public), lalu melapor selesai/gagal. Satu video dikerjakan dalam satu waktu.
import { bundle } from "@remotion/bundler";
import { ensureBrowser, renderMedia, renderStill, selectComposition } from "@remotion/renderer";
import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { narasiPembuka, narasiPenutup } from "./templat/narasi.js";

const API = process.env.API_INTERNAL || "http://core-api:8000";
const KUNCI = process.env.RENDER_SECRET || "";
const HASIL = process.env.HASIL || "/hasil";
const SUARA = "/tmp/suara";
const PORT = 9123;
const MODEL_PIPER = process.env.MODEL_PIPER || "/opt/piper/id_ID-news_tts-medium.onnx";
const KONKURENSI = Number(process.env.KONKURENSI || 2);
// Layanan ini menulis render untuk mesin Remotion; worker Revideo kelak mengambil antrean ?mesin=REVIDEO
const MESIN = "REMOTION";
const JEDA_MS = 5000;

const tunggu = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(new Date().toISOString(), ...a);
const kepala = { "X-Render-Secret": KUNCI, Accept: "application/json" };

fs.mkdirSync(SUARA, { recursive: true });
fs.mkdirSync(path.join(HASIL, "video"), { recursive: true });

// Berkas suara (dan gambar aset Studio dari storage core-api) dilayani lewat HTTP lokal agar bisa dipakai saat render
const TIPE_GAMBAR = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp" };
http.createServer((req, res) => {
  const jalur = decodeURIComponent(req.url.split("?")[0]);
  const aset = jalur.startsWith("/storage/video-aset/");
  const f = aset ? path.join(HASIL, "video-aset", path.basename(jalur)) : path.join(SUARA, path.basename(jalur));
  if (!fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  const tipe = aset ? TIPE_GAMBAR[path.extname(f).toLowerCase()] || "application/octet-stream" : "audio/wav";
  res.writeHead(200, { "Content-Type": tipe, "Access-Control-Allow-Origin": "*", "Content-Length": fs.statSync(f).size });
  fs.createReadStream(f).pipe(res);
}).listen(PORT, "127.0.0.1");

/** Lama WAV dalam detik dari kepala berkasnya. */
function durasiWav(file) {
  const b = fs.readFileSync(file);
  const byteRate = b.readUInt32LE(28);
  let i = 12;
  while (i < b.length - 8) {
    const id = b.toString("ascii", i, i + 4), size = b.readUInt32LE(i + 4);
    if (id === "data") return size / byteRate;
    i += 8 + size;
  }
  return (b.length - 44) / byteRate;
}

/** Piper: teks → WAV (sedikit lebih lambat dan berjeda agar mudah diikuti anak). */
function piper(teks, keluar) {
  return new Promise((ok, gagal) => {
    const p = spawn("python3", ["-m", "piper", "-m", MODEL_PIPER, "-f", keluar, "--length-scale", "1.12", "--sentence-silence", "0.35"]);
    let err = "";
    p.stderr.on("data", (d) => { err += d; });
    p.on("close", (kode) => (kode === 0 && fs.existsSync(keluar) ? ok() : gagal(new Error(`Piper gagal: ${err.slice(-300)}`))));
    p.stdin.end(teks);
  });
}

async function suaraBerbayar(suara, teks, keluar) {
  const res = await fetch(`${API}/api/internal/render/suara`, {
    method: "POST", headers: { ...kepala, "Content-Type": "application/json" }, body: JSON.stringify({ suara, teks }),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message || `Suara ${suara} gagal (HTTP ${res.status}).`);
  fs.writeFileSync(keluar, Buffer.from(await res.arrayBuffer()));
}

/** Buat semua narasi dan tempel audio + lamanya ke props. */
async function siapkanNarasi(job, props) {
  if (!job.suara || job.suara === "TANPA") return [];
  const perAdegan = (props.adegan || []).map((a, i) => [`a${i}`, a.narasi, (v) => { Object.assign(props.adegan[i], v); }]);
  // Video rakitan Studio tidak punya layar pembuka/penutup otomatis
  const bagian = job.templat === "Rakitan" ? perAdegan : [
    ["pembuka", narasiPembuka(props.judul), (v) => { props.pembuka = { ...(props.pembuka || {}), ...v }; }],
    ...perAdegan,
    ["penutup", narasiPenutup(props.penutup?.teks), (v) => { props.penutup = { ...(props.penutup || {}), ...v }; }],
  ];
  const berkas = [];
  for (const [kunci, teks, pasang] of bagian) {
    if (!String(teks || "").trim()) continue;
    const nama = `${job.id_video}-${kunci}-${crypto.randomBytes(4).toString("hex")}.wav`;
    const f = path.join(SUARA, nama);
    if (job.suara === "LOKAL") await piper(String(teks), f);
    else await suaraBerbayar(job.suara, String(teks), f);
    berkas.push(f);
    pasang({ audio: `http://127.0.0.1:${PORT}/${nama}`, detik: Math.round(durasiWav(f) * 100) / 100 });
  }
  return berkas;
}

async function lapor(id, jalur, isi) {
  const res = await fetch(`${API}/api/internal/render/${id}/${jalur}`, { method: "POST", headers: { ...kepala, "Content-Type": "application/json" }, body: JSON.stringify(isi) });
  if (!res.ok) log(`Lapor ${jalur} gagal: HTTP ${res.status}`);
}

async function kerjakan(job, serveUrl) {
  const props = JSON.parse(JSON.stringify(job.props || {}));
  props.judul = props.judul || job.judul;
  props.asetDasar = `http://127.0.0.1:${PORT}`; // gambar /storage/video-aset/… dibaca dari storage lokal
  log(`Render ${job.id_video} (${job.templat}, suara ${job.suara}, ${props.adegan?.length || 0} adegan)`);
  const berkasSuara = await siapkanNarasi(job, props);
  try {
    const composition = await selectComposition({ serveUrl, id: job.templat, inputProps: props });
    const nama = `vid_${crypto.randomBytes(10).toString("hex")}`;
    const mp4 = path.join(HASIL, "video", `${nama}.mp4`);
    const jpg = path.join(HASIL, "video", `poster_${nama}.jpg`);
    await renderMedia({ composition, serveUrl, codec: "h264", crf: 26, outputLocation: mp4, inputProps: props, concurrency: KONKURENSI });
    await renderStill({ composition, serveUrl, output: jpg, inputProps: props, frame: Math.min(composition.durationInFrames - 1, Math.round(composition.fps * 6)), imageFormat: "jpeg", jpegQuality: 80 });
    await lapor(job.id_video, "selesai", { file_url: `/storage/video/${nama}.mp4`, poster_url: `/storage/video/poster_${nama}.jpg`, durasi_detik: Math.max(1, Math.round(composition.durationInFrames / composition.fps)) });
    log(`Selesai ${job.id_video}: ${(fs.statSync(mp4).size / 1024 / 1024).toFixed(1)} MB, ${Math.round(composition.durationInFrames / composition.fps)} detik`);
  } finally {
    berkasSuara.forEach((f) => fs.rmSync(f, { force: true }));
  }
}

async function utama() {
  if (!KUNCI) { log("RENDER_SECRET belum diisi; layanan render berhenti."); process.exit(1); }
  await ensureBrowser();
  log("Menyiapkan bundel templat…");
  const serveUrl = await bundle({ entryPoint: path.resolve("src/index.jsx") });
  log("Layanan render siap; menunggu antrean.");
  for (;;) {
    let job = null;
    try {
      const res = await fetch(`${API}/api/internal/render/berikut?mesin=${MESIN}`, { headers: kepala });
      job = res.ok ? (await res.json()).data : null;
      if (!res.ok) log(`Antrean tidak bisa dibaca: HTTP ${res.status}`);
    } catch (e) { log(`core-api belum bisa dihubungi: ${e.message}`); }
    if (!job) { await tunggu(JEDA_MS); continue; }
    try { await kerjakan(job, serveUrl); }
    catch (e) {
      log(`Gagal ${job.id_video}: ${e.message}`);
      await lapor(job.id_video, "gagal", { pesan: String(e.message || e).slice(0, 1500) });
    }
  }
}

utama();

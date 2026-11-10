// Proses anak untuk satu render Revideo. renderVideo() tidak bisa dipanggil berulang dalam satu proses (render kedua
// macet), jadi worker menjalankan berkas ini sekali per video: node revideo/anak.mjs <tugas.json>.
import { renderVideo } from "@revideo/renderer";
import fs from "node:fs";
import { createRequire } from "node:module";

// Revideo selalu menambahkan --single-process ke Chrome; di Chrome headless (Linux, tanpa GPU) mode itu kadang
// langsung mati atau macet. Bendera itu dibuang sebelum browser dijalankan.
const require = createRequire(import.meta.resolve("@revideo/renderer"));
const pptr = require("puppeteer").default;
const luncurAsli = pptr.launch.bind(pptr);
pptr.launch = (opsi = {}) => luncurAsli({ ...opsi, args: (opsi.args || []).filter((a) => a !== "--single-process") });

const tugas = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
try {
  await renderVideo({
    projectFile: "./revideo/project.js",
    variables: { naskah: tugas.props, lebar: tugas.lebar, tinggi: tugas.tinggi },
    settings: {
      outFile: "bisu.mp4", outDir: tugas.folder, logProgress: false, workers: 1,
      projectSettings: { size: { x: tugas.lebar, y: tugas.tinggi }, exporter: { name: "@revideo/core/ffmpeg", options: { format: "mp4" } } },
      ffmpeg: { ffmpegPath: tugas.ffmpeg },
      puppeteer: { headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"], ...(tugas.browser ? { executablePath: tugas.browser } : {}) },
    },
  });
  process.exit(0);
} catch (e) {
  console.error(String(e?.message || e));
  process.exit(1);
}

// Tes end-to-end web SAPrapor. Halaman dibuka dari WEB_URL (bawaan jalur kerja :3001; terbitkan.sh memakai
// build produksi yang akan diterbitkan, di :3002), sedangkan semua panggilan /api dialihkan ke API tes
// (core-api-e2e, database sekolah fiktif) — lihat bantu.js.
const { defineConfig, devices } = require("@playwright/test");

module.exports = defineConfig({
  testDir: "./tes",
  globalSetup: require.resolve("./siapkan.js"),
  globalTeardown: require.resolve("./tutup.js"),
  // Tes berbagi satu database: dijalankan berurutan agar hasilnya bisa diulang
  workers: 1,
  fullyParallel: false,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  retries: 0,
  reporter: [["list"], ["html", { open: "never", outputFolder: "laporan" }]],
  outputDir: "hasil",
  use: {
    baseURL: process.env.WEB_URL || "http://localhost:3001",
    locale: "id-ID",
    timezoneId: "Asia/Jayapura",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    // Build produksi mendaftarkan service worker; permintaannya tidak lewat page.route (pengalihan ke API tes)
    serviceWorkers: "block",
    // Mikrofon tiruan untuk soal membaca nyaring (izin otomatis, suara uji Chromium)
    launchOptions: { args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] },
    permissions: ["microphone"],
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 860 } } },
    { name: "hp", use: { ...devices["Pixel 7"] }, testMatch: /halaman\.spec\.js/ },
  ],
});

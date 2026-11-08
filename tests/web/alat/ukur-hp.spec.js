// Alat ukur (bukan bagian tes biasa): waktu muat halaman utama di HP murah dengan sinyal 3G dan CPU 4x lebih lambat.
// Jalankan pada build produksi: npx playwright test --config alat/playwright.ukur.js
const { test, expect } = require("../bantu");
const fs = require("fs");

const HALAMAN = [
  ["guru", "/dashboard", "h1, h2, h3, h4"],
  ["guru", "/dashboard/nilai", "select"],
  ["guru", "/dashboard/jadwal", ".fc"],
  ["guru", "/dashboard/jurnal", "textarea"],
  ["guru", "/dashboard/presensi", "select"],
  ["guru", "/dashboard/bank-soal", ".nav-tabs, .btn"],
  ["guru", "/dashboard/perangkat-ajar", ".nav-tabs"],
  ["siswa", "/dashboard/portal", "h3, .card"],
  ["siswa", "/dashboard/ujian", "h3"],
  ["ortu", "/dashboard/portal", "h3, .card"],
];

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

test("ukur halaman di HP murah (3G, CPU 4x lebih lambat)", async ({ page, masuk }) => {
  test.setTimeout(900_000);
  const hasil = [];
  let peran = null;
  const cdp = await page.context().newCDPSession(page);
  for (const [p, url, penanda] of HALAMAN) {
    if (p !== peran) { await masuk(p); peran = p; }
    for (const kunjungan of ["pertama", "ulang"]) {
      if (kunjungan === "pertama") await cdp.send("Network.clearBrowserCache");
      await cdp.send("Network.enable");
      // "Fast 3G" ala Chrome DevTools: 1,6 Mbps turun, 750 Kbps naik, jeda 562 ms
      await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 562, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 });
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
      let bita = 0;
      const hitung = (r) => r.sizes().then((s) => { bita += s.responseBodySize + s.responseHeadersSize; }).catch(() => {});
      page.on("requestfinished", hitung);
      const t0 = Date.now();
      await page.goto(url, { waitUntil: "domcontentloaded" });
      await expect(page.locator(penanda).first()).toBeVisible({ timeout: 120_000 });
      const tampil = Date.now() - t0;
      await page.waitForLoadState("networkidle", { timeout: 120_000 }).catch(() => {});
      const selesai = Date.now() - t0;
      page.off("requestfinished", hitung);
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
      await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
      hasil.push({ peran: p, halaman: url, kunjungan, tampil_detik: +(tampil / 1000).toFixed(1), selesai_detik: +(selesai / 1000).toFixed(1), kb: Math.round(bita / 1024) });
    }
  }
  fs.writeFileSync(require("path").join(__dirname, "..", "hasil", "ukur-hp.json"), JSON.stringify(hasil, null, 1));
  console.log("UKUR\n" + hasil.map((h) => `${h.peran}\t${h.halaman}\t${h.kunjungan}\ttampil ${h.tampil_detik}s\tselesai ${h.selesai_detik}s\t${h.kb} KB`).join("\n"));
});

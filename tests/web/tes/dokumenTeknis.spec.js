// Dokumen Teknis (khusus Admin): sampul, daftar isi yang melompat ke bab, diagram SVG, data hidup dari sistem;
// kepala sekolah tidak bisa membuka halaman maupun menunya.
const path = require("path");
const { test, expect } = require("../bantu");

test("admin membaca dokumen teknis lengkap dengan diagram dan daftar isi", async ({ page, masuk }) => {
  test.setTimeout(240_000); // API tes tanpa cache: dokumen disusun ulang dari Markdown tiap permintaan
  await masuk("admin");
  await page.goto("/dashboard/dokumen-teknis");
  const dok = page.locator("[data-dokumen-teknis]");
  await expect(dok.locator(".dt-sampul h1")).toContainText("SAPrapor", { timeout: 120_000 });
  await expect(dok.locator("[data-statistik]")).toContainText("Endpoint API");
  expect(await dok.locator("figure.dt-gambar svg").count()).toBeGreaterThanOrEqual(20);
  await expect(dok.locator(".dt-galat")).toHaveCount(0);

  // Daftar isi: cari lalu lompat ke subbab
  await dok.getByPlaceholder("Cari bagian…").fill("use case");
  await dok.locator(".dt-samping a", { hasText: "3.6 Diagram Use Case" }).click();
  await expect(page.locator("#gambar-3-2")).toBeInViewport({ timeout: 10_000 });
  await page.locator("#gambar-3-2").screenshot({ path: path.join(__dirname, "../hasil/dokumen-teknis-usecase.png") });
  await page.screenshot({ path: path.join(__dirname, "../hasil/dokumen-teknis-tengah.png") });
  // Daftar isi tetap terlihat (menempel) saat dokumen digulir jauh ke bawah
  const kotak = await dok.locator(".dt-samping").boundingBox();
  expect(kotak.y).toBeGreaterThanOrEqual(0);

  // Lampiran berisi data hidup dari router
  await expect(dok.locator(".dt-isi").last()).toContainText("/dokumen-teknis");
  await dok.getByPlaceholder("Cari bagian…").fill("");
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: path.join(__dirname, "../hasil/dokumen-teknis.png") });

  // Menu Akun & Sistem memuat Dokumen Teknis untuk admin, tidak untuk kepala sekolah
  await expect(page.locator('a[href="/dashboard/dokumen-teknis"]').first()).toBeAttached();
  await masuk("kepsek");
  await page.goto("/dashboard/dokumen-teknis");
  await expect(page).not.toHaveURL(/dokumen-teknis/, { timeout: 60_000 });
  await expect(page.locator('a[href="/dashboard/dokumen-teknis"]')).toHaveCount(0);
});

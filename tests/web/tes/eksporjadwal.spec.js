// Sidebar per alur kerja + ekspor jadwal resmi (Roster mingguan & Daftar sesi) sebagai PDF dan PNG.
const fs = require("fs");
const path = require("path");
const { test, expect, hariIni, API } = require("../bantu");

test("sidebar tersusun per alur kerja dengan nama SAPrapor", async ({ page, masuk }) => {
  await masuk("admin");
  await page.goto("/dashboard");
  const sidebar = page.locator(".app-sidebar");
  await expect(sidebar.locator(".sidebar-brand")).toContainText("SAPrapor");
  for (const grup of ["Kegiatan Harian", "Perencanaan Ajar", "Asesmen", "Media Belajar", "Laporan", "Data Sekolah", "Referensi", "Akun & Sistem"]) {
    await expect(sidebar.getByText(grup, { exact: true }).first()).toBeAttached();
  }
  await expect(sidebar.getByRole("link", { name: "Perlu Tindakan" }).first()).toBeVisible();
  await expect(sidebar).not.toContainText("TDU");
  await expect(page).toHaveTitle(/SAPrapor/);
});

test("ekspor jadwal resmi: roster mingguan PDF & PNG, daftar sesi PDF", async ({ page, masuk }) => {
  test.setTimeout(150_000);
  const sesi = await masuk("guru");
  await fetch(`${API}/api/jadwal`, {
    method: "POST", headers: { Authorization: `Bearer ${sesi.access_token}`, Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ id_mapel: "MPL-EMTK", id_kelas: "KLS-E4A", pola: "sekali", mulai: `${hariIni()}T07:30`, selesai: `${hariIni()}T08:40`, abaikan_bentrok: true }),
  });
  await page.goto("/dashboard/jadwal");
  const buka = async () => {
    await page.getByRole("button", { name: "Ekspor jadwal" }).click();
    return page.getByRole("dialog", { name: "Ekspor jadwal resmi" });
  };

  let d = await buka();
  await d.getByLabel("Kelas").selectOption("KLS-E4A");
  const [pdf] = await Promise.all([page.waitForEvent("download", { timeout: 60_000 }), d.getByRole("button", { name: "Unduh PDF" }).click()]);
  expect(pdf.suggestedFilename()).toMatch(/^Jadwal Pelajaran Mingguan Kelas 4A .*\.pdf$/);
  const isiPdf = fs.readFileSync(await pdf.path());
  expect(isiPdf.subarray(0, 4).toString()).toBe("%PDF");

  d = await buka();
  await d.getByLabel("Gambar PNG").check();
  const [png] = await Promise.all([page.waitForEvent("download", { timeout: 60_000 }), d.getByRole("button", { name: "Unduh PNG" }).click()]);
  expect(png.suggestedFilename()).toMatch(/\.png$/);
  const isiPng = fs.readFileSync(await png.path());
  expect(isiPng.subarray(1, 4).toString()).toBe("PNG");
  expect(isiPng.readUInt32BE(16)).toBe(3000); // lebar 1500 px × skala 2
  fs.copyFileSync(await png.path(), path.join(__dirname, "../hasil/ekspor-roster.png"));

  d = await buka();
  await d.getByRole("button", { name: "Daftar sesi" }).click();
  const [daftar] = await Promise.all([page.waitForEvent("download", { timeout: 60_000 }), d.getByRole("button", { name: "Unduh PDF" }).click()]);
  expect(daftar.suggestedFilename()).toMatch(/^Daftar Sesi Jadwal/);
  fs.copyFileSync(await daftar.path(), path.join(__dirname, "../hasil/ekspor-daftar.pdf"));
  fs.copyFileSync(await pdf.path(), path.join(__dirname, "../hasil/ekspor-roster.pdf"));
});

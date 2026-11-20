// Pesan wali kelas ↔ orang tua di dalam aplikasi, dan rapor berjalan pekanan di portal/dashboard pribadi.
const { test, expect } = require("../bantu");

test.describe.configure({ mode: "serial", timeout: 150000 });

test("orang tua mengirim pesan dari portal", async ({ page, masuk }) => {
  await masuk("ortu");
  await page.goto("/dashboard/portal");
  // Rapor berjalan tampil di Ringkasan
  await expect(page.locator("[data-rapor-berjalan]")).toBeVisible({ timeout: 60000 });
  await expect(page.locator("[data-kirim-wa-pekan]")).toHaveCount(0); // tombol kirim WA hanya untuk staf

  await page.locator("ul.nav-pills .nav-link").filter({ hasText: "Pesan" }).click();
  const utas = page.locator("[data-utas-pesan]");
  await expect(utas).toContainText("Belum ada pesan");
  await utas.getByLabel("Tulis pesan").fill("Selamat pagi, Abner izin terlambat besok karena ke puskesmas.");
  await utas.getByRole("button", { name: "Kirim pesan" }).click();
  await expect(utas.locator('[data-pesan="saya"]')).toContainText("izin terlambat besok");
});

test("wali kelas melihat pesan baru dan membalas", async ({ page, masuk }) => {
  await masuk("guru");
  await page.goto("/dashboard/pesan");
  const baris = page.locator('[data-utas="Abner Kogoya"]');
  await expect(baris.locator("[data-belum-dibaca]")).toHaveText("1", { timeout: 60000 });
  await baris.click();
  await expect(page).toHaveURL(/siswa=SIS-E1/);
  const utas = page.locator("[data-utas-pesan]");
  await expect(utas.locator('[data-pesan="lain"]')).toContainText("Paulus Kogoya");
  await expect(utas.locator('[data-pesan="lain"]')).toContainText("Orang tua/wali");
  await utas.getByLabel("Tulis pesan").fill("Baik Bapak, terima kasih kabarnya.");
  await utas.getByLabel("Tulis pesan").press("Control+Enter");
  await expect(utas.locator('[data-pesan="saya"]')).toContainText("terima kasih kabarnya");
  await expect(baris.locator("[data-belum-dibaca]")).toHaveCount(0);

  // Dashboard pribadi: rapor berjalan dengan tombol kirim WA ke orang tua
  await page.goto("/dashboard/portal?siswa=SIS-E1");
  const kartu = page.locator("[data-rapor-berjalan]");
  await expect(kartu).toBeVisible({ timeout: 60000 });
  await expect(kartu.locator("[data-kirim-wa-pekan]")).toHaveAttribute("href", /wa\.me\/6281200000001\?text=/);
});

test("orang tua menerima balasan lewat tautan Perlu Tindakan", async ({ page, masuk }) => {
  await masuk("ortu");
  await page.goto("/dashboard/portal?tab=pesan&siswa=SIS-E1");
  const utas = page.locator("[data-utas-pesan]");
  await expect(utas.locator('[data-pesan="lain"]')).toContainText("terima kasih kabarnya", { timeout: 60000 });
  await expect(utas.locator('[data-pesan="lain"]')).toContainText("Wali kelas");
});

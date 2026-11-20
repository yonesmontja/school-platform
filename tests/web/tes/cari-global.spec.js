// Pencarian global (Ctrl+K): menu dan data sekolah dalam satu kotak; siswa membuka dashboard pribadi,
// hasil surat/dokumen membawa kata kunci ke halaman tujuan.
const { test, expect } = require("../bantu");

test.describe.configure({ mode: "serial", timeout: 120000 });

test("Ctrl+K mencari menu dan siswa, Enter membuka hasilnya", async ({ page, masuk, context }) => {
  await masuk("admin");
  await page.goto("/dashboard");
  await expect(page.locator("[data-tombol-cari]")).toBeVisible({ timeout: 60000 });

  // Menu: ketik lalu Enter
  await page.keyboard.press("Control+k");
  const palet = page.locator("[data-cari-global]");
  await expect(palet).toBeVisible();
  await palet.getByLabel("Kata pencarian").fill("peringatan");
  await expect(palet.locator('[data-hasil-cari="Menu"]').first()).toContainText("Peringatan Dini");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/dashboard\/peringatan-dini/, { timeout: 60000 });
  await expect(palet).toHaveCount(0);

  // Siswa: hasil dari server, dashboard pribadi terbuka di tab baru
  await page.locator("[data-tombol-cari]").click();
  await palet.getByLabel("Kata pencarian").fill("Abner");
  const siswa = palet.locator('[data-hasil-cari="Siswa"]').first();
  await expect(siswa).toContainText("Abner Kogoya");
  await expect(siswa).toContainText("4A");
  const [tab] = await Promise.all([context.waitForEvent("page"), siswa.click()]);
  await expect(tab).toHaveURL(/\/dashboard\/portal\?siswa=SIS-E1/);
  await tab.close();

  // Tidak ada hasil & Esc menutup
  await page.keyboard.press("Control+k");
  await palet.getByLabel("Kata pencarian").fill("zzqx tidak ada");
  await expect(palet.locator("[data-cari-kosong]")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(palet).toHaveCount(0);
});

test("hasil ke halaman Siswa membawa kata kunci", async ({ page, masuk }) => {
  await masuk("admin");
  await page.goto("/dashboard/master-siswa?cari=Debora");
  await expect(page.getByText("Debora Tabuni")).toBeVisible({ timeout: 60000 });
  await expect(page.getByText("Abner Kogoya")).toHaveCount(0);
});

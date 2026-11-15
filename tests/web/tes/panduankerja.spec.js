// Peta kerja guru: kartu "Langkah kerja saya" di Dashboard dan peta kerja lengkap di Panduan; kepala sekolah memantau guru.
const { test, expect } = require("../bantu");

test("guru melihat langkah berikutnya di dashboard dan peta kerja lengkap di Panduan", async ({ page, masuk }) => {
  test.setTimeout(120_000);
  await masuk("guru");
  await page.goto("/dashboard");
  const kartu = page.locator("#peta-kerja-ringkas");
  await expect(kartu).toContainText("Langkah kerja saya", { timeout: 60_000 });
  await expect(kartu).toContainText(/Langkah berikutnya|Semua langkah wajib/);
  await expect(kartu.locator("a.badge").first()).toBeVisible();
  await kartu.screenshot({ path: test.info().outputPath("kartu-peta-kerja.png") });

  await expect(kartu.getByRole("link", { name: /Peta kerja lengkap/ })).toHaveAttribute("href", "/dashboard/panduan");
  await page.goto("/dashboard/panduan");
  const peta = page.locator("#peta-kerja");
  await expect(peta).toContainText("Peta kerja saya", { timeout: 90_000 });
  for (const t of ["Persiapan semester", "Rutin mingguan", "Akhir semester"]) await expect(peta).toContainText(t);
  await expect(peta.locator("[data-langkah=tp]")).toContainText("Materi & Tujuan Pembelajaran");
  await expect(peta.locator("[data-langkah=atp]")).toBeVisible();
  // Rincian per mapel–kelas bisa dibuka
  const rincian = peta.getByRole("button", { name: /Rincian per mapel/ }).first();
  if (await rincian.count()) { await rincian.click(); await expect(peta.locator("ul.list-unstyled li").first()).toBeVisible(); }
  await peta.screenshot({ path: test.info().outputPath("peta-kerja.png") });
  // Panduan statis tetap ada di bawahnya
  await expect(page.getByText("Cara memakai tiap menu")).toBeVisible();
});

test("kepala sekolah memilih guru untuk memantau peta kerjanya", async ({ page, masuk }) => {
  test.setTimeout(90_000);
  await masuk("kepsek");
  await page.goto("/dashboard/panduan");
  const peta = page.locator("#peta-kerja");
  await expect(peta).toContainText("Pilih guru untuk melihat peta kerjanya", { timeout: 60_000 });
  const pilih = peta.getByLabel("Pilih guru");
  const nilai = await pilih.locator("option").nth(1).getAttribute("value");
  await pilih.selectOption(nilai);
  await expect(peta).toContainText("Persiapan semester", { timeout: 30_000 });
});

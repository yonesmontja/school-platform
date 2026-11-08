// Dokumentasi API: admin mencari endpoint, melihat akses & contoh curl; guru tidak bisa membuka halamannya.
const { test, expect } = require("../bantu");

test("admin mencari endpoint di dokumentasi API dan melihat contoh curl", async ({ page, masuk }) => {
  test.setTimeout(150_000); // API tes tanpa cache: daftar rute dibaca ulang tiap permintaan
  await masuk("admin");
  await page.goto("/dashboard/dokumentasi-api");
  await expect(page.locator(".endpoint-api").first()).toBeVisible({ timeout: 30_000 });
  await page.getByLabel("Cari endpoint").fill("rekaman");
  const baris = page.locator(".endpoint-api", { hasText: "/ujian/{id}/rekaman" });
  await expect(baris).toContainText("Siswa");
  await baris.getByRole("button").first().click();
  await expect(baris.locator("pre")).toContainText("Authorization: Bearer <TOKEN>");
  await page.getByLabel("Cari endpoint").fill("");
  await page.getByLabel("Saring peran").selectOption("publik");
  await expect(page.locator(".endpoint-api", { hasText: "/login" })).toContainText("Publik");

  await masuk("guru");
  await page.goto("/dashboard/dokumentasi-api");
  await expect(page.locator(".endpoint-api")).toHaveCount(0);
  await expect(page).not.toHaveURL(/dokumentasi-api/);
});

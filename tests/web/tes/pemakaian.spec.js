// Dasbor pemakaian (Fase 18): kepala sekolah melihat adopsi fitur dan pemakaian per guru; guru tidak bisa membukanya.
const { test, expect } = require("../bantu");

test("kepala sekolah melihat dasbor pemakaian aplikasi", async ({ page, masuk }) => {
  // Aktivitas guru agar tercatat di Log Aktivitas
  await masuk("guru");
  await page.goto("/dashboard/jadwal");
  await expect(page.locator(".fc").first()).toBeVisible();

  await masuk("kepsek");
  await page.goto("/dashboard/pemakaian");
  await expect(page.locator(".adopsi-fitur", { hasText: "Jadwal" })).toContainText("1 guru");
  const baris = page.locator(".tabel-pemakaian tr", { hasText: "Yakobus Wenda" });
  await expect(baris).toBeVisible();
  await expect(page.locator(".card-header", { hasText: "Jejak kerja nyata" })).toBeVisible();
  await page.getByRole("button", { name: "7 hari" }).click();
  await expect(page.getByText("dalam 7 hari", { exact: true })).toBeVisible();
  await page.screenshot({ path: "hasil/pemakaian.png", fullPage: true });

  await masuk("guru");
  await page.goto("/dashboard/pemakaian");
  await expect(page.locator(".tabel-pemakaian")).toHaveCount(0);
});

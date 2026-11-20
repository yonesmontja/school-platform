// Kartu pelajar berfoto & ber-QR: cetak dari menu Siswa, QR membuka halaman publik verifikasi;
// QR kartu ujian membuka halaman masuk dengan NISN terisi.
const { test, expect, api } = require("../bantu");

test.describe.configure({ mode: "serial", timeout: 120000 });

test("admin mencetak kartu pelajar satu kelas", async ({ page, masuk, context }) => {
  await masuk("admin");
  await page.goto("/dashboard/master-siswa");
  await expect(page.getByText("Abner Kogoya")).toBeVisible({ timeout: 60000 });
  await page.locator("select").filter({ has: page.locator("option", { hasText: "4A" }) }).first().selectOption({ label: "4A" });

  const [jendela] = await Promise.all([context.waitForEvent("page"), page.locator("[data-cetak-kartu]").click()]);
  await jendela.evaluate(() => { window.print = () => {}; });
  await expect(jendela.locator("[data-kartu-pelajar]")).toHaveCount(4, { timeout: 20000 });
  await expect(jendela.locator("[data-kartu-pelajar]").first()).toContainText("KARTU PELAJAR");
  await expect(jendela.locator("[data-kartu-pelajar] .qr svg").first()).toBeVisible();
  await expect(jendela.locator("body")).not.toContainText("Simon Wonda");
  await jendela.close();
});

test("verifikasi kartu menampilkan siswa terdaftar, kode palsu ditolak", async ({ page, masuk }) => {
  const sesi = await masuk("admin");
  const kartu = await api(sesi, "/kartu-pelajar?id_siswa[]=SIS-E2");
  await page.goto(`/verifikasi/siswa/${kartu.data[0].kode}`);
  const hasil = page.locator("[data-verifikasi-kartu]");
  await expect(hasil).toHaveAttribute("data-verifikasi-kartu", "aktif", { timeout: 60000 });
  await expect(hasil).toContainText("Debora Tabuni");
  await expect(hasil).toContainText("4A");

  await page.goto("/verifikasi/siswa/AAAAAAAAAAAA");
  await expect(page.locator("[data-verifikasi-kartu]")).toHaveAttribute("data-verifikasi-kartu", "tidak-ditemukan", { timeout: 60000 });
});

test("QR kartu ujian membuka halaman masuk dengan NISN terisi", async ({ page }) => {
  await page.goto("/login?peran=siswa&u=0098765432");
  await expect(page.locator("input[type=text], input:not([type])").first()).toHaveValue("0098765432", { timeout: 60000 });
  await expect(page.locator("#masuk-sandi")).toBeFocused();
});

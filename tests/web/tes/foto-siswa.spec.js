// Pas foto siswa: wali kelas mengunggah & mengedit di menu Siswa → tampil di biodata rapor dan portal;
// dashboard pribadi siswa untuk wali kelas (tanpa video & tagihan), siswa kelas lain ditolak.
const path = require("path");
const { test, expect, masukApi, unggahApi, pilih, selectBerlabel, API } = require("../bantu");

test.describe.configure({ mode: "serial", timeout: 180000 });

const FOTO = path.join(__dirname, "..", "data", "pas-foto.png");

test("wali kelas menambah pas foto dari menu Siswa dengan potong dan filter", async ({ page, masuk }) => {
  const sesi = await masuk("guru");
  // Chromium tidak meneruskan isi multipart ke permintaan yang disadap tes: unggahan dari editor diteruskan lewat API tes
  await page.route((url) => url.pathname.endsWith("/api/siswa/SIS-E1/foto"), async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    const hasil = await unggahApi(sesi, "/siswa/SIS-E1/foto", {}, { nama: "foto", path: FOTO, tipe: "image/png" });
    await route.fulfill({ json: hasil });
  });

  await page.goto("/dashboard/master-siswa");
  // Wali 4A hanya melihat siswa kelas binaannya
  await expect(page.getByText("Abner Kogoya")).toBeVisible();
  await expect(page.getByText("Simon Wonda")).toHaveCount(0);

  const baris = page.locator(".tabulator-row").filter({ hasText: "Abner Kogoya" });
  await baris.getByRole("button", { name: "Aksi baris" }).click();
  await expect(page.getByRole("menuitem", { name: "Dashboard pribadi siswa" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Ubah" })).toHaveCount(0); // data siswa tetap diubah admin
  await page.getByRole("menuitem", { name: "Tambah pas foto" }).click();

  const editor = page.locator("[data-editor-foto]");
  await expect(editor).toContainText("Pas foto · Abner Kogoya");
  await expect(editor.getByRole("button", { name: "Simpan foto" })).toBeDisabled();
  await editor.locator("[data-pilih-foto]").setInputFiles(FOTO);
  await expect(editor.getByRole("button", { name: "Simpan foto" })).toBeEnabled();

  await editor.getByLabel("Perbesar").fill("1.5");
  await editor.getByRole("button", { name: "Filter" }).click();
  await editor.getByLabel("Hitam putih").check();
  // Pratinjau benar-benar hitam putih: piksel tengah tidak berwarna
  const warna = await editor.locator("[data-pratinjau-foto]").evaluate((c) => {
    const [r, g, b] = c.getContext("2d").getImageData(c.width / 2, c.height / 2, 1, 1).data;
    return { r, g, b };
  });
  expect(warna.r).toBe(warna.g);
  expect(warna.g).toBe(warna.b);

  // Tab AI meminta persetujuan sebelum foto dikirim ke penyedia
  await editor.locator(".nav-link").filter({ hasText: /^\s*AI\s*$/ }).click();
  await expect(editor).toContainText("penyedia AI pihak ketiga");
  await editor.getByRole("button", { name: "Edit dengan AI" }).click();
  await expect(editor.getByRole("alert")).toContainText("Centang persetujuan");

  await editor.getByRole("button", { name: "Simpan foto" }).click();
  await expect(page.locator(".swal2-toast")).toContainText("Pas foto tersimpan");
  await expect(editor).toHaveCount(0);
  const thumb = page.locator('[data-foto-siswa="SIS-E1"]');
  await expect(thumb).toBeVisible();
  await expect.poll(() => thumb.evaluate((img) => img.naturalWidth)).toBeGreaterThan(0);
});

test("pas foto tampil di biodata rapor", async ({ page, masuk }) => {
  await masuk("admin");
  await page.goto("/dashboard/rapor");
  await pilih(selectBerlabel(page, "Kelas"), "4A");
  await pilih(selectBerlabel(page, "Peserta Didik"), "Abner Kogoya");
  const foto = page.locator('.rapor-preview [data-foto-rapor="ada"] img');
  await expect(foto).toBeVisible();
  await expect.poll(() => foto.evaluate((img) => img.naturalWidth)).toBeGreaterThan(0);

  // Siswa tanpa foto: kotak kosong untuk ditempel foto cetak
  await pilih(selectBerlabel(page, "Peserta Didik"), "Debora Tabuni");
  await expect(page.locator('.rapor-preview [data-foto-rapor="kosong"]')).toContainText("Pas foto");
});

test("wali kelas membuka dashboard pribadi siswa binaannya, tanpa video dan tagihan", async ({ page, masuk }) => {
  await masuk("guru");
  await page.goto("/dashboard/portal?siswa=SIS-E1");
  await expect(page.locator("[data-judul-portal]")).toHaveText("Abner Kogoya");
  await expect(page.getByText("Dashboard Pribadi Siswa")).toBeVisible();
  await expect(page.getByAltText("Foto Abner Kogoya")).toBeVisible();
  await expect(page.getByText("Profil STNKM")).toBeVisible();
  await expect(page.locator("ul.nav-pills .nav-link").filter({ hasText: "Rapor" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Unduh pas foto" })).toBeVisible();
  await expect(page.locator(".video-portal")).toHaveCount(0);
  await expect(page.locator("main").getByText("Tagihan Sekolah")).toHaveCount(0);

  // Siswa kelas lain ditolak server
  await page.goto("/dashboard/portal?siswa=SIS-E5");
  await expect(page.locator(".alert-warning")).toContainText("hanya untuk admin, kepala sekolah, dan wali kelasnya");
});

test("orang tua melihat pas foto anak di portal", async ({ page, masuk }) => {
  await masuk("ortu");
  await page.goto("/dashboard/portal");
  const foto = page.getByAltText("Foto Abner Kogoya");
  await expect(foto).toBeVisible();
  await expect.poll(() => foto.evaluate((img) => img.naturalWidth)).toBeGreaterThan(0);
  await expect(page.locator("[data-judul-portal]")).toContainText("Halo");
});

test.afterAll(async () => {
  // Bersihkan foto agar tes lain melihat data awal
  const admin = await masukApi("admin");
  await fetch(`${API}/api/siswa/SIS-E1/foto`, { method: "DELETE", headers: { Authorization: `Bearer ${admin.access_token}`, Accept: "application/json" } });
});

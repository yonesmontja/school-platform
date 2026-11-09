// Pustaka Dokumen: admin mengunggah dokumen resmi (langsung dipakai AI), mengizinkan guru mengunggah,
// unggahan guru menunggu persetujuan kepala sekolah, lalu bagian dokumen terlihat di uji pencarian.
const path = require("path");
const { test, expect, unggahApi } = require("../bantu");

test.describe.configure({ mode: "serial" });
const BERKAS = { nama: "berkas", path: path.join(__dirname, "../data/cp-bahasa-inggris.txt"), tipe: "text/plain" };

test("admin mengunggah dokumen resmi dan mengizinkan guru; guru mengajukan, kepala sekolah menyetujui", async ({ page, masuk }) => {
  const admin = await masuk("admin");
  await unggahApi(admin, "/dokumen-rujukan", { judul: "CP Bahasa Inggris E2E", jenis: "CP" }, BERKAS);
  await page.goto("/dashboard/pustaka-dokumen");
  const baris = page.locator("tr", { hasText: "CP Bahasa Inggris E2E" });
  await expect(baris).toContainText("Dipakai AI");
  await expect(baris).toContainText("karakter");

  // Detail: teks yang dibaca AI
  await baris.getByRole("button", { name: "CP Bahasa Inggris E2E", exact: true }).click();
  const detail = page.getByRole("dialog", { name: /Dokumen CP Bahasa Inggris E2E/ });
  await expect(detail).toContainText("Elemen Menyimak");
  await detail.getByRole("button", { name: "Tutup" }).click();

  // Uji pencarian menampilkan bagian dokumen yang dibaca AI
  await page.getByText("Uji: bagian dokumen mana yang dibaca AI?").click();
  await page.getByLabel("Topik uji").fill("bahasa inggris menyimak kosakata");
  await page.getByLabel("Topik uji").press("Enter");
  await expect(page.locator("pre", { hasText: "Elemen Menyimak" })).toBeVisible();

  // Admin mengizinkan guru mengunggah
  const izin = page.getByLabel("Izinkan semua guru mengunggah dan memperbarui dokumen");
  await izin.click();
  await expect(page.locator(".swal2-toast")).toContainText("Semua guru kini bisa mengunggah");
  await expect(izin).toBeChecked();

  const guru = await masuk("guru");
  await unggahApi(guru, "/dokumen-rujukan", { judul: "Panduan Guru E2E", jenis: "PANDUAN" }, BERKAS);
  await page.goto("/dashboard/pustaka-dokumen");
  await expect(page.getByRole("button", { name: "Tambah dokumen" })).toBeVisible();
  await expect(page.locator("tr", { hasText: "Panduan Guru E2E" })).toContainText("Menunggu persetujuan");

  await masuk("kepsek");
  await page.goto("/dashboard/pustaka-dokumen?status=DIAJUKAN");
  const ajuan = page.locator("tr", { hasText: "Panduan Guru E2E" });
  await ajuan.getByRole("button", { name: /^Aksi dokumen/ }).click();
  await page.locator(".menu-aksi").getByRole("menuitem", { name: "Setujui (dipakai AI)" }).click();
  await page.getByRole("button", { name: /^Semua/ }).click();
  await expect(page.locator("tr", { hasText: "Panduan Guru E2E" })).toContainText("Dipakai AI");
});

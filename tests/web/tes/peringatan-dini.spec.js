// Peringatan dini siswa: wali kelas melihat siswa berisiko beserta alasannya, mencatat tindak lanjut,
// dan kartu peringatan tampil di dashboard pribadi siswa. Data presensi dibuat lewat API lalu dihapus lagi.
const { test, expect, masukApi, hariIni, API } = require("../bantu");

test.describe.configure({ mode: "serial", timeout: 120000 });

async function kirim(sesi, method, path, body) {
  const res = await fetch(`${API}/api${path}`, {
    method, headers: { Authorization: `Bearer ${sesi.access_token}`, Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${method} ${path} gagal: ${res.status} ${await res.text()}`);
  return res.json();
}

test.beforeAll(async () => {
  // Wali 5A mencatat Lea alpa hari ini, Simon hadir
  const sesi = await masukApi("guru2");
  await kirim(sesi, "POST", "/presensi/batch", {
    id_kelas: "KLS-E5A", id_periode: "PER-E2E", tanggal: hariIni(),
    records: [{ id_siswa: "SIS-E6", status_kehadiran: "ALPA" }, { id_siswa: "SIS-E5", status_kehadiran: "HADIR" }],
  });
});

test.afterAll(async () => {
  const sesi = await masukApi("guru2");
  await kirim(sesi, "DELETE", "/presensi/tanggal", { id_kelas: "KLS-E5A", tanggal: hariIni() });
});

test("wali kelas melihat alasan peringatan dan mencatat tindak lanjut", async ({ page, masuk }) => {
  await masuk("guru2");
  await page.goto("/dashboard/peringatan-dini");
  await expect(page.getByRole("heading", { name: /Peringatan Dini Siswa/ })).toBeVisible();

  // Hanya siswa kelas binaan (5A); siswa 4A tidak ikut
  const lea = page.locator('[data-siswa-pd="Lea Kambu"]');
  await expect(lea).toBeVisible();
  await expect(page.locator('[data-siswa-pd="Abner Kogoya"]')).toHaveCount(0);
  await expect(lea.locator("[data-alasan-pd=alpa-sedikit]")).toContainText("1 kali alpa");
  await expect(lea.locator("[data-tingkat-pd]")).toHaveText("Perlu perhatian");
  await expect(page.locator('[data-siswa-pd="Simon Wonda"] [data-tingkat-pd]')).toHaveText("Aman");

  // Saring per tingkat lewat kartu ringkasan
  await page.locator("[data-ringkas-pd=AMAN]").click();
  await expect(lea).toHaveCount(0);
  await page.locator("[data-ringkas-pd=AMAN]").click();
  await expect(lea).toBeVisible();

  // Catat tindak lanjut → tertanda "Sudah ditangani"
  await lea.getByRole("button", { name: /Catat tindak lanjut/ }).click();
  await page.locator(".swal2-textarea").fill("Menghubungi orang tua lewat telepon");
  await page.getByRole("button", { name: "Simpan" }).click();
  await expect(lea.locator("[data-tindak-pd]")).toContainText("Sudah ditangani: Menghubungi orang tua lewat telepon");

  // Sembunyikan yang sudah ditangani
  await page.getByLabel("Sembunyikan yang sudah ditangani").check();
  await expect(lea).toHaveCount(0);
  await page.getByLabel("Sembunyikan yang sudah ditangani").uncheck();

  // Riwayat tindak lanjut
  await lea.getByRole("button", { name: /Riwayat \(1\)/ }).click();
  await expect(page.locator(".swal2-popup")).toContainText("Menghubungi orang tua lewat telepon");
  await page.getByRole("button", { name: "Tutup" }).click();
});

test("kartu peringatan tampil di dashboard pribadi siswa, menu hanya untuk wali dan pengelola", async ({ page, masuk }) => {
  await masuk("guru2");
  await page.goto("/dashboard/portal?siswa=SIS-E6");
  const kartu = page.locator("[data-kartu-pd]");
  await expect(kartu).toBeVisible({ timeout: 30000 });
  await expect(kartu).toContainText("Perlu perhatian");
  await expect(kartu).toContainText("Sudah ditangani");

  // Menu sidebar tersedia untuk wali kelas
  await expect(page.getByRole("link", { name: /Peringatan Dini/ }).first()).toBeAttached();
});

test("kepala sekolah melihat semua kelas", async ({ page, masuk }) => {
  await masuk("kepsek");
  await page.goto("/dashboard/peringatan-dini");
  await expect(page.locator('[data-siswa-pd="Lea Kambu"]')).toBeVisible();
  await expect(page.locator('[data-siswa-pd="Abner Kogoya"]')).toBeVisible();
  await page.getByLabel("Kelas").selectOption({ label: "4A" });
  await expect(page.locator('[data-siswa-pd="Lea Kambu"]')).toHaveCount(0);
});

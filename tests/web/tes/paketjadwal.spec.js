// Paket jadwal dari Promes (sesi semester disusun dari ATP & minggu efektif, ditinjau lalu diaktifkan)
// dan isian guru otomatis mengikuti pengampu mapel di form jadwal.
const { test, expect, pilih, selectBerlabel, hariIni, API } = require("../bantu");

test.describe.configure({ mode: "serial" });

test("guru menyusun paket jadwal dari Prota & Promes lalu mengaktifkannya", async ({ page, masuk }) => {
  test.setTimeout(150_000);
  const sesi = await masuk("guru");
  await fetch(`${API}/api/perangkat-ajar/atp`, {
    method: "POST", headers: { Authorization: `Bearer ${sesi.access_token}`, Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ judul: "ATP Paket E2E", id_mapel: "MPL-EMTK", id_kelas: "KLS-E4A", id_periode: "PER-E2E", jp_per_minggu: 2,
      baris: [{ id_materi: "MTR-E1", id_indikator: "IND-E1", alokasi_jp: 4, minggu: "1-2" }, { id_materi: "MTR-E1", id_indikator: "IND-E2", alokasi_jp: 4, minggu: "3-4" }] }),
  });

  await page.goto("/dashboard/program-ajar?mapel=MPL-EMTK&kelas=KLS-E4A");
  await expect(page.getByText("Ketercapaian JP")).toBeVisible({ timeout: 60_000 }); // API tes bisa lambat saat mesin sibuk
  await page.getByRole("button", { name: "Susun jadwal otomatis" }).click();
  const modal = page.getByRole("dialog", { name: "Paket jadwal dari Promes" });
  await expect(modal.getByLabel("Mata pelajaran")).toHaveValue("MPL-EMTK", { timeout: 60_000 });
  await expect(modal).toContainText("ATP acuan", { timeout: 60_000 });

  // Satu jam pelajaran mingguan: Sabtu 10:00–11:10 (2 JP)
  await modal.getByRole("button", { name: "Tambah jam" }).click();
  await modal.getByLabel("Hari jam 1").selectOption("6");
  await modal.getByLabel("Mulai jam 1").fill("10:00");
  await modal.getByLabel("Selesai jam 1").fill("11:10");
  await expect(modal).toContainText("2 JP/minggu");

  await modal.getByRole("button", { name: "Pratinjau paket" }).click();
  await expect(modal.locator("table")).toContainText("TP 1", { timeout: 60_000 });
  await expect(modal.locator("tbody .badge", { hasText: "Baru" }).first()).toBeVisible();
  const tombol = modal.getByRole("button", { name: /^\W*Aktifkan \d+ sesi$/ });
  await expect(tombol).toBeEnabled();
  await tombol.click();
  await page.locator(".swal2-confirm").click();
  await expect(page.locator(".swal2-toast")).toContainText("sesi dari paket Promes diaktifkan");
  await expect(modal).toHaveCount(0);

  // Pratinjau ulang: sesi tadi kini "Sudah ada", tidak digandakan
  await page.getByRole("button", { name: "Susun jadwal otomatis" }).click();
  await modal.getByRole("button", { name: "Tambah jam" }).click();
  await modal.getByLabel("Hari jam 1").selectOption("6");
  await modal.getByLabel("Mulai jam 1").fill("10:00");
  await modal.getByLabel("Selesai jam 1").fill("11:10");
  await modal.getByRole("button", { name: "Pratinjau paket" }).click();
  await expect(modal.locator("tbody .badge", { hasText: "Sudah ada" }).first()).toBeVisible({ timeout: 60_000 });
});

test("admin memilih mapel: guru otomatis terisi pengampu mapel, tetap bisa diganti", async ({ page, masuk }) => {
  await masuk("admin");
  await page.goto("/dashboard/jadwal");
  await page.getByRole("button", { name: "Buat" }).first().click();
  const form = page.locator(".jadwal-form");
  const guru = selectBerlabel(form, "Guru / Instruktur");
  await pilih(selectBerlabel(form, "Mata Pelajaran"), "Matematika");
  await expect(form).toContainText("Otomatis: guru pengampu mapel");
  const pengampu = await guru.inputValue();
  expect(pengampu).not.toBe("");

  // Ganti ke guru lain → peringatan + tombol kembalikan
  const lain = await guru.locator("option").evaluateAll((o, p) => o.map((x) => x.value).find((v) => v && v !== p), pengampu);
  await guru.selectOption(lain);
  await expect(form).toContainText("Bukan pengampu mapel");
  await form.getByRole("button", { name: "Kembalikan" }).click();
  await expect(guru).toHaveValue(pengampu);
});

test("detail sesi tanpa perangkat ajar terbuka tanpa error", async ({ page, masuk }) => {
  const sesi = await masuk("guru");
  const res = await fetch(`${API}/api/jadwal`, {
    method: "POST", headers: { Authorization: `Bearer ${sesi.access_token}`, Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ id_mapel: "MPL-EMTK", id_kelas: "KLS-E4A", pola: "sekali", mulai: `${hariIni()}T17:00`, selesai: `${hariIni()}T17:35`, abaikan_bentrok: true }),
  });
  expect(res.status).toBe(201);
  await page.goto("/dashboard/jadwal");
  await page.locator(".jadwal-today", { hasText: "17:00" }).first().click({ timeout: 60_000 });
  const detail = page.getByRole("complementary", { name: "Detail sesi" });
  await expect(detail).toBeVisible();
  await expect(detail).not.toContainText("Perangkat ajar tertaut");
  await expect(page.getByText("Halaman ini mengalami gangguan")).toHaveCount(0);
});

// Input saat sinyal putus: nilai & jurnal disimpan di HP (IndexedDB), lalu terkirim otomatis saat online lagi.
const { test, expect, api, pilih, selectBerlabel, hariIni } = require("../bantu");

test.describe.configure({ mode: "serial" });

const antrean = (page) => page.getByRole("button", { name: /kiriman offline menunggu/ });

test("jurnal yang ditulis offline terkirim setelah tersambung, lengkap dengan analisis STNKM", async ({ page, context, masuk }) => {
  const sesi = await masuk("guru");
  await page.goto("/dashboard/jurnal");
  const form = page.locator("form").filter({ hasText: "Narasi Kejadian" });
  await pilih(selectBerlabel(form, "Kelas"), "4A");
  await pilih(selectBerlabel(form, "Siswa"), "Rahel Yikwa");
  const narasi = "Rahel memimpin doa pagi dan mengajak teman berbaris rapi (ditulis saat offline).";
  await form.getByPlaceholder("Ketik kejadian anekdotal").fill(narasi);

  await context.setOffline(true);
  await expect(page.getByText("Anda sedang offline.")).toBeVisible();
  await form.getByRole("button", { name: /Posting Jurnal/ }).click();
  await expect(page.locator(".swal2-popup")).toContainText("Jurnal disimpan di HP");
  await page.getByRole("button", { name: "Mengerti" }).click();
  await expect(antrean(page)).toContainText("1");

  await context.setOffline(false);
  await expect(page.locator(".swal2-popup")).toContainText("1 kiriman offline berhasil dikirim");
  await expect(antrean(page)).toHaveCount(0);

  const feed = await api(sesi, "/jurnal?id_kelas=KLS-E4A");
  const jurnal = feed.data.find((j) => j.narasi_kejadian === narasi);
  expect(jurnal, "jurnal offline tersimpan di server").toBeTruthy();
  expect(jurnal.ai_mode).toBeTruthy();
});

test("nilai yang diisi offline tersimpan di HP lalu terkirim saat online", async ({ page, context, masuk }) => {
  const sesi = await masuk("guru");
  await page.goto("/dashboard/nilai");
  await pilih(selectBerlabel(page, "Kelas"), "4A");
  await pilih(selectBerlabel(page, "Mata Pelajaran"), "Matematika");
  await pilih(selectBerlabel(page, "Jenis Penilaian"), "Ulangan Harian");
  // Materi khusus tes ini (tanpa indikator), agar tidak bergantung pada nilai dari alur.spec.js
  await pilih(selectBerlabel(page, "Topik / Materi"), "Bilangan Cacah");
  const isian = (nama) => page.locator(`input[aria-label="Nilai ${nama}"]`);
  await expect(isian("Rahel Yikwa")).toBeVisible();
  for (const [nama, n] of [["Abner Kogoya", 88], ["Debora Tabuni", 92], ["Natan Murib", 79], ["Rahel Yikwa", 85]]) {
    await isian(nama).fill(String(n));
  }

  await context.setOffline(true);
  await page.getByRole("button", { name: "Simpan Nilai Kelas" }).click();
  await expect(page.locator(".swal2-popup")).toContainText("Disimpan di HP");
  await page.getByRole("button", { name: "Mengerti" }).click();
  await expect(page.getByText("Menunggu dikirim").first()).toBeVisible();
  await expect(antrean(page)).toContainText("1");

  await context.setOffline(false);
  await expect(page.locator(".swal2-popup")).toContainText("1 kiriman offline berhasil dikirim");

  const lembar = await api(sesi, "/nilai/students?" + new URLSearchParams({
    id_kelas: "KLS-E4A", id_mapel: "MPL-EMTK", id_periode: "PER-E2E", id_jenis: "JNS-UH", id_materi: "MTR-E2", tanggal: hariIni(),
  }));
  expect(Number(lembar.students.find((s) => s.id_siswa === "SIS-E2").nilai)).toBe(92);
});

test("presensi yang diisi offline terkirim saat online", async ({ page, context, masuk }) => {
  const sesi = await masuk("guru2");
  await page.goto("/dashboard/presensi");
  await pilih(selectBerlabel(page, "Kelas"), "5A");
  await page.locator('label[for="ALPA_SIS-E6"]').click();

  await context.setOffline(true);
  await page.getByRole("button", { name: "Simpan Presensi" }).click();
  await expect(page.locator(".swal2-popup")).toContainText("Presensi disimpan di HP");
  await page.getByRole("button", { name: "Mengerti" }).click();
  await expect(antrean(page)).toContainText("1");

  await context.setOffline(false);
  await expect(page.locator(".swal2-popup")).toContainText("1 kiriman offline berhasil dikirim");
  await page.reload();
  await pilih(selectBerlabel(page, "Kelas"), "5A");
  await expect(page.locator("#ALPA_SIS-E6")).toBeChecked();
});

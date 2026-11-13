// Fase 20: editor jadwal menautkan perangkat ajar (panel per jenis, kosong bila belum ada), status sesi otomatis,
// lalu Prota & Promes menampilkan Gantt, tabel Promes, kalender minggu efektif, dan ekspor Excel/CSV/PDF.
const path = require("path");
const { test, expect, pilih, selectBerlabel, hariIni, API } = require("../bantu");
const XLSX = require(path.join(__dirname, "../../../apps/web/node_modules/xlsx"));

test.describe.configure({ mode: "serial" });

test("guru menautkan indikator & bank soal lewat editor jadwal; panel mapel tanpa indikator kosong", async ({ page, masuk }) => {
  test.setTimeout(150_000);
  await masuk("guru");
  await page.goto("/dashboard/jadwal");
  await page.getByRole("button", { name: "Buat" }).first().click();
  const form = page.locator(".jadwal-form");

  // Tanpa mapel, toolbar perangkat nonaktif
  await expect(form.locator(".pa-tool", { hasText: "Indikator" })).toBeDisabled();

  // Mapel tanpa indikator: panel terbuka dan kosong
  await pilih(selectBerlabel(form, "Mata Pelajaran"), "IPA");
  await form.locator(".pa-tool", { hasText: "Indikator" }).click();
  const panel = page.getByRole("complementary", { name: "Panel Indikator" });
  await expect(panel).toContainText("Belum ada indikator");
  await panel.getByRole("button", { name: "Selesai" }).click();

  await pilih(selectBerlabel(form, "Mata Pelajaran"), "Matematika");
  await pilih(selectBerlabel(form, "Kelas"), "4A");
  await form.locator(".pa-tool", { hasText: "Indikator" }).click();
  await expect(panel).toContainText("Pecahan Sederhana");
  await panel.getByRole("button", { name: /Menyebutkan pembilang dan penyebut/ }).click();
  await panel.getByRole("button", { name: "Selesai" }).click();

  // "/" di catatan membuka menu tautan cepat → Bank Soal
  const catatan = form.getByLabel("Persiapan alat, keselamatan & catatan guru");
  await catatan.fill("Siapkan kertas lipat ");
  await catatan.press("/");
  await page.getByRole("menuitem", { name: "Bank Soal" }).click();
  const soal = page.getByRole("complementary", { name: "Panel Bank Soal" });
  await soal.getByRole("button", { name: /Bacalah cerita pecahan/ }).click();
  await soal.getByRole("button", { name: "Selesai" }).click();
  await expect(catatan).toHaveValue("Siapkan kertas lipat ");
  await expect(form.locator(".pa-chip")).toHaveCount(2);
  await expect(form.locator(".pa-tool", { hasText: "Indikator" })).toContainText("1");

  await form.locator('xpath=//label[contains(normalize-space(.), "Tanggal")]/following::input[1]').fill(hariIni());
  await form.locator('xpath=//label[normalize-space(.)="Mulai"]/following::input[1]').fill("15:00");
  await form.locator('xpath=//label[normalize-space(.)="Selesai"]/following::input[1]').fill("16:10");
  await expect(form.getByLabel("Status")).toHaveValue("");
  await form.locator("#wa_panel").uncheck();
  await form.getByRole("button", { name: /^\W*Simpan$/ }).click();
  await expect(page.locator(".swal2-popup")).toContainText(/disimpan/i);

  // Detail sesi: perangkat tertaut dan status otomatis
  await page.goto("/dashboard/jadwal");
  await page.locator(".jadwal-today", { hasText: "15:00" }).first().click();
  const detail = page.getByRole("complementary", { name: "Detail sesi" });
  await expect(detail).toContainText("Perangkat ajar tertaut");
  await expect(detail).toContainText("Menyebutkan pembilang dan penyebut");
  await expect(detail).toContainText("Otomatis mengikuti jam sesi");
  await expect(detail.getByRole("link", { name: /Prota & Promes/ })).toBeVisible();
});

test("Prota & Promes: Gantt, tabel Promes, ekspor Excel/CSV/PDF", async ({ page, masuk, context }) => {
  test.setTimeout(150_000);
  const sesi = await masuk("guru");
  // ATP acuan (draf) agar Promes punya baris walau tes perangkat ajar belum berjalan
  await fetch(`${API}/api/perangkat-ajar/atp`, {
    method: "POST", headers: { Authorization: `Bearer ${sesi.access_token}`, Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ judul: "ATP Promes E2E", id_mapel: "MPL-EMTK", id_kelas: "KLS-E4A", id_periode: "PER-E2E", jp_per_minggu: 2,
      baris: [{ id_materi: "MTR-E1", id_indikator: "IND-E1", alokasi_jp: 4, minggu: "1-2" }, { id_materi: "MTR-E1", id_indikator: "IND-E2", alokasi_jp: 4, minggu: "3-4" }] }),
  });

  await page.goto("/dashboard/program-ajar?mapel=MPL-EMTK&kelas=KLS-E4A");
  await expect(page.getByRole("heading", { name: "Prota & Promes" })).toBeVisible();
  await expect(page.getByText("Ketercapaian JP")).toBeVisible({ timeout: 60_000 }); // API tes bisa lambat saat mesin sibuk
  await expect(page.locator(".gantt-row").first()).toBeVisible();
  await expect(page.locator(".gantt-legenda")).toContainText("Minggu tidak efektif");

  // Baris Gantt membuka daftar sesinya
  await page.locator(".gantt-row").first().click();
  await expect(page.locator(".gantt-detail")).toContainText("JP rencana");

  await page.getByRole("button", { name: "Tabel Promes" }).click();
  await expect(page.locator(".pa-matriks")).toContainText("Jumlah");

  // Excel: tiga lembar
  await page.getByRole("button", { name: "Ekspor" }).click();
  const [xlsx] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: /Excel/ }).click()]);
  expect(xlsx.suggestedFilename()).toMatch(/^Promes_Matematika_4A_Ganjil_2026-2027\.xlsx$/);
  const wb = XLSX.readFile(await xlsx.path());
  expect(wb.SheetNames).toEqual(["Promes", "Minggu Efektif", "Realisasi Sesi"]);
  const isi = XLSX.utils.sheet_to_json(wb.Sheets.Promes, { header: 1 });
  expect(isi[0][0]).toBe("PROGRAM SEMESTER (PROMES)");
  expect(isi.some((r) => r.includes("Tujuan Pembelajaran") && r.includes("Alokasi JP"))).toBeTruthy();

  // CSV
  await page.getByRole("button", { name: "Ekspor" }).click();
  const [csv] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: /CSV/ }).click()]);
  expect(csv.suggestedFilename()).toMatch(/\.csv$/);

  // PDF resmi: jendela cetak berisi judul dokumen
  await page.getByRole("button", { name: "Ekspor" }).click();
  const [jendela] = await Promise.all([context.waitForEvent("page"), page.getByRole("button", { name: /PDF resmi/ }).click()]);
  await jendela.evaluate(() => { window.print = () => {}; });
  await expect(jendela.locator("body")).toContainText("Program Semester (Promes)", { timeout: 20_000 });
  await jendela.close();

  // Prota: Gantt per bulan dengan seksi semester; ekspor Excel memuat lembar Prota
  await page.getByRole("tab", { name: /Prota/ }).click();
  await expect(page.locator(".gantt-seksi").first()).toContainText("Semester Ganjil");
  await page.getByRole("button", { name: "Ekspor" }).click();
  const [prota] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: /Excel/ }).click()]);
  expect(XLSX.readFile(await prota.path()).SheetNames).toEqual(expect.arrayContaining(["Prota", "Promes Ganjil", "Minggu Efektif Ganjil"]));
});

test("kepala sekolah menandai minggu tidak efektif; guru hanya melihat", async ({ page, masuk }) => {
  await masuk("kepsek");
  await page.goto("/dashboard/program-ajar?tab=kalender&mapel=MPL-EMTK&kelas=KLS-E4A");
  const saklar = page.getByLabel("Tidak efektif").first();
  await expect(saklar).toBeVisible({ timeout: 60_000 });
  await saklar.check();
  await page.getByPlaceholder("Keterangan (mis. Asesmen Sumatif)").fill("MPLS");
  await page.getByRole("button", { name: "Simpan kalender semester" }).click();
  await expect(page.locator(".swal2-toast")).toContainText("Kalender semester disimpan");
  await expect(page.locator(".pa-minggu-list .is-off").first()).toContainText("TE");

  await masuk("guru");
  await page.goto("/dashboard/program-ajar?tab=kalender&mapel=MPL-EMTK&kelas=KLS-E4A");
  await expect(page.locator(".pa-minggu-list")).toContainText("MPLS", { timeout: 60_000 });
  await expect(page.getByRole("button", { name: "Simpan kalender semester" })).toHaveCount(0);
});

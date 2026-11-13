// Poin STNKM manual di Input Nilai dan ekspor Excel Laporan STNKM per hari/minggu/bulan.
const path = require("path");
const XLSX = require(path.join(__dirname, "../../../apps/web/node_modules/xlsx"));
const { test, expect, pilih, selectBerlabel, API } = require("../bantu");

const META = { id_kelas: "KLS-E4A", id_mapel: "MPL-EMTK", id_periode: "PER-E2E", id_jenis: "JNS-UH", id_materi: "MTR-E1" };

test("guru mengisi poin S/T/N/K/M manual, disimpan apa adanya, lalu muncul di ekspor Excel harian", async ({ page, masuk }) => {
  const sesi = await masuk("guru");
  await page.goto("/dashboard/nilai");
  await pilih(selectBerlabel(page, "Kelas"), "4A");
  await pilih(selectBerlabel(page, "Mata Pelajaran"), "Matematika");
  await pilih(selectBerlabel(page, "Jenis Penilaian"), "Ulangan");
  await pilih(selectBerlabel(page, "Materi"), "Pecahan Sederhana");
  await page.locator("input[type=date]").first().fill("2026-10-07");

  await expect(page.getByLabel("Poin S Abner Kogoya")).toHaveCount(0);
  await page.getByLabel("Isi poin STNKM (S, T, N, K, M) secara manual").check();
  await page.getByLabel("Nilai Abner Kogoya").first().fill("40");
  const poin = { S: "21", T: "22", N: "23", K: "74", M: "75" };
  for (const [d, v] of Object.entries(poin)) await page.getByLabel(`Poin ${d} Abner Kogoya`).fill(v);
  await page.getByRole("button", { name: "Simpan Nilai Kelas" }).click();
  await expect(page.locator(".swal2-popup")).toContainText("Nilai disimpan");
  await page.getByRole("button", { name: "Mengerti" }).click();

  const res = await fetch(`${API}/api/nilai/students?${new URLSearchParams({ ...META, tanggal: "2026-10-07" })}`,
    { headers: { Accept: "application/json", Authorization: `Bearer ${sesi.access_token}` } });
  const abner = (await res.json()).students.find((s) => s.nama_siswa === "Abner Kogoya");
  expect(abner.metode_stnkm).toBe("MANUAL");
  expect(abner.poin).toEqual({ S: 21, T: 22, N: 23, K: 74, M: 75 });

  // Laporan STNKM: mode Harian, ekspor Excel memuat tren per hari dan data mentah lengkap S-T-N-K-M
  await page.goto("/dashboard/laporan-stnkm");
  await pilih(selectBerlabel(page, "Kelas"), "4A");
  await page.getByRole("button", { name: "Harian" }).click();
  const [unduhan] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Excel" }).click()]);
  expect(unduhan.suggestedFilename()).toMatch(/_Harian\.xlsx$/);
  const wb = XLSX.readFile(await unduhan.path());
  expect(wb.SheetNames).toEqual(expect.arrayContaining(["Rekap Siswa", "Tren Kelas Harian", "Tren Siswa Harian", "Rata Harian Siswa", "Data Mentah"]));
  const mentah = XLSX.utils.sheet_to_json(wb.Sheets["Data Mentah"]);
  const baris = mentah.find((r) => r.Siswa === "Abner Kogoya" && r.Tanggal === "2026-10-07" && r.Sumber === "Nilai");
  expect(baris).toMatchObject({ S: 21, T: 22, N: 23, K: 74, M: 75, "Metode STNKM": "Manual", Materi: "Pecahan Sederhana" });
  const tren = XLSX.utils.sheet_to_json(wb.Sheets["Tren Siswa Harian"]);
  expect(tren.some((r) => r.Siswa === "Abner Kogoya" && "Tanggal" in r)).toBeTruthy();
});

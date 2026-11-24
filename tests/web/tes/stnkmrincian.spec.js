// Laporan STNKM: sumber Akademik / Jurnal / Lengkap (dua sumbu atau konversi), baris rekap yang bisa diklik,
// dan halaman rincian siswa (tab Hari & Entri) yang angkanya sama dengan tabel rekap.
const path = require("path");
const { test, expect, pilih, selectBerlabel, API } = require("../bantu");

async function kirim(sesi, url, body) {
  const res = await fetch(`${API}/api${url}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: `Bearer ${sesi.access_token}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${url}: ${res.status} ${await res.text()}`);
}

const NARASI = "Rahel membantu temannya merapikan pojok baca tanpa diminta.";

test("rekap STNKM per sumber bisa diklik menuju rincian hari dan entri siswa", async ({ page, masuk }) => {
  const sesi = await masuk("guru");
  await kirim(sesi, "/nilai/batch", { id_kelas: "KLS-E4A", id_mapel: "MPL-EMTK", id_periode: "PER-E2E", id_jenis: "JNS-UH", id_materi: "MTR-E2",
    tanggal: "2026-10-13", records: [{ id_siswa: "SIS-E4", nilai: 80 }] });
  await kirim(sesi, "/jurnal/store", { tanggal: "2026-10-13", id_siswa: "SIS-E4", id_kelas: "KLS-E4A", narasi_kejadian: NARASI, mode_dampak: "PISAH", val_S: 3, val_K: -2 });
  await kirim(sesi, "/jurnal/store", { tanggal: "2026-10-14", id_siswa: "SIS-E4", id_kelas: "KLS-E4A", narasi_kejadian: "Rahel bertanya tentang cara menghitung uang kembalian.", mode_dampak: "PISAH", val_M: 4 });

  await page.goto("/dashboard/laporan-stnkm");
  await pilih(selectBerlabel(page, "Kelas"), "4A");
  const sumber = page.locator("[data-sumber-stnkm]");
  await expect(sumber.getByRole("button", { name: "Akademik" })).toHaveAttribute("aria-pressed", "true");

  // Mode Jurnal: rekap memakai skor jurnal saja
  await sumber.getByRole("button", { name: "Jurnal" }).click();
  const baris = page.locator('[data-rincian-siswa="SIS-E4"]');
  const sel = baris.locator("td");
  const hariTabel = await sel.nth(-3).innerText();
  const entriTabel = await sel.nth(-2).innerText();
  expect(Number(entriTabel)).toBeGreaterThanOrEqual(2);

  // Lengkap: pilihan dua sumbu / konversi tampil
  await sumber.getByRole("button", { name: "Lengkap" }).click();
  const cara = page.locator("[data-cara-lengkap]");
  await expect(cara).toContainText("Dua sumbu");
  // Grafik dua sumbu: legend berupa potongan garis (penuh / putus-putus), bukan bulatan besar
  await page.locator(".card", { hasText: "Tren Rata-rata Kelas" }).first().screenshot({ path: path.join(__dirname, "../hasil/stnkm-legend.png") });
  await cara.getByRole("button", { name: "Konversi 0–100" }).click();
  await expect(page.getByText(/dikonversi ke 0–100/).first()).toBeVisible();
  await page.locator(".card", { has: page.locator("[data-sumber-stnkm]") }).first().screenshot({ path: path.join(__dirname, "../hasil/stnkm-filter.png") });

  // Kembali ke Jurnal lalu buka rincian Rahel: jumlah hari & entri sama dengan tabel
  await sumber.getByRole("button", { name: "Jurnal" }).click();
  await baris.click();
  await expect(page).toHaveURL(/laporan-stnkm\/siswa\?.*id_siswa=SIS-E4.*sumber=JURNAL/);
  const rincian = page.locator("[data-rincian-stnkm]");
  await expect(rincian).toContainText("Rahel Yikwa");
  await expect(rincian).toContainText("STNKM Jurnal");
  await expect(page.locator("[data-tab-hari] .badge")).toHaveText(hariTabel);
  await expect(page.locator("[data-tab-entri] .badge")).toHaveText(entriTabel);

  await page.locator("[data-tab-entri]").click();
  const tabelEntri = page.locator("[data-tabel-entri]");
  await expect(tabelEntri).toContainText(NARASI);
  await expect(tabelEntri).not.toContainText("Matematika");
  await rincian.screenshot({ path: path.join(__dirname, "../hasil/stnkm-rincian.png") });

  // Ekspor Excel tersedia
  const unduhan = page.waitForEvent("download");
  await rincian.getByRole("button", { name: "Excel" }).click();
  expect((await unduhan).suggestedFilename()).toMatch(/^Rincian_STNKM_Rahel_Yikwa_Jurnal_.*\.xlsx$/);

  // Kembali ke laporan dengan filter yang sama (sumber Jurnal tetap aktif)
  await rincian.getByRole("link", { name: "Kembali ke laporan" }).click();
  await expect(page.locator("[data-sumber-stnkm]").getByRole("button", { name: "Jurnal" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator('[data-rincian-siswa="SIS-E4"]')).toBeVisible();

  // Mode Akademik: entri Rahel hanya dari nilai, tanpa jurnal
  await page.locator("[data-sumber-stnkm]").getByRole("button", { name: "Akademik" }).click();
  await page.locator('[data-rincian-siswa="SIS-E4"]').click();
  await page.locator("[data-tab-entri]").click();
  await expect(page.locator("[data-tabel-entri]")).toContainText("Matematika");
  await expect(page.locator("[data-tabel-entri]")).not.toContainText(NARASI);
});

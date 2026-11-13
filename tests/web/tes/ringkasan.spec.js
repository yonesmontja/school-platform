// Ringkasan sebelum menilai & presensi: penilaian/presensi terakhir bisa dibuka, progres capaian per materi.
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

const META = { id_kelas: "KLS-E4A", id_mapel: "MPL-EMTK", id_periode: "PER-E2E", id_jenis: "JNS-UH", id_materi: "MTR-E1" };

test("guru melihat penilaian terakhir dan progres materi, lalu membuka lembarnya dari kartu", async ({ page, masuk }) => {
  const sesi = await masuk("guru");
  await kirim(sesi, "/nilai/batch", { ...META, tanggal: "2026-10-05", records: [
    { id_siswa: "SIS-E1", nilai_indikator: { "IND-E1": 90, "IND-E2": 80 } },
    { id_siswa: "SIS-E2", nilai_indikator: { "IND-E1": 60, "IND-E2": 50 } },
  ] });

  await page.goto("/dashboard/nilai");
  await pilih(selectBerlabel(page, "Kelas"), "4A");
  await pilih(selectBerlabel(page, "Mata Pelajaran"), "Matematika");

  const kartu = page.getByTestId("ringkasan-nilai");
  await expect(kartu).toContainText("Ringkasan & progres · Matematika · 4A");
  await expect(kartu).toContainText("Pecahan Sederhana");
  await expect(kartu.getByRole("button", { name: /Pecahan Sederhana/ }).last()).toContainText("siswa tuntas");

  // Klik penilaian 5 Oktober (kartu utama bila terakhir, atau di daftar): lembarnya terbuka lengkap dengan nilainya
  await kartu.getByRole("button", { name: /5 Okt/ }).first().click();
  await expect(page.getByLabel("Nilai Abner Kogoya").first()).toHaveText("85");
  await expect(page.locator("input[type=date]").first()).toHaveValue("2026-10-05");
  await expect(page.getByTestId("ringkasan-materi")).toContainText("Membandingkan dua pecahan");
  await kartu.screenshot({ path: path.join(__dirname, "../hasil/ringkasan-nilai.png") });

  // Impor Excel menampilkan ringkasan yang sama
  await page.goto("/dashboard/import-excel");
  await pilih(selectBerlabel(page, "Kelas"), "4A");
  await pilih(selectBerlabel(page, "Mata Pelajaran"), "Matematika");
  await expect(page.getByTestId("ringkasan-nilai")).toContainText("Lihat di Input Nilai");
});

test("presensi menampilkan presensi terakhir dan membukanya dari kartu", async ({ page, masuk }) => {
  const sesi = await masuk("guru");
  await kirim(sesi, "/presensi/batch", { id_kelas: "KLS-E4A", id_periode: "PER-E2E", tanggal: "2026-10-06", records: [
    { id_siswa: "SIS-E1", status_kehadiran: "HADIR" }, { id_siswa: "SIS-E2", status_kehadiran: "ALPA" },
    { id_siswa: "SIS-E3", status_kehadiran: "SAKIT" }, { id_siswa: "SIS-E4", status_kehadiran: "HADIR" },
  ] });

  await page.goto("/dashboard/presensi");
  await pilih(selectBerlabel(page, "Kelas"), "4A");
  const kartu = page.getByTestId("ringkasan-presensi");
  await expect(kartu).toContainText("Ringkasan presensi · 4A");
  await expect(kartu).toContainText("Perlu perhatian");
  // Presensi 6 Oktober (kartu utama bila terakhir, atau di daftar) membuka lembar tanggal itu
  await kartu.getByRole("button", { name: /6 Okt/ }).first().click();
  await expect(page.locator("input[type=date]").first()).toHaveValue("2026-10-06");
  await kartu.screenshot({ path: path.join(__dirname, "../hasil/ringkasan-presensi.png") });
});

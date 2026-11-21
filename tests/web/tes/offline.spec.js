// Input saat sinyal putus: nilai & jurnal disimpan di HP (IndexedDB), lalu terkirim otomatis saat online lagi.
const { test, expect, api, pilih, selectBerlabel, hariIni, hariSekolahTerakhir } = require("../bantu");

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
  await page.locator('input[type="date"]').first().fill(hariSekolahTerakhir());
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
  await page.locator('input[type="date"]').first().fill(hariSekolahTerakhir());
  await expect(page.locator("#ALPA_SIS-E6")).toBeChecked();
});

// ===== Offline tahap 2: presensi per mapel, karya portofolio, benturan nilai, kartu kesiapan =====
const API_TES = require("../bantu").API;
const kirimApi = async (sesi, path, data) => {
  const r = await fetch(`${API_TES}/api${path}`, { method: "POST", headers: { Authorization: `Bearer ${sesi.access_token}`, Accept: "application/json", "Content-Type": "application/json" }, body: JSON.stringify(data) });
  if (!r.ok) throw new Error(`${path}: ${r.status} ${await r.text()}`);
  return r.json();
};

test("presensi per mapel yang diisi offline terkirim saat online", async ({ page, context, masuk }) => {
  const sesi = await masuk("guru");
  await page.goto("/dashboard/presensi");
  await pilih(selectBerlabel(page, "Kelas"), "4A");
  await page.locator('input[type="date"]').first().fill(hariSekolahTerakhir());
  await page.getByRole("button", { name: /Per mapel/ }).click();
  await page.getByLabel("Mata pelajaran presensi").selectOption({ label: "Matematika" });
  await expect(page.locator('label[for="HADIR_SIS-E3"]')).toBeVisible();

  await context.setOffline(true);
  await page.getByRole("button", { name: /Presensi Mapel/ }).click();
  await expect(page.locator(".swal2-popup")).toContainText("Presensi mapel disimpan di HP");
  await page.getByRole("button", { name: "Mengerti" }).click();
  await expect(antrean(page)).toContainText("1");

  await context.setOffline(false);
  await expect(page.locator(".swal2-popup")).toContainText("1 kiriman offline berhasil dikirim");
  const r = await api(sesi, "/presensi/mapel?" + new URLSearchParams({ id_kelas: "KLS-E4A", id_mapel: "MPL-EMTK", tanggal: hariSekolahTerakhir() }));
  expect(r.presensi_mapel.some((p) => p.id_siswa === "SIS-E3"), "presensi mapel tersimpan di server").toBeTruthy();
});

test("karya portofolio yang diunggah offline disimpan di HP (berkas utuh) dan bisa dibuang", async ({ page, context, masuk }) => {
  await masuk("guru");
  await page.goto("/dashboard/portofolio");
  await page.getByRole("button", { name: "Tambah karya" }).click();
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64");
  await page.getByLabel("Pilih foto atau video").setInputFiles({ name: "kincir.png", mimeType: "image/png", buffer: png });
  await page.getByPlaceholder("mis. Kincir angin dari botol bekas").fill("Kincir angin offline");
  await page.getByRole("button", { name: "Rahel Yikwa" }).click();

  await context.setOffline(true);
  await page.getByRole("button", { name: "Unggah" }).click();
  await expect(page.locator(".swal2-popup")).toContainText("Karya disimpan di HP");
  await page.getByRole("button", { name: "Mengerti" }).click();
  await expect(page.getByText("disimpan di HP dan akan diunggah saat ada sinyal")).toBeVisible();
  await expect(antrean(page)).toContainText("1");

  // Unggahan multipart dari halaman tidak bisa diteruskan ke API tes (lihat unggahApi di bantu.js): buang selagi offline
  await antrean(page).click();
  await expect(page.locator(".antrean-panel")).toContainText('Karya "Kincir angin offline" · 1 siswa');
  await page.getByRole("button", { name: /Buang Karya/ }).click();
  await page.locator(".swal2-confirm").click();
  await expect(antrean(page)).toHaveCount(0);
  await context.setOffline(false);
});

test("nilai offline yang bentrok dengan perubahan dari perangkat lain ditahan, lalu bisa ditimpa", async ({ page, context, masuk }) => {
  const sesi = await masuk("guru");
  const admin = await require("../bantu").masukApi("admin");
  const meta = { id_kelas: "KLS-E4A", id_mapel: "MPL-EMTK", id_periode: "PER-E2E", id_jenis: "JNS-UH", id_materi: "MTR-E2", tanggal: hariIni() };
  await page.goto("/dashboard/nilai");
  await pilih(selectBerlabel(page, "Kelas"), "4A");
  await pilih(selectBerlabel(page, "Mata Pelajaran"), "Matematika");
  await pilih(selectBerlabel(page, "Jenis Penilaian"), "Ulangan Harian");
  await pilih(selectBerlabel(page, "Topik / Materi"), "Bilangan Cacah");
  const isian = page.locator('input[aria-label="Nilai Debora Tabuni"]');
  await expect(isian).toHaveValue("92");

  await context.setOffline(true);
  await isian.fill("95");
  await page.getByRole("button", { name: "Simpan Nilai Kelas" }).click();
  await expect(page.locator(".swal2-popup")).toContainText("Disimpan di HP");
  await page.getByRole("button", { name: "Mengerti" }).click();

  // Sementara itu admin mengoreksi nilai yang sama dari perangkat lain
  await kirimApi(admin, "/nilai/batch", { ...meta, records: [{ id_siswa: "SIS-E2", nilai: 70 }] });

  await context.setOffline(false);
  await antrean(page).click();
  const bentrok = page.locator("[data-antrean-bentrok]");
  await expect(bentrok).toContainText("Debora Tabuni: 70 → 95", { timeout: 30_000 });
  expect(Number((await api(sesi, "/nilai/students?" + new URLSearchParams(meta))).students.find((s) => s.id_siswa === "SIS-E2").nilai)).toBe(70);

  await bentrok.getByRole("button", { name: /Timpa/ }).click();
  await expect(page.locator(".swal2-popup")).toContainText("Timpa nilai di server?");
  await page.getByRole("button", { name: "Timpa dengan kiriman saya" }).click();
  await expect(page.locator(".swal2-popup")).toContainText("Nilai ditimpa dengan kiriman Anda");
  await expect(antrean(page)).toHaveCount(0);
  expect(Number((await api(sesi, "/nilai/students?" + new URLSearchParams(meta))).students.find((s) => s.id_siswa === "SIS-E2").nilai)).toBe(95);
});

test("Akun Saya menampilkan kartu Mode Offline", async ({ page, masuk }) => {
  await masuk("guru");
  await page.goto("/dashboard/akun");
  // Tes memblokir service worker, jadi kartu menjelaskan bahwa mode offline belum aktif di peramban ini
  await expect(page.locator("[data-siap-offline]")).toContainText("Mode Offline");
  await expect(page.locator("[data-siap-offline]")).toContainText("Mode offline belum aktif");
});

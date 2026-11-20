// Mode HP "Hari ini" untuk guru: presensi cepat kelas binaan dengan tombol besar, tersimpan saat offline
// lalu terkirim otomatis begitu tersambung; pintasan dari beranda di layar HP.
const { test, expect, masukApi, api, hariIni, API } = require("../bantu");

test.describe.configure({ mode: "serial", timeout: 150000 });
test.use({ viewport: { width: 390, height: 844 } });

async function hapusPresensi() {
  const sesi = await masukApi("guru");
  await fetch(`${API}/api/presensi/tanggal`, {
    method: "DELETE", headers: { Authorization: `Bearer ${sesi.access_token}`, Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ id_kelas: "KLS-E4A", tanggal: hariIni() }),
  });
}

test.beforeAll(hapusPresensi);
test.afterAll(hapusPresensi);

test("wali kelas mengisi presensi cepat dari mode Hari Ini", async ({ page, masuk }) => {
  const sesi = await masuk("guru");
  const ringkas = await api(sesi, "/hari-ini");
  test.skip(Boolean(ringkas.bukan_hari_presensi || ringkas.libur), "Hari ini bukan hari presensi di server");

  // Pintasan dari beranda (hanya tampil di layar HP)
  await page.goto("/dashboard");
  await page.locator("[data-pintas-hari-ini]").click();
  await expect(page).toHaveURL(/\/dashboard\/hari-ini/, { timeout: 60000 });
  await expect(page.locator("[data-judul-hari-ini]")).toContainText(/Selamat/, { timeout: 60000 });

  const kartu = page.locator('[data-kartu-presensi="4A"]');
  await expect(kartu.locator("[data-status-presensi]")).toContainText("Belum diisi");
  await kartu.getByRole("button", { name: /Isi presensi cepat/ }).click();

  const lembar = page.locator('[data-presensi-cepat="4A"]');
  await expect(lembar).toBeVisible();
  await lembar.getByRole("button", { name: "Sakit Debora Tabuni" }).click();
  await lembar.getByLabel("Keterangan Debora Tabuni").fill("Demam");
  await expect(lembar).toContainText("S 1");
  await lembar.getByRole("button", { name: /Simpan presensi/ }).click();

  await expect(kartu.locator("[data-status-presensi]")).toContainText("Sudah diisi · 1 tidak hadir");
  await expect(kartu).toContainText("Debora Tabuni · Sakit");
  const data = await api(sesi, `/presensi?id_kelas=KLS-E4A&id_periode=PER-E2E&tanggal=${hariIni()}`);
  expect(JSON.stringify(data)).toContain("SAKIT");
});

test("presensi cepat saat offline disimpan di HP lalu terkirim otomatis", async ({ page, masuk }) => {
  const sesi = await masuk("guru");
  const ringkas = await api(sesi, "/hari-ini");
  test.skip(Boolean(ringkas.bukan_hari_presensi || ringkas.libur), "Hari ini bukan hari presensi di server");

  await page.goto("/dashboard/hari-ini");
  const kartu = page.locator('[data-kartu-presensi="4A"]');
  await kartu.getByRole("button", { name: /presensi/ }).click();
  const lembar = page.locator('[data-presensi-cepat="4A"]');
  await lembar.getByRole("button", { name: "Alpa Natan Murib" }).click();

  await page.context().setOffline(true);
  await lembar.getByRole("button", { name: /Simpan presensi/ }).click();
  await expect(page.locator(".swal2-popup")).toContainText("Disimpan di HP");
  await page.getByRole("button", { name: "Mengerti" }).click();
  await expect(kartu.locator("[data-status-presensi]")).toContainText("menunggu sinyal");

  // Tersambung lagi: antrean terkirim otomatis
  await page.context().setOffline(false);
  await expect.poll(async () => {
    const r = await api(sesi, "/hari-ini");
    return r.kelas_binaan.find((k) => k.id_kelas === "KLS-E4A")?.siswa.find((s) => s.id_siswa === "SIS-E3")?.status;
  }, { timeout: 60000 }).toBe("ALPA");
});

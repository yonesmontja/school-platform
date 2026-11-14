// Presensi lanjutan: hari bukan sekolah terkunci, keterangan → jurnal catatan terpisah, presensi per mapel,
// Rekap Per Hari, kartu yang bisa dilipat, dan pembinaan kehadiran (rencana → jurnal → selesai).
const { test, expect, api, pilih, selectBerlabel, hariSekolahTerakhir, API } = require("../bantu");

test.describe.configure({ mode: "serial" });

const kirim = async (sesi, path, data) => {
  const r = await fetch(`${API}/api${path}`, { method: "POST", headers: { Authorization: `Bearer ${sesi.access_token}`, Accept: "application/json", "Content-Type": "application/json" }, body: JSON.stringify(data) });
  if (!r.ok) throw new Error(`${path}: ${r.status} ${await r.text()}`);
  return r.json();
};
const tanggal = (page) => page.locator('input[type="date"]').first();

test("Sabtu/Minggu terkunci; keterangan sakit tercatat ke jurnal; rekap per hari; kartu bisa dilipat", async ({ page, masuk }) => {
  test.setTimeout(150_000);
  const sesi = await masuk("guru");
  await page.goto("/dashboard/presensi");
  await pilih(selectBerlabel(page, "Kelas"), "4A");

  await tanggal(page).fill("2026-11-08");
  await expect(page.getByText("Hari Minggu: libur, tidak ada presensi.")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole("button", { name: /Simpan Presensi/ })).toHaveCount(0);
  await tanggal(page).fill("2026-11-07");
  await expect(page.getByText(/Hari Sabtu: sekolah 5 hari/)).toBeVisible();

  await tanggal(page).fill(hariSekolahTerakhir());
  await page.locator('label[for="SAKIT_SIS-E3"]').click();
  const namaE3 = (await api(sesi, "/presensi?id_kelas=KLS-E4A&id_periode=PER-E2E")).students.find((x) => x.id_siswa === "SIS-E3").nama_siswa;
  const ket = page.getByLabel(`Keterangan ${namaE3}`);
  await ket.fill("demam sejak semalam");
  await page.getByRole("button", { name: /Simpan Presensi|Perbarui Presensi|Simpan Ulang/ }).click();
  const panel = page.locator(".modal").filter({ hasText: "Presensi Tersimpan" });
  await expect(panel).toBeVisible({ timeout: 30_000 });
  await panel.getByRole("button", { name: "Selesai & Tutup" }).click();

  const jurnal = (await api(sesi, "/jurnal?id_kelas=KLS-E4A")).data;
  const catatan = jurnal.find((j) => j.id_siswa === "SIS-E3" && /demam sejak semalam/.test(j.narasi_kejadian || ""));
  expect(catatan, "keterangan masuk jurnal").toBeTruthy();
  expect(catatan.mode_dampak).toBe("PISAH");

  // Riwayat: keterangan tampil, dan ada Rekap Per Hari (Senin–Jumat)
  await expect(page.locator("td", { hasText: "demam sejak semalam" }).first()).toBeVisible();
  await page.getByRole("button", { name: /Rekap Per Hari/ }).click();
  for (const h of ["Senin", "Selasa", "Rabu", "Kamis", "Jumat"]) await expect(page.locator("td", { hasText: h }).first()).toBeVisible();

  // Lembar & riwayat bisa dilipat
  await page.getByRole("button", { name: "Sembunyikan lembar presensi" }).click();
  await expect(page.locator('label[for="SAKIT_SIS-E3"]')).toHaveCount(0);
  await page.getByRole("button", { name: "Tampilkan lembar presensi" }).click();
  await expect(page.locator('label[for="SAKIT_SIS-E3"]')).toBeVisible();
  await page.getByRole("button", { name: "Sembunyikan riwayat presensi" }).click();
  await expect(page.getByRole("button", { name: /Rekap Per Hari/ })).toBeVisible(); // kepala kartu tetap ada
  await expect(page.locator("td", { hasText: "Senin" })).toHaveCount(0);
  await page.getByRole("button", { name: "Tampilkan riwayat presensi" }).click();
});

test("guru mapel mengisi presensi per mapel dengan keterangan", async ({ page, masuk }) => {
  const sesi = await masuk("guru");
  await page.goto("/dashboard/presensi");
  await pilih(selectBerlabel(page, "Kelas"), "4A");
  await tanggal(page).fill(hariSekolahTerakhir());
  await page.getByRole("button", { name: /Per mapel/ }).click();
  await page.getByLabel("Mata pelajaran presensi").selectOption({ label: "Matematika" });
  const nama = (await api(sesi, "/presensi?id_kelas=KLS-E4A&id_periode=PER-E2E")).students.find((x) => x.id_siswa === "SIS-E1").nama_siswa;
  await page.locator('label[for="IZIN_SIS-E1"]').click();
  await page.getByLabel(`Keterangan ${nama}`).fill("dijemput orang tua pukul 10");
  await page.getByRole("button", { name: /Presensi Mapel/ }).click();
  await expect(page.locator(".swal2-popup")).toContainText("Presensi Matematika disimpan", { timeout: 30_000 });
  const jurnal = (await api(sesi, "/jurnal?id_kelas=KLS-E4A")).data;
  expect(jurnal.some((j) => /Presensi Matematika: Izin — dijemput orang tua/.test(j.narasi_kejadian || ""))).toBeTruthy();
});

test("pembinaan kehadiran: rencana dari daftar perlu perhatian, dicatat ke jurnal, lalu selesai", async ({ page, masuk }) => {
  test.setTimeout(150_000);
  const sesi = await masuk("guru");
  // Tiga kali alpa → masuk daftar "Perlu perhatian"
  for (const t of ["2026-10-12", "2026-10-13", "2026-10-14"]) {
    await kirim(sesi, "/presensi/batch", { id_kelas: "KLS-E4A", id_periode: "PER-E2E", tanggal: t, records: [{ id_siswa: "SIS-E4", status_kehadiran: "ALPA" }] });
  }
  const nama = (await api(sesi, "/presensi?id_kelas=KLS-E4A&id_periode=PER-E2E")).students.find((s) => s.id_siswa === "SIS-E4").nama_siswa;

  await page.goto("/dashboard/presensi");
  await pilih(selectBerlabel(page, "Kelas"), "4A");
  await page.getByRole("button", { name: `Rencanakan pembinaan ${nama}` }).click({ timeout: 60_000 });
  const form = page.getByRole("dialog", { name: "Rencana pembinaan kehadiran" });
  await form.getByLabel("Menghubungi orang tua/wali (WA atau telepon)").check();
  await form.getByLabel("Tindakan lain (tulis sendiri, satu per baris)").fill("Mengatur antar-jemput bersama tetangga");
  await form.getByRole("button", { name: "Simpan rencana" }).click();
  await expect(page.locator(".swal2-toast")).toContainText("Rencana pembinaan disimpan");

  const kartu = page.locator("#pembinaan-presensi");
  await expect(kartu).toContainText(nama);
  await expect(kartu).toContainText("Mengatur antar-jemput bersama tetangga");
  await expect(kartu).toContainText("Otomatis · Berlangsung");
  await expect(page.getByRole("button", { name: `Lihat pembinaan ${nama}` })).toBeVisible();

  // Catat ke jurnal (catatan terpisah)
  await kartu.getByRole("button", { name: `Aksi pembinaan ${nama}` }).click();
  await page.getByRole("menuitem", { name: "Catat ke jurnal" }).click();
  const dj = page.getByRole("dialog", { name: `Catat ke jurnal · ${nama}` });
  await dj.getByLabel("Respons siswa (opsional)").fill("Siswa berjanji datang tepat waktu dan minta dibangunkan lebih pagi.");
  await dj.getByRole("button", { name: "Simpan ke jurnal" }).click();
  await expect(page.locator(".swal2-toast")).toContainText("Tercatat di jurnal");
  await expect(kartu).toContainText("1 catatan");

  // Tandai selesai → hilang dari daftar Aktif
  await kartu.getByRole("button", { name: `Aksi pembinaan ${nama}` }).click();
  await page.getByRole("menuitem", { name: "Tandai selesai" }).click();
  await page.locator(".swal2-textarea").fill("Orang tua membantu; kehadiran membaik.");
  await page.getByRole("button", { name: "Tandai selesai" }).click();
  await expect(kartu).toContainText("Tidak ada pembinaan yang sedang berjalan.");
  await kartu.getByRole("button", { name: "Semua" }).click();
  await expect(kartu).toContainText("kehadiran membaik");
});

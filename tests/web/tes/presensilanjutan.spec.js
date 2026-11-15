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

// Menu aksi menutup sendiri saat halaman bergulir (mis. data selesai dimuat ulang): ulangi klik sampai menu tampil
const bukaAksi = async (page, kartu, nama) => {
  await expect(async () => {
    await kartu.getByRole("button", { name: `Aksi pembinaan ${nama}` }).click();
    await expect(page.getByRole("menuitem").first()).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 30_000 });
};
// Buka menu aksi, pilih item, dan pastikan hasilnya tampil (diulang bila menu tertutup karena guliran)
const pilihAksi = async (page, kartu, nama, item, hasil) => {
  await expect(async () => {
    if (await hasil.isVisible()) return;
    await kartu.getByRole("button", { name: `Aksi pembinaan ${nama}` }).click();
    await page.getByRole("menuitem", { name: item }).click({ timeout: 2000 });
    await expect(hasil).toBeVisible({ timeout: 3000 });
  }).toPass({ timeout: 30_000 });
};

test("rencana pembinaan: saran lokal, editor (checklist, foto, sisipan data), catatan progres berversi, riwayat, ekspor PDF & Excel", async ({ page, masuk }) => {
  test.setTimeout(180_000);
  const sesi = await masuk("guru");
  const nama = (await api(sesi, "/presensi?id_kelas=KLS-E4A&id_periode=PER-E2E")).students.find((s) => s.id_siswa === "SIS-E2").nama_siswa;
  await page.goto("/dashboard/presensi");
  await pilih(selectBerlabel(page, "Kelas"), "4A");
  const kartu = page.locator("#pembinaan-presensi");
  await kartu.getByRole("button", { name: /^\W*Rencana pembinaan$/ }).click({ timeout: 60_000 });
  const form = page.getByRole("dialog", { name: "Rencana pembinaan kehadiran" });
  await form.getByLabel("Siswa", { exact: true }).selectOption("SIS-E2");

  // Saran tanpa AI dari data kehadiran
  await form.getByRole("button", { name: /Saran AI/ }).click();
  await form.getByLabel("Sumber saran").selectOption("LOKAL");
  await form.getByRole("button", { name: /Buat & terapkan saran/ }).click();
  await expect(page.locator(".swal2-toast")).toContainText("Saran diterapkan");
  await expect(form.getByLabel("Bicara empat mata dengan siswa")).toBeChecked();
  const editor = form.getByRole("textbox", { name: "Catatan / latar belakang" });
  await expect(editor).toContainText("Langkah pembinaan");
  await expect(editor.locator("ul.cek li").first()).toHaveAttribute("data-cek", "0");

  // Sisipan data & foto
  await form.getByRole("button", { name: /Sisipkan data/ }).click();
  await page.getByRole("menuitem", { name: /Checklist dari tindakan terpilih/ }).click();
  await expect(editor.locator("ul.cek li", { hasText: "Bicara empat mata dengan siswa" })).toHaveCount(1);
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");
  await form.getByLabel("Pilih foto").setInputFiles({ name: "kunjungan.png", mimeType: "image/png", buffer: png });
  await expect(editor.locator("img")).toHaveCount(1, { timeout: 30_000 });
  await form.getByLabel("Status", { exact: true }).selectOption("BERLANGSUNG"); // status Otomatis bisa langsung Selesai bila siswa sudah 10 hari hadir beruntun
  await form.locator(".modal-content").screenshot({ path: test.info().outputPath("form-rencana.png") });
  await form.getByRole("button", { name: "Simpan rencana" }).click();
  await expect(page.locator(".swal2-toast")).toContainText("Rencana pembinaan disimpan");
  const baris = kartu.locator("tr", { hasText: nama });
  await expect(baris).toContainText("rencana v1");
  await expect(baris).toContainText("1 foto");

  // Catatan progres pertama → versi 1, pencatat = akun guru
  const dj = page.getByRole("dialog", { name: `Catat ke jurnal · ${nama}` });
  await pilihAksi(page, kartu, nama, "Catat ke jurnal", dj);
  await expect(dj).toContainText("Dicatat atas nama");
  await dj.getByLabel("Catatan langkah pembinaan").fill("Sudah bicara empat mata dengan siswa tentang kehadiran.");
  await dj.getByRole("button", { name: "Simpan ke jurnal" }).click();
  await expect(page.locator(".swal2-toast")).toContainText("Tercatat di jurnal");

  // Perbarui dari rincian → versi 2 dengan keterangan perubahan
  const rinci = page.getByRole("dialog", { name: `Rincian pembinaan · ${nama}` });
  await pilihAksi(page, kartu, nama, "Rincian & riwayat versi", rinci);
  await expect(rinci.locator(".isi-kaya img")).toHaveCount(1);
  await rinci.getByRole("button", { name: /Perbarui/ }).click();
  const dp = page.getByRole("dialog", { name: `Perbarui catatan · ${nama}` });
  await dp.getByLabel("Catatan langkah pembinaan").fill("Sudah bicara empat mata; orang tua ditelepon dan bersedia mengantar.");
  await dp.getByLabel(/Keterangan perubahan/).fill("Orang tua sudah dihubungi");
  await dp.getByRole("button", { name: "Simpan versi 2" }).click();
  await expect(page.locator(".swal2-toast")).toContainText("versi 2");
  await expect(rinci).toContainText("v2");
  await rinci.getByRole("button", { name: /Riwayat$/ }).click();
  await expect(rinci).toContainText("Orang tua sudah dihubungi");
  await rinci.getByRole("button", { name: /Lihat perubahan v1 → v2/ }).click();
  await expect(rinci.locator("ins.beda-tambah").first()).toBeVisible();
  await rinci.getByRole("button", { name: /Riwayat rencana/ }).click();
  await expect(rinci).toContainText("Rencana dibuat");

  // Ekspor
  const [pdf] = await Promise.all([page.waitForEvent("download"), rinci.getByRole("button", { name: /Ekspor PDF/ }).click()]);
  expect(pdf.suggestedFilename()).toMatch(/\.pdf$/);
  await pdf.saveAs(test.info().outputPath("rencana-pembinaan.pdf")); // untuk diperiksa manual di folder hasil
  const [xlsx] = await Promise.all([page.waitForEvent("download"), rinci.getByRole("button", { name: /Ekspor Excel/ }).click()]);
  expect(xlsx.suggestedFilename()).toMatch(/\.xlsx$/);
  await rinci.getByRole("button", { name: "Tutup" }).click();

  // Selesai → catatan terkunci
  await pilihAksi(page, kartu, nama, "Tandai selesai", page.locator(".swal2-popup"));
  await page.getByRole("button", { name: "Tandai selesai" }).click();
  await expect(page.locator(".swal2-toast")).toContainText("Status pembinaan diperbarui");
  await kartu.getByRole("button", { name: "Semua" }).click();
  await expect(baris).toContainText("Selesai");
  await expect(baris).toContainText("rencana v2");
  await bukaAksi(page, kartu, nama);
  await expect(page.getByRole("menuitem", { name: "Rincian & riwayat versi" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Catat ke jurnal" })).toHaveCount(0);
});

// Alur kerja utama dari ujung ke ujung, berurutan karena saling memakai data:
// guru menilai → presensi → jurnal → admin mencetak rapor → orang tua melihat portal.
const { test, expect, api, pilih, selectBerlabel, hariIni, API } = require("../bantu");

test.describe.configure({ mode: "serial" });

test("guru mengisi nilai satu materi dengan 2 indikator", async ({ page, masuk }) => {
  const sesi = await masuk("guru");
  await page.goto("/dashboard/nilai");
  await pilih(selectBerlabel(page, "Kelas"), "4A");
  await pilih(selectBerlabel(page, "Mata Pelajaran"), "Matematika");
  await pilih(selectBerlabel(page, "Jenis Penilaian"), "Ulangan Harian");
  await pilih(selectBerlabel(page, "Topik / Materi"), "Pecahan Sederhana");

  // Pilihan indikator diisi ulang saat lembar siswa selesai dimuat: tunggu lembarnya dulu
  await expect(page.getByText("Rahel Yikwa").first()).toBeVisible();
  for (const nama of [/Menyebutkan pembilang/, /Membandingkan dua pecahan/]) {
    const chip = page.getByRole("button", { name: nama });
    await chip.click();
    await expect(chip).toHaveClass(/btn-primary/);
  }
  const nilai = { "Abner Kogoya": [60, 70], "Debora Tabuni": [90, 80], "Natan Murib": [80, 80], "Rahel Yikwa": [50, 60] };
  for (const [nama, [a, b]] of Object.entries(nilai)) {
    await page.getByLabel(`Indikator 1 ${nama}`).fill(String(a));
    await page.getByLabel(`Indikator 2 ${nama}`).fill(String(b));
  }
  await expect(page.getByLabel("Nilai Abner Kogoya")).toHaveText("65");
  await page.getByRole("button", { name: "Simpan Nilai Kelas" }).click();
  await expect(page.locator(".swal2-popup")).toContainText("Nilai disimpan. Baru: 4");
  await expect(page.locator(".swal2-popup")).toContainText("2 siswa di bawah KKM");
  await page.getByRole("button", { name: "Mengerti" }).click();

  const lembar = await api(sesi, "/nilai/students?" + new URLSearchParams({
    id_kelas: "KLS-E4A", id_mapel: "MPL-EMTK", id_periode: "PER-E2E", id_jenis: "JNS-UH", id_materi: "MTR-E1", tanggal: hariIni(),
  }));
  const abner = lembar.students.find((s) => s.id_siswa === "SIS-E1");
  expect(Number(abner.nilai)).toBe(65);
  expect(abner.nilai_indikator).toEqual({ "IND-E1": 60, "IND-E2": 70 });
});

test("parameter Input Nilai terisi dari jadwal guru hari ini atau mapel satu-satunya (G4)", async ({ page, masuk }) => {
  await masuk("guru");
  await page.goto("/dashboard/nilai");
  await expect(page.getByText(/diisi dari jadwal Anda hari ini/)).toBeVisible();
  await expect(selectBerlabel(page, "Kelas")).toHaveValue("KLS-E4A");
  await expect(selectBerlabel(page, "Mata Pelajaran")).toHaveValue("MPL-EMTK");
  await expect(selectBerlabel(page, "Topik / Materi")).toHaveValue("MTR-E1");

  // Guru tanpa jadwal hari ini: hanya mapel yang diampunya
  await masuk("guru2");
  await page.goto("/dashboard/nilai");
  await expect(page.getByText(/hanya satu mapel yang Anda ampu/)).toBeVisible();
  await expect(selectBerlabel(page, "Mata Pelajaran")).toHaveValue("MPL-EIPA");
  await expect(selectBerlabel(page, "Kelas")).toHaveValue("");
});

test("wali kelas mengisi presensi dan panel WhatsApp muncul", async ({ page, masuk }) => {
  await masuk("guru");
  await page.goto("/dashboard/presensi");
  await pilih(selectBerlabel(page, "Kelas"), "4A");
  await page.locator('label[for="SAKIT_SIS-E2"]').click();
  await page.getByRole("button", { name: "Simpan Presensi" }).click();
  await expect(page.getByText("Debora Tabuni").last()).toBeVisible();
  const panel = page.locator(".modal").filter({ hasText: "Presensi Tersimpan" });
  await expect(panel).toBeVisible();

  // Kembali dari WhatsApp setelah HP menutup halaman → panel muncul lagi; hilang setelah Selesai & Tutup
  await page.reload();
  await expect(panel).toContainText("Melanjutkan dari tampilan terakhir");
  await expect(panel).toContainText("Debora Tabuni");
  await panel.getByRole("button", { name: "Selesai & Tutup" }).click();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Presensi Harian" })).toBeVisible();
  await expect(panel).toHaveCount(0);
});

test("guru menulis jurnal anekdotal dan muncul di linimasa", async ({ page, masuk }) => {
  await masuk("guru");
  await page.goto("/dashboard/jurnal");
  const form = page.locator("form").filter({ hasText: "Narasi Kejadian" });
  await pilih(selectBerlabel(form, "Kelas"), "4A");
  await pilih(selectBerlabel(form, "Siswa"), "Natan Murib");
  await form.getByPlaceholder("Ketik kejadian anekdotal").fill("Natan membantu temannya merapikan buku setelah pelajaran selesai.");
  await form.getByRole("button", { name: /Posting Jurnal/ }).click();
  await expect(page.getByText("Natan membantu temannya merapikan buku").first()).toBeVisible({ timeout: 30_000 });

  // Panel WhatsApp jurnal juga pulih setelah halaman dimuat ulang, dan tidak lagi setelah ditutup
  const panel = page.locator(".swal2-popup").filter({ hasText: "Chat WA Orang Tua" });
  await expect(panel).toBeVisible();
  await page.reload();
  await expect(panel).toContainText("Melanjutkan dari tampilan terakhir");
  await panel.getByRole("button", { name: "Selesai & Tutup" }).click();
  await page.reload();
  await expect(page.getByText("Natan membantu temannya merapikan buku").first()).toBeVisible();
  await expect(panel).toHaveCount(0);
});

test("tombol remedial nonaktif untuk asesmen diagnostik di riwayat nilai (G7)", async ({ page, masuk }) => {
  await masuk("guru");
  await page.goto("/dashboard/nilai");
  await pilih(selectBerlabel(page, "Kelas"), "4A");
  await pilih(selectBerlabel(page, "Mata Pelajaran"), "Matematika");
  await pilih(selectBerlabel(page, "Jenis Penilaian"), "Tes Pemetaan Awal");
  await pilih(selectBerlabel(page, "Topik / Materi"), "Pecahan Sederhana");
  await expect(page.getByText("Asesmen diagnostik").first()).toBeVisible();
  const isian = page.locator('input[aria-label="Nilai Abner Kogoya"]');
  await expect(isian).toBeVisible();
  await isian.fill("40");
  await page.getByRole("button", { name: "Simpan Nilai Kelas" }).click();
  await expect(page.locator(".swal2-popup")).toContainText("Nilai disimpan");

  const baris = page.locator("tr").filter({ hasText: "Tes Pemetaan Awal" }).filter({ hasText: "Abner Kogoya" });
  await expect(baris.getByRole("button", { name: "Remedial tidak berlaku untuk asesmen diagnostik" })).toBeDisabled();
  // Nilai formatif di bawah KKM tetap bisa ditindaklanjuti
  const formatif = page.locator("tr").filter({ hasText: "Ulangan Harian" }).filter({ hasText: "Rahel Yikwa" }).first();
  await expect(formatif.getByTitle(/rencana tindak lanjut/)).toBeEnabled();
});

test("admin membuka pratinjau rapor siswa", async ({ page, masuk }) => {
  await masuk("admin");
  await page.goto("/dashboard/rapor");
  await pilih(selectBerlabel(page, "Kelas"), "4A");
  await pilih(selectBerlabel(page, "Peserta Didik"), "Abner Kogoya");
  const rapor = page.locator(".rapor-preview");
  await expect(rapor).toContainText("Abner Kogoya");
  await expect(rapor).toContainText("SD Uji Coba Nusantara");
  // Nilai dari tes pertama (rata-rata 60 & 70) dan deskripsi capaian yang disusun dari indikatornya
  await expect(rapor).toContainText(/Matematika\s*75\s*65/);
  await expect(rapor).toContainText("Perlu bimbingan dalam menyebutkan pembilang dan penyebut");

  // W6: penjelasan cara membaca deskripsi, di luar kertas rapor (tidak ikut tercetak)
  await page.getByRole("button", { name: /Cara membaca deskripsi capaian/ }).click();
  await expect(page.getByText(/paling banyak dua TP dengan nilai terendah/)).toBeVisible();
  await expect(rapor).not.toContainText("Cara membaca deskripsi");
});

test("rapor kembali ke tampilan terakhir bila halaman dimuat ulang saat panel WhatsApp terbuka (W4)", async ({ page, masuk }) => {
  await masuk("admin");
  await page.goto("/dashboard/rapor");
  await pilih(selectBerlabel(page, "Kelas"), "4A");
  await pilih(selectBerlabel(page, "Peserta Didik"), "Abner Kogoya");
  await page.getByTitle("Kirim ringkasan ke WhatsApp").click();
  const panel = page.locator(".modal").filter({ hasText: "Distribusi Ringkasan Rapor" });
  await expect(panel).toBeVisible();

  // HP menutup halaman di latar belakang saat WhatsApp terbuka → dimuat ulang ketika kembali
  await page.reload();
  await expect(panel).toBeVisible();
  await expect(panel).toContainText("Melanjutkan dari tampilan terakhir");
  await expect(selectBerlabel(page, "Peserta Didik")).toHaveValue("SIS-E1");

  await panel.getByRole("button", { name: "Selesai & Tutup" }).click();
  await page.reload();
  await expect(page.locator(".rapor-preview")).toHaveCount(0);
  await expect(panel).toHaveCount(0);
});

test("orang tua melihat nilai dan kehadiran anak di portal", async ({ page, masuk }) => {
  await masuk("ortu");
  await page.goto("/dashboard/portal");
  await expect(page.getByText("Abner Kogoya").first()).toBeVisible();
  await expect(page.getByText("Matematika").first()).toBeVisible();
});

test("portal orang tua: Perlu didampingi, Buka dari Perlu Tindakan, filter, dan PDF (O2–O4)", async ({ page, masuk }) => {
  // Guru menjadwalkan Tes Ulang untuk nilai Abner yang di bawah KKM (dari tes nilai di atas)
  const guru = await masuk("guru");
  const riwayat = await api(guru, "/nilai?id_kelas=KLS-E4A&id_periode=PER-E2E");
  const nilaiAbner = riwayat.data.find((n) => n.id_siswa === "SIS-E1" && n.id_jenis === "JNS-UH" && !n.rencana);
  expect(nilaiAbner, "nilai Abner di bawah KKM tanpa rencana").toBeTruthy();
  const res = await page.request.post(`${API}/api/remedial`, {
    headers: { Authorization: `Bearer ${guru.access_token}`, Accept: "application/json" },
    data: { id_nilai: [nilaiAbner.id_nilai], opsi_tindakan: "Tes Ulang", tanggal_rencana: hariIni() },
  });
  expect(res.ok(), await res.text()).toBeTruthy();

  await masuk("ortu");
  await page.goto("/dashboard/portal");
  // O2 & O4: kotak Perlu didampingi di paling atas, dengan tanggal remedial dan saran di rumah
  const kotak = page.locator(".card", { has: page.getByRole("heading", { name: /Perlu didampingi/ }) });
  await expect(kotak.getByText(/Remedial Matematika.*Tes Ulang/)).toBeVisible();
  await expect(kotak.getByText("Di rumah:").first()).toBeVisible();

  // Tombol Buka di Perlu Tindakan membuka kartu tindak lanjut itu
  await page.goto("/dashboard/notifikasi");
  await page.locator(".notif-kartu", { hasText: "tindak lanjut Matematika" }).getByRole("link", { name: /Buka/ }).click();
  await expect(page).toHaveURL(/tab=tindak/);
  await expect(page.locator(".portal-sorot")).toContainText("Tes Ulang");

  // Daftar bisa difilter & dicari
  await page.getByLabel("Filter daftar").selectOption("tuntas");
  await expect(page.getByText("Tidak ada tindak lanjut yang cocok")).toBeVisible();
  await page.getByLabel("Filter daftar").selectOption("semua");
  await page.getByRole("searchbox", { name: /Cari mapel/ }).fill("pecahan");
  await expect(page.locator(".portal-tindak")).toHaveCount(1);

  // O3: Capaian TP menunjukkan indikator yang belum dikuasai, lalu diunduh sebagai PDF
  await page.getByRole("button", { name: /Capaian TP/ }).click();
  await page.getByLabel("Filter daftar").selectOption("belum");
  await expect(page.getByText("belum dikuasai", { exact: true }).first()).toBeVisible();
  const [unduhan] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Unduh PDF" }).click()]);
  expect(unduhan.suggestedFilename()).toMatch(/^Capaian_TP_Abner_Kogoya\.pdf$/);
});

test("guru: Buka di Perlu Tindakan membuka lembar remedial siswanya, lalu bukti diunggah (G6)", async ({ page, masuk }) => {
  const guru = await masuk("guru");
  await page.goto("/dashboard/notifikasi");
  await page.locator(".notif-kartu", { hasText: "Hari ini: remedial" }).getByRole("link", { name: /Buka/ }).click();
  await expect(page).toHaveURL(/tipe=REMEDIAL/);
  await expect(page.locator("tr.nilai-sorot")).toContainText("Abner Kogoya");

  // Status rencana di Riwayat membuka rinciannya; bukti diunggah dari sana
  const tombolRencana = page.getByTitle("Lihat / ubah rencana tindak lanjut").first();
  await tombolRencana.click();
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64");
  await page.locator('[aria-label="Bukti pelaksanaan"] input[type=file]').setInputFiles({ name: "hasil-tes-ulang.png", mimeType: "image/png", buffer: png });
  await expect(page.getByRole("link", { name: "hasil-tes-ulang.png" })).toBeVisible();
  await page.locator(".modal-footer").getByRole("button", { name: "Tutup" }).click();
  await expect(page.getByLabel("Ada bukti pelaksanaan").first()).toBeVisible();

  const riwayat = await api(guru, "/nilai?id_kelas=KLS-E4A&id_periode=PER-E2E");
  const rencana = riwayat.data.find((n) => n.id_siswa === "SIS-E1" && n.rencana)?.rencana;
  expect(rencana.bukti_nama).toBe("hasil-tes-ulang.png");
});

test("Akun Saya orang tua menampilkan nama dan kelas anak (O1)", async ({ page, masuk }) => {
  await masuk("ortu");
  await page.goto("/dashboard/akun");
  await expect(page.getByText("Anak terhubung")).toBeVisible();
  await expect(page.getByText("Abner Kogoya")).toBeVisible();
  await expect(page.getByText("· Kelas 4A")).toBeVisible();
});

test("gaya tampilan bisa diganti ke Klasik dan tetap setelah dimuat ulang", async ({ page, masuk }) => {
  await masuk("guru");
  await page.goto("/dashboard/akun");
  await expect(page.locator("html")).toHaveAttribute("data-gaya", "tabler");
  await page.getByRole("button", { name: "Klasik" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-gaya", "klasik");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-gaya", "klasik");
});

test("kolom Aksi memakai menu tiga titik: Ubah membuka formulir, Esc menutup menu", async ({ page, masuk }) => {
  await masuk("admin");
  await page.goto("/dashboard/master-kelas");
  const kebab = page.getByRole("button", { name: "Aksi baris" }).first();
  await kebab.click();
  const menu = page.locator(".menu-aksi");
  await expect(menu.getByRole("menuitem")).toHaveText(["Ubah", "Hapus"]);
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
  await kebab.click();
  await menu.getByRole("menuitem", { name: "Ubah" }).click();
  await expect(page.getByText("Edit Data Kelas")).toBeVisible();

  await page.goto("/dashboard/pengguna");
  await page.getByRole("button", { name: /^Aksi untuk/ }).first().click();
  await expect(page.getByRole("menuitem", { name: "Reset kata sandi" })).toBeVisible();
});

test("admin menambah libur sekolah; kalender jadwal menolak tanggal itu", async ({ page, masuk }) => {
  await masuk("admin");
  await page.goto("/dashboard/hari-libur");
  await page.getByRole("button", { name: "Tambah hari libur" }).click();
  await page.locator("#hlTgl").fill("2030-01-09");
  await page.locator("#hlNama").fill("HUT Sekolah Uji");
  await page.locator(".swal2-confirm").click();
  const kartu = page.locator(".kartu-libur", { hasText: "HUT Sekolah Uji" });
  await expect(kartu).toContainText("Libur sekolah");
  await expect(page.getByRole("button", { name: "2030" })).toHaveClass(/btn-primary/);

  await kartu.getByRole("button", { name: /^Aksi untuk/ }).click();
  await page.getByRole("menuitem", { name: "Hapus" }).click();
  await page.locator(".swal2-confirm").click();
  await expect(kartu).toHaveCount(0);
});

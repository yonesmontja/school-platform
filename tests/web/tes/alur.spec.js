// Alur kerja utama dari ujung ke ujung, berurutan karena saling memakai data:
// guru menilai → presensi → jurnal → admin mencetak rapor → orang tua melihat portal.
const { test, expect, api, pilih, selectBerlabel, hariIni } = require("../bantu");

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

test("wali kelas mengisi presensi dan panel WhatsApp muncul", async ({ page, masuk }) => {
  await masuk("guru");
  await page.goto("/dashboard/presensi");
  await pilih(selectBerlabel(page, "Kelas"), "4A");
  await page.locator('label[for="SAKIT_SIS-E2"]').click();
  await page.getByRole("button", { name: "Simpan Presensi" }).click();
  await expect(page.getByText("Debora Tabuni").last()).toBeVisible();
  await expect(page.locator(".modal, .offcanvas, [role=dialog]").filter({ hasText: /WhatsApp|WA/ }).first()).toBeVisible();
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
});

test("orang tua melihat nilai dan kehadiran anak di portal", async ({ page, masuk }) => {
  await masuk("ortu");
  await page.goto("/dashboard/portal");
  await expect(page.getByText("Abner Kogoya").first()).toBeVisible();
  await expect(page.getByText("Matematika").first()).toBeVisible();
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

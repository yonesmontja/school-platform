// Bank soal (Fase 16 Tahap A): guru menulis soal & kisi-kisi, mengajukan, kepala sekolah mengembalikan
// dengan catatan lalu menyetujui. Pembuatan draf oleh AI diuji di backend (respons AI ditiru).
const { test, expect, pilih, selectBerlabel } = require("../bantu");

test.describe.configure({ mode: "serial" });

test("guru menulis soal pilihan ganda per TP dan mengajukannya", async ({ page, masuk }) => {
  await masuk("guru");
  await page.goto("/dashboard/bank-soal");
  await page.getByRole("button", { name: "Tulis soal" }).click();
  const editor = page.getByRole("dialog", { name: "Soal baru" });
  await pilih(selectBerlabel(editor, "Materi"), "Pecahan Sederhana");
  await pilih(selectBerlabel(editor, "Tujuan pembelajaran"), "Membandingkan dua pecahan");
  await editor.getByLabel("Pertanyaan").fill("Manakah yang lebih besar, 1/2 atau 1/4?");
  for (const [i, teks] of ["1/2", "1/4", "Sama besar", "Tidak bisa dibandingkan"].entries()) {
    await editor.getByLabel(`Pilihan jawaban ${i + 1}`).fill(teks);
  }
  await editor.getByLabel("Kunci A").check();
  await expect(editor.locator(".pratinjau-soal")).toContainText("Manakah yang lebih besar");
  await editor.getByRole("button", { name: "Simpan" }).click();
  await expect(editor).toHaveCount(0);

  const kartu = page.locator(".kartu-soal", { hasText: "Manakah yang lebih besar" });
  await expect(kartu).toContainText("Draf");
  await expect(kartu).toContainText("Membandingkan dua pecahan");
  await kartu.getByRole("button", { name: "Ajukan soal" }).click();
  await expect(kartu).toContainText("Menunggu persetujuan");
});

test("kepala sekolah mengembalikan soal dengan catatan, guru melihat catatannya", async ({ page, masuk }) => {
  await masuk("kepsek");
  await page.goto("/dashboard/notifikasi");
  await page.locator(".notif-kartu", { hasText: "soal menunggu persetujuan" }).getByRole("link", { name: /Buka/ }).click();
  await expect(page).toHaveURL(/bank-soal\?status=DIAJUKAN/);
  const kartu = page.locator(".kartu-soal", { hasText: "Manakah yang lebih besar" });
  await kartu.getByLabel("Pilih soal").check();
  await page.getByRole("button", { name: "Kembalikan" }).click();
  await page.locator(".swal2-textarea").fill("Pilihan D membingungkan untuk kelas 4; ganti dengan pecahan lain.");
  await page.locator(".swal2-confirm").click();
  await expect(page.locator(".swal2-toast")).toContainText("dikembalikan");

  await masuk("guru");
  await page.goto("/dashboard/notifikasi");
  await page.locator(".notif-kartu", { hasText: "soal perlu direvisi" }).getByRole("link", { name: /Buka/ }).click();
  await expect(page.locator(".kartu-soal", { hasText: "Manakah yang lebih besar" })).toContainText("Pilihan D membingungkan");
});

test("guru menyusun kisi-kisi per TP dengan sebaran level dan STNKM", async ({ page, masuk }) => {
  await masuk("guru");
  await page.goto("/dashboard/bank-soal");
  await page.getByRole("button", { name: /Kisi-kisi/ }).first().click();
  await page.getByRole("button", { name: "Kisi-kisi baru" }).click();
  await page.getByLabel("Judul kisi-kisi").fill("Ulangan Pecahan");
  await pilih(page.getByLabel("Materi baris 1"), "Pecahan Sederhana");
  await pilih(page.getByLabel("TP baris 1"), "Menyebutkan pembilang");
  await page.getByLabel("Jumlah baris 1").fill("3");
  await page.getByRole("button", { name: "Simpan kisi-kisi" }).click();
  await expect(page.getByText("3 soal direncanakan")).toBeVisible();
  await expect(page.getByRole("button", { name: "Buat dengan AI" }).first()).toBeEnabled();
});

test("guru memperbaiki dan mengajukan lagi, kepala sekolah menyetujui", async ({ page, masuk }) => {
  await masuk("guru");
  await page.goto("/dashboard/bank-soal");
  const kartu = page.locator(".kartu-soal", { hasText: "Manakah yang lebih besar" });
  await kartu.getByRole("button", { name: "Ajukan soal" }).click();
  await expect(kartu).toContainText("Menunggu persetujuan");

  await masuk("kepsek");
  await page.goto("/dashboard/bank-soal?status=DIAJUKAN");
  await page.locator(".kartu-soal", { hasText: "Manakah yang lebih besar" }).getByRole("button", { name: "Setujui soal" }).click();
  await expect(page.locator(".kartu-soal", { hasText: "Manakah yang lebih besar" })).toHaveCount(0);
});

test("guru menyusun paket, mengoreksi, mengirim nilai, dan melihat analisis butir", async ({ page, masuk }) => {
  await masuk("guru");
  await page.goto("/dashboard/bank-soal");
  await page.getByRole("button", { name: /Paket Soal/ }).click();
  await page.getByRole("button", { name: "Paket baru" }).click();
  const editor = page.getByRole("dialog", { name: "Paket soal baru" });
  await editor.getByLabel("Judul paket").fill("PH Pecahan E2E");
  await pilih(editor.getByLabel("Kelas yang mengerjakan"), "4A");
  await pilih(editor.getByLabel("Jenis penilaian di Input Nilai"), "Ulangan Harian");
  await editor.getByLabel("Tanggal").fill("2026-01-05");
  await editor.getByRole("button", { name: "Simpan paket" }).click();
  await expect(editor).toHaveCount(0);

  // Hanya soal yang sudah disetujui yang bisa dipilih
  await page.getByRole("button", { name: "Tambah soal" }).click();
  const pilihan = page.getByRole("dialog", { name: "Tambah soal ke paket" });
  await pilihan.locator(".pilih-soal", { hasText: "Manakah yang lebih besar" }).getByLabel("Pilih soal").check();
  await pilihan.getByRole("button", { name: /Tambahkan 1 soal/ }).click();
  await expect(page.locator(".butir-paket")).toHaveCount(1);

  // Koreksi: ketik jawaban, nilai langsung terhitung
  await page.getByRole("button", { name: "Koreksi" }).click();
  await page.getByLabel("Jawaban Abner Kogoya nomor 1").fill("a");
  await page.getByLabel("Jawaban Debora Tabuni nomor 1").fill("A");
  await expect(page.locator("tr", { hasText: "Abner Kogoya" })).toContainText("100");
  await page.getByRole("button", { name: /Simpan \(2\)/ }).click();
  await expect(page.locator(".swal2-toast")).toContainText("2 jawaban disimpan");

  await page.getByRole("button", { name: "Kirim ke Input Nilai" }).click();
  await page.locator(".swal2-confirm").click();
  await expect(page.locator(".swal2-popup")).toContainText("Nilai 2 siswa dikirim");
  await page.locator(".swal2-confirm").click();

  await page.getByRole("button", { name: "Analisis" }).click();
  await expect(page.locator(".analisis-butir")).toContainText("Manakah yang lebih besar");
  await expect(page.getByText("Profil STNKM kelas")).toBeVisible();
});

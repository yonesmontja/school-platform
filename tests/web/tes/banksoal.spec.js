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

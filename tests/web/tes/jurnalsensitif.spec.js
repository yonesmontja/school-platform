// Jurnal sensitif: penulis/wali melihat narasi berlencana "Sensitif", guru lain hanya melihat catatan tertutup.
const { test, expect, pilih, selectBerlabel } = require("../bantu");

const NARASI = "Debora bercerita tentang keadaan di rumah yang perlu pendampingan khusus dari guru.";

test("guru menandai jurnal sensitif; guru lain hanya melihat catatan tertutup", async ({ page, masuk }) => {
  await masuk("guru");
  await page.goto("/dashboard/jurnal");
  const form = page.locator("form").filter({ hasText: "Narasi Kejadian" });
  await pilih(selectBerlabel(form, "Kelas"), "4A");
  await pilih(selectBerlabel(form, "Siswa"), "Debora Tabuni");
  await form.getByPlaceholder("Ketik kejadian anekdotal").fill(NARASI);
  await form.getByLabel("Tandai sebagai catatan sensitif").check();
  await form.getByRole("button", { name: /Posting Jurnal/ }).click();
  const panel = page.locator(".swal2-popup").filter({ hasText: "Chat WA Orang Tua" });
  await panel.getByRole("button", { name: "Selesai & Tutup" }).click({ timeout: 30_000 });

  const kartu = page.locator(".card").filter({ hasText: NARASI }).first();
  await expect(kartu).toContainText("Sensitif");

  // Guru lain (bukan penulis, bukan wali kelas 4A): narasi tertutup, tombol WA tidak ada
  await masuk("guru2");
  await page.goto("/dashboard/jurnal");
  await expect(page.getByText("Catatan sensitif: hanya dapat dibaca").first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(NARASI)).toHaveCount(0);
});

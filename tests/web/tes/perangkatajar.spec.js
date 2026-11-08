// Perangkat ajar (Fase 17 Tahap A): guru mengisi CP, menyusun ATP (TP lama + TP baru), mengajukan;
// kepala sekolah menyetujui dari Perlu Tindakan dan TP baru masuk ke Referensi Penilaian. Draf AI diuji di backend.
const { test, expect, pilih } = require("../bantu");

test.describe.configure({ mode: "serial" });

test("guru mengisi CP lalu menyusun dan mengajukan ATP", async ({ page, masuk }) => {
  await masuk("guru");
  await page.goto("/dashboard/perangkat-ajar");
  await page.getByRole("button", { name: /Capaian Pembelajaran/ }).click();
  await page.getByRole("button", { name: "Tambah elemen" }).click();
  const cp = page.getByRole("dialog", { name: "Elemen CP baru" });
  await pilih(cp.getByLabel("Fase"), "Fase B");
  await cp.getByLabel("Elemen").fill("Bilangan");
  await cp.getByLabel("Capaian pembelajaran").fill("Peserta didik dapat membandingkan dan mengurutkan pecahan sederhana.");
  await cp.getByRole("button", { name: "Simpan" }).click();
  await expect(page.locator(".kartu-cp", { hasText: "Bilangan" })).toBeVisible();

  await page.getByRole("button", { name: /^\W*ATP$/ }).click();
  await page.getByRole("button", { name: "ATP baru" }).click();
  const baru = page.getByRole("dialog", { name: "ATP baru" });
  await pilih(baru.getByLabel("Kelas"), "4A");
  await baru.getByLabel("JP per minggu").fill("5");
  await baru.getByRole("button", { name: "Buat ATP" }).click();
  await expect(page.locator(".editor-atp")).toContainText("Fase B");

  // Baris 1: TP yang sudah ada; baris 2: TP baru
  await page.getByRole("button", { name: "tambah baris" }).click();
  await pilih(page.getByLabel("Elemen CP baris 1"), "Bilangan");
  await pilih(page.getByLabel("Materi baris 1"), "Pecahan Sederhana");
  await pilih(page.getByLabel("Pilih TP yang ada baris 1"), "Membandingkan dua pecahan");
  await page.getByLabel("JP baris 1").fill("6");
  await page.getByRole("button", { name: "Tambah baris" }).click();
  await pilih(page.getByLabel("Materi baris 2"), "Pecahan Sederhana");
  await page.getByLabel("TP baru baris 2").fill("Mengurutkan tiga pecahan berpenyebut sama");
  await page.getByLabel("JP baris 2").fill("4");
  await expect(page.locator(".editor-atp")).toContainText("Total 10 JP");
  await page.locator(".editor-atp").getByRole("button", { name: /Simpan$/ }).first().click();
  await expect(page.locator(".swal2-toast")).toContainText("ATP disimpan");

  await page.getByRole("button", { name: "Ajukan" }).click();
  await page.locator(".swal2-confirm").click();
  await expect(page.locator(".editor-atp")).toContainText("Menunggu persetujuan");
});

test("kepala sekolah menyetujui ATP dan TP baru masuk ke referensi", async ({ page, masuk }) => {
  await masuk("kepsek");
  await page.goto("/dashboard/notifikasi");
  await page.locator(".notif-kartu", { hasText: "ATP menunggu persetujuan" }).getByRole("link", { name: /Buka/ }).click();
  await expect(page).toHaveURL(/perangkat-ajar\?status=DIAJUKAN/);
  await page.locator(".kartu-atp", { hasText: "ATP Matematika" }).click();
  await page.getByRole("button", { name: "Setujui" }).click();
  await page.locator(".swal2-confirm").click();
  await expect(page.locator(".editor-atp")).toContainText("Disetujui");

  // TP baru kini menjadi TP yang ada (tidak lagi bertanda usulan)
  await expect(page.getByLabel("TP baru baris 2")).toHaveCount(0);
  await expect(page.locator(".baris-atp").nth(1)).toContainText("Mengurutkan tiga pecahan berpenyebut sama");
});

test("guru membuat modul ajar RPM dari ATP, kepala sekolah menyetujui", async ({ page, masuk }) => {
  test.setTimeout(150_000);
  await masuk("guru");
  await page.goto("/dashboard/perangkat-ajar");
  await page.locator(".kartu-atp", { hasText: "ATP Matematika" }).click();
  await page.getByRole("button", { name: "Buat modul ajar" }).click();
  const baru = page.getByRole("dialog", { name: "Modul ajar baru" });
  await baru.getByLabel(/Membandingkan dua pecahan/).check();
  await baru.getByLabel("Jumlah pertemuan").fill("2");
  await baru.getByLabel("JP per pertemuan").fill("2");
  await baru.getByRole("button", { name: "Buat modul" }).click();

  const editor = page.locator(".editor-modul");
  await expect(editor).toContainText("Membandingkan dua pecahan");
  await expect(editor.locator(".pertemuan-modul")).toHaveCount(2);
  // Belum lengkap: belum bisa diajukan
  await editor.getByRole("button", { name: "Ajukan" }).click();
  await page.locator(".swal2-confirm").click();
  await expect(page.locator(".swal2-popup")).toContainText("Lengkapi tujuan");
  await page.locator(".swal2-confirm").click();

  await editor.getByLabel("Tujuan pembelajaran").fill("Siswa membandingkan dua pecahan dengan benda nyata.");
  await editor.locator(".pertemuan-modul").first().getByLabel("Inti: memahami").fill("Siswa melipat kertas menjadi 2 dan 4 bagian.");
  await editor.getByRole("button", { name: /Simpan$/ }).first().click();
  await expect(page.locator(".swal2-toast")).toContainText("Modul disimpan");
  await editor.getByRole("button", { name: "Ajukan" }).click();
  await page.locator(".swal2-confirm").click();
  await expect(editor).toContainText("Menunggu persetujuan");

  await masuk("kepsek");
  await page.goto("/dashboard/notifikasi");
  await page.locator(".notif-kartu", { hasText: "modul ajar menunggu persetujuan" }).getByRole("link", { name: /Buka/ }).click();
  await page.locator(".kartu-modul").first().click();
  await page.locator(".editor-modul").getByRole("button", { name: "Setujui" }).click();
  await page.locator(".swal2-confirm").click();
  await expect(page.locator(".editor-modul")).toContainText("Disetujui");
});

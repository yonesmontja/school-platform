// Peta Tema / spider web PBPM di Perangkat Ajar: guru menyusun jaring mapel (kalibrasi + TP), jaring konsep, peta mingguan;
// ekspor PDF/Word/PNG; kepala sekolah menyetujui; peta tema bisa ditautkan dari editor jadwal.
const fs = require("fs");
const { test, expect, pilih, selectBerlabel } = require("../bantu");

test.describe.configure({ mode: "serial" });

test("guru menyusun peta tema: jaring mapel & konsep, peta mingguan, ekspor PDF/Word/PNG, lalu diajukan", async ({ page, masuk, context }) => {
  test.setTimeout(180_000);
  await masuk("guru");
  await page.goto("/dashboard/perangkat-ajar?tab=tema");
  await page.getByRole("button", { name: "Peta tema baru" }).click({ timeout: 60_000 });
  const baru = page.getByRole("dialog", { name: "Peta tema baru" });
  await baru.locator("#ptJudul").fill("Main Bola E2E");
  await baru.locator("#ptKelas").selectOption({ label: "4A (Fase B)" });
  await baru.locator("#ptMinggu").fill("2");
  await baru.getByRole("button", { name: "Buat peta tema" }).click();

  const editor = page.locator(".editor-tema");
  await expect(editor).toContainText("Main Bola E2E", { timeout: 60_000 });
  await editor.locator("#ptKategori").fill("Hobi");

  // Dua cabang mapel dengan kalibrasi; Matematika ditautkan ke TP
  await editor.getByRole("button", { name: "Tambah cabang mata pelajaran" }).click();
  await editor.getByLabel("Mata pelajaran cabang 1").selectOption({ label: "Matematika" });
  await editor.getByLabel("Kalibrasi Matematika").fill("Hitung skor & ukuran lapangan");
  await editor.getByRole("button", { name: /Tautkan TP/ }).first().click();
  await editor.locator(".pt-tp-pilih").getByText(/Menyebutkan pembilang dan penyebut/).click();
  await editor.getByRole("button", { name: "Tambah cabang mata pelajaran" }).click();
  await editor.getByLabel("Mata pelajaran cabang 2").selectOption({ label: "IPA" });
  await editor.getByLabel("Kalibrasi IPA").fill("Gaya dan gerak bola saat ditendang");

  await editor.getByRole("button", { name: "Tambah konsep" }).click();
  await editor.getByLabel("Konsep 1").fill("Aturan Permainan");
  await editor.getByLabel("Rincian Aturan Permainan").fill("Jumlah pemain, waktu, wasit, skor");

  await editor.getByLabel("Judul minggu 1").fill("Aku");
  await editor.getByLabel("Realita minggu 1").fill("Anak bermain bola di kampung");
  await editor.getByLabel("Imajinasi minggu 1").fill("Menggambar lapangan impian");
  await editor.getByLabel("Produk anak minggu 1").fill("Gambar lapangan");

  // Diagram ikut berubah langsung
  const webMapel = editor.getByRole("figure", { name: "Spider web mata pelajaran" });
  await expect(webMapel).toContainText("Hitung skor & ukuran lapangan");
  await expect(webMapel).toContainText("HOBI");
  await expect(editor.getByRole("figure", { name: "Spider web konsep" })).toContainText("Aturan Permainan");

  await editor.getByRole("button", { name: "Simpan" }).click();
  await expect(page.locator(".swal2-toast")).toContainText("Peta tema disimpan");

  // Ekspor: PDF resmi (jendela cetak), Word (diagram tertanam), PNG
  await editor.getByRole("button", { name: "Ekspor" }).click();
  const [jendela] = await Promise.all([context.waitForEvent("page"), editor.getByRole("button", { name: /Cetak \/ PDF resmi/ }).click()]);
  await jendela.evaluate(() => { window.print = () => {}; });
  await expect(jendela.locator("body")).toContainText("Peta Tema Pembelajaran", { timeout: 20_000 });
  await expect(jendela.locator("body")).toContainText("Realita (yang dialami anak)");
  await expect(jendela.locator(".diagram svg")).toHaveCount(2);
  await jendela.close();

  await editor.getByRole("button", { name: "Ekspor" }).click();
  const [word] = await Promise.all([page.waitForEvent("download"), editor.getByRole("button", { name: "Word" }).click()]);
  expect(word.suggestedFilename()).toBe("Peta Tema - Main Bola E2E.doc");
  const isiWord = fs.readFileSync(await word.path(), "utf8");
  expect(isiWord).toContain("Content-Location: file:///C:/dokumen_files/jaring-mapel");
  expect(isiWord).toContain("Content-Location: file:///C:/dokumen_files/jaring-konsep");

  await editor.getByRole("button", { name: "Ekspor" }).click();
  const [png] = await Promise.all([page.waitForEvent("download"), editor.getByRole("button", { name: "PNG spider web mapel" }).click()]);
  expect(png.suggestedFilename()).toMatch(/\.png$/);
  expect(fs.readFileSync(await png.path()).subarray(1, 4).toString()).toBe("PNG");

  await editor.getByRole("button", { name: "Ajukan" }).click();
  await page.locator(".swal2-confirm").click();
  await expect(editor).toContainText("Menunggu persetujuan", { timeout: 30_000 });
});

test("kepala sekolah menyetujui peta tema; guru menautkannya dari editor jadwal", async ({ page, masuk }) => {
  test.setTimeout(150_000);
  await masuk("kepsek");
  await page.goto("/dashboard/perangkat-ajar?tab=tema&status=DIAJUKAN");
  await page.locator(".kartu-tema", { hasText: "Main Bola E2E" }).click({ timeout: 60_000 });
  const editor = page.locator(".editor-tema");
  await editor.getByRole("button", { name: "Setujui" }).click();
  await page.locator(".swal2-confirm").click();
  await expect(editor).toContainText("Disetujui", { timeout: 30_000 });

  await masuk("guru");
  await page.goto("/dashboard/jadwal");
  await page.getByRole("button", { name: "Buat" }).first().click();
  const form = page.locator(".jadwal-form");
  await pilih(selectBerlabel(form, "Mata Pelajaran"), "Matematika");
  await pilih(selectBerlabel(form, "Kelas"), "4A");
  await form.locator(".pa-tool", { hasText: "Peta Tema" }).click();
  const panel = page.getByRole("complementary", { name: "Panel Peta Tema" });
  await expect(panel).toContainText("Main Bola E2E", { timeout: 60_000 });
  await panel.getByRole("button", { name: /Main Bola E2E/ }).click();
  await panel.getByRole("button", { name: "Selesai" }).click();
  await expect(form.locator(".pa-chip", { hasText: "Main Bola E2E" })).toBeVisible();
});

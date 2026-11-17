// Peta Tema / spider web PBPM di Perangkat Ajar: kepala sekolah menyusun jaring mapel (kalibrasi + TP + JP/minggu), jaring konsep,
// peta mingguan, pola mingguan terstruktur (slot), ekspor PDF/Word/PNG, menetapkan, lalu Buat Jadwal; guru hanya melihat dan
// menautkan peta tema dari editor jadwal.
const fs = require("fs");
const { test, expect, pilih, selectBerlabel } = require("../bantu");

test.describe.configure({ mode: "serial" });

test("kepala sekolah menyusun peta tema, slot pola dari rekomendasi, ekspor, menetapkan, lalu Buat Jadwal", async ({ page, masuk, context }) => {
  test.setTimeout(240_000);
  await masuk("kepsek");
  await page.goto("/dashboard/perangkat-ajar?tab=tema");
  await page.getByRole("button", { name: "Peta tema baru" }).click({ timeout: 60_000 });
  const baru = page.getByRole("dialog", { name: "Peta tema baru" });
  await baru.locator("#ptJudul").fill("Main Bola E2E");
  await baru.locator("#ptKelas").selectOption({ label: "4A (Fase B)" });
  await baru.locator("#ptMinggu").fill("2");
  await baru.getByRole("button", { name: "Buat peta tema" }).click();

  const editor = page.locator(".editor-tema");
  await expect(editor).toContainText("Main Bola E2E", { timeout: 60_000 });

  // Dua cabang mapel dengan kalibrasi; Matematika ditautkan ke TP
  await editor.getByRole("button", { name: "Tambah cabang mata pelajaran" }).click();
  await editor.getByLabel("Mata pelajaran cabang 1").selectOption({ label: "Matematika" });
  await editor.getByLabel("Kalibrasi Matematika").fill("Hitung skor & ukuran lapangan");
  await editor.getByLabel("JP per minggu Matematika").fill("4");
  await editor.getByRole("button", { name: /Tautkan TP/ }).first().click();
  await editor.locator(".pt-tp-pilih").getByText(/Menyebutkan pembilang dan penyebut/).click();
  await editor.getByRole("button", { name: "Tambah cabang mata pelajaran" }).click();
  await editor.getByLabel("Mata pelajaran cabang 2").selectOption({ label: "IPA" });
  await editor.getByLabel("Kalibrasi IPA").fill("Gaya dan gerak bola saat ditendang");
  // Tanggal jauh di depan agar tidak bentrok dengan jadwal contoh
  await editor.locator("#ptMulaiE").fill("2031-03-03");

  await editor.getByRole("button", { name: "Tambah konsep" }).click();
  await editor.getByLabel("Konsep 1").fill("Aturan Permainan");
  await editor.getByLabel("Rincian Aturan Permainan").fill("Jumlah pemain, waktu, wasit, skor");

  await editor.getByLabel("Judul minggu 1").fill("Aku");
  await editor.getByLabel("Realita minggu 1").fill("Anak bermain bola di kampung");
  await editor.getByLabel("Imajinasi minggu 1").fill("Menggambar lapangan impian");
  await editor.getByLabel("Produk anak minggu 1").fill("Gambar lapangan");

  // Diagram ikut berubah langsung
  // Kategori diisi setelah isian lain: bila diketik saat editor baru terbuka, bisa tertimpa data yang selesai dimuat
  // High Level (dulu "Kategori pusat"): pilih "+ High Level baru…" lalu ketik namanya
  await editor.locator("#ptKategori").selectOption("__baru");
  await page.locator(".swal2-input").fill("Hobi");
  await page.locator(".swal2-confirm").click();
  await expect(editor.locator("#ptKategori option:checked")).toHaveText("Hobi");
  const webMapel = editor.getByRole("figure", { name: "Spider web mata pelajaran" });
  await expect(webMapel).toContainText("Hitung skor & ukuran lapangan");
  await expect(webMapel).toContainText("HOBI");
  await expect(editor.getByRole("figure", { name: "Spider web konsep" })).toContainText("Aturan Permainan");

  await editor.getByRole("button", { name: "Simpan" }).click();
  await expect(page.locator(".swal2-toast")).toContainText("Peta tema disimpan");

  // Rekomendasi pola mingguan (tanpa AI): hari kosong di Jadwal diisi dari cabang mapel, hari yang ada sesinya dipertahankan
  await editor.getByRole("button", { name: "Rekomendasi AI" }).click();
  await page.locator("#polaMode").selectOption("LOKAL");
  await page.locator(".swal2-confirm").click();
  await expect(page.locator(".swal2-popup")).toContainText("Pola mingguan siap", { timeout: 30_000 });
  await page.locator(".swal2-confirm").click();
  const pola = await Promise.all(["senin", "selasa", "rabu", "kamis", "jumat"].map((h) => editor.locator(`#ptPola-${h}`).inputValue()));
  expect(pola.every((t) => t.trim().length > 0)).toBe(true);
  expect(pola.join(" ")).toMatch(/Realita|Matematika|IPA/);

  // Teks rekomendasi → slot jam & mapel (pola terstruktur yang menjadi jadwal)
  await editor.getByRole("button", { name: /Susun slot/ }).click();
  await editor.getByRole("button", { name: /Dari teks pola/ }).click();
  await page.locator(".swal2-confirm").click();
  await expect(page.locator(".swal2-popup")).toContainText("Slot pola siap", { timeout: 30_000 });
  await page.locator(".swal2-confirm").click();
  const slot = editor.locator(".pt-slot tbody tr");
  expect(await slot.count()).toBeGreaterThan(4);
  await expect(editor.locator("[data-jp-mapel]").first()).toContainText("Matematika");
  await editor.getByRole("button", { name: "Simpan" }).click();
  await expect(page.locator(".swal2-toast")).toContainText("Peta tema disimpan");
  await expect(editor.locator(".pt-slot tbody tr").first()).toBeVisible();

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

  // Tetapkan, lalu Buat Jadwal dari pola mingguan
  await editor.getByRole("button", { name: "Tetapkan" }).click();
  await page.locator(".swal2-confirm").click();
  await expect(editor).toContainText("Ditetapkan", { timeout: 30_000 });
  await editor.getByRole("button", { name: "Buat Jadwal" }).click();
  await expect(page.locator(".swal2-popup")).toContainText("sesi baru", { timeout: 30_000 });
  await page.locator(".swal2-confirm").click();
  await expect(page.locator(".swal2-popup")).toContainText("Jadwal tema dibuat", { timeout: 30_000 });
  await page.locator(".swal2-confirm").click();
  await expect(editor.locator("[data-jadwal-tema]")).toContainText("sesi di Jadwal");
  await expect(editor.locator("[data-perubahan]")).toContainText("Perubahan 0/3");

  // Cek keselarasan TP & CP
  await editor.getByRole("button", { name: "Periksa keselarasan" }).click();
  await expect(editor.locator("[data-keselarasan] table")).toContainText("Matematika", { timeout: 30_000 });
});

test("guru melihat peta tema yang ditetapkan (tanpa mengubah) dan menautkannya dari editor jadwal", async ({ page, masuk }) => {
  test.setTimeout(150_000);
  await masuk("guru");
  await page.goto("/dashboard/perangkat-ajar?tab=tema");
  await page.locator(".kartu-tema", { hasText: "Main Bola E2E" }).click({ timeout: 60_000 });
  const editor = page.locator(".editor-tema");
  await expect(editor).toContainText("Ditetapkan");
  await expect(editor.getByRole("button", { name: "Simpan" })).toHaveCount(0);
  await expect(editor.getByRole("button", { name: "Buat Jadwal" })).toHaveCount(0);
  await expect(editor.locator("[data-pola-jadwal]")).toContainText("ditetapkan kepala sekolah");
  await page.goto("/dashboard/perangkat-ajar?tab=tema");
  await expect(page.locator(".kartu-tema").first()).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole("button", { name: "Peta tema baru" })).toHaveCount(0);

  // Materi: High Level terisi otomatis dari Peta Tema kelas itu (peta tema ditentukan lebih dulu)
  await page.goto("/dashboard/master-materi");
  await page.getByRole("button", { name: /Tambah Data/ }).click({ timeout: 60_000 });
  const modal = page.locator(".modal-content");
  const pilihan = modal.locator("select.form-select");
  await pilihan.nth(0).selectOption({ label: "Matematika" });
  await pilihan.nth(1).selectOption({ label: "4A" });
  await expect(modal.locator("[data-hl-tema]")).toContainText("Dari Peta Tema «Main Bola E2E»", { timeout: 30_000 });
  await expect(pilihan.nth(3).locator("option:checked")).toHaveText(/Hobi/);
  await modal.getByRole("button", { name: "Batal" }).click();

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

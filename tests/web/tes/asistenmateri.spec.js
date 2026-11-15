// Asisten form Materi (saran TP/IKTP/bobot dari AI ditiru lewat page.route) dan status rombel per semester di Master Kelas.
const { test, expect, api, masukApi } = require("../bantu");

const JAWABAN_AI = {
  semua: {
    nama_materi: "Skor Bola E2E",
    tp: "Peserta didik mampu menjumlahkan skor permainan bola sampai 100.",
    iktp: [{ deskripsi: "Mencatat skor tiap tim dengan turus", dimensi: "S" }, { deskripsi: "Menjumlahkan skor dua babak", dimensi: "T" }],
    bobot: { S: 0.6, T: 1, N: 0.5, K: 0.3, M: 0.4 },
    alasan: "Mengikuti langkah ATP tentang skor permainan.",
    sumber: ["alur ATP", "Peta Tema"],
  },
  iktp: {
    iktp: [{ deskripsi: "Menjelaskan cara menentukan pemenang dari skor", dimensi: "N" }],
    bobot: { S: 0.5, T: 0.9, N: 0.8, K: 0.3, M: 0.4 },
    alasan: "TP menekankan penjumlahan dan penalaran skor.",
    sumber: ["TP yang Anda tulis"],
  },
  tp: { tp_saran: ["Peserta didik mampu membandingkan skor dua tim."], alasan: "Sesuai alur ATP." },
};

test("guru mengisi materi dengan Bikin pakai AI, saran IKTP & bobot, lalu materi bertanda lengkap", async ({ page, masuk }) => {
  test.setTimeout(150_000);
  await page.route(/\/api\/materi\/asisten-ai/, (route) => {
    const bagian = route.request().postDataJSON()?.bagian || "semua";
    route.fulfill({ json: { success: true, data: JAWABAN_AI[bagian], mode: "GEMINI" } });
  });
  await masuk("guru");
  await page.goto("/dashboard/master-materi");
  await page.getByRole("button", { name: /Tambah Data/ }).click({ timeout: 60_000 });

  const modal = page.locator(".modal-content");
  const pilihan = modal.locator("select.form-select");
  await pilihan.nth(0).selectOption({ label: "Matematika" });
  await pilihan.nth(1).selectOption({ label: "4A" });
  await pilihan.nth(2).selectOption({ index: 1 });
  await pilihan.nth(3).selectOption({ label: "Pemahaman Konsep (semua mapel)" });

  // Bikin pakai AI mengisi nama, TP, IKTP, dan bobot sekaligus
  await modal.getByRole("button", { name: /Bikin pakai AI/ }).click();
  await expect(modal.getByPlaceholder("Contoh: Sistem Tata Surya")).toHaveValue("Skor Bola E2E");
  await expect(modal.locator("textarea").first()).toHaveValue(/menjumlahkan skor permainan bola/);
  await expect(modal.getByLabel("Indikator 1")).toHaveValue("Mencatat skor tiap tim dengan turus");
  await expect(modal.getByLabel("Indikator 2")).toHaveValue("Menjumlahkan skor dua babak");
  await expect(modal).toContainText("Mengikuti langkah ATP tentang skor permainan.");
  await expect(modal.locator(".badge.bg-success").filter({ hasText: /^100%$/ })).toBeVisible();
  await expect(modal.locator(".badge.bg-warning").filter({ hasText: /^30%$/ })).toBeVisible();

  // Daftar centang TP dari perangkat ajar (tanpa AI) + saran AI
  await modal.getByRole("button", { name: /Saran TP \(AI\)/ }).click();
  const bantuTp = modal.locator("#bantu-tp");
  await expect(bantuTp).toContainText("Peserta didik mampu membandingkan skor dua tim.");
  await bantuTp.getByRole("checkbox").first().check();
  await bantuTp.getByRole("button", { name: /Masukkan 1 TP/ }).click();
  await expect(modal.locator("textarea").first()).toHaveValue(/membandingkan skor dua tim/);
  await modal.getByRole("button", { name: /Pilih dari perangkat ajar/ }).click();
  await expect(bantuTp.locator(".border.rounded-3")).toBeVisible();

  // Saran IKTP: guru mencentang, IKTP ditambahkan dan bobot diatur
  await modal.getByRole("button", { name: /Saran IKTP & bobot/ }).click();
  const saran = modal.locator("#saran-iktp");
  await expect(saran).toContainText("Menjelaskan cara menentukan pemenang dari skor");
  await expect(saran.getByRole("checkbox").first()).toBeChecked();
  await saran.screenshot({ path: test.info().outputPath("saran-iktp.png") });
  await saran.getByRole("button", { name: /Tambahkan 1 IKTP & atur bobot/ }).click();
  await expect(modal.getByLabel("Indikator 3")).toHaveValue("Menjelaskan cara menentukan pemenang dari skor");
  await expect(modal.locator(".badge.bg-info").filter({ hasText: /^80%$/ })).toBeVisible();
  await modal.screenshot({ path: test.info().outputPath("form-materi-ai.png") });

  await modal.getByRole("button", { name: "Simpan" }).click();
  await expect(modal).toBeHidden({ timeout: 30_000 });

  // Daftar materi: bintang "Lengkap" untuk materi yang TP, IKTP, dan bobotnya terisi
  await page.getByPlaceholder("Cari data...").fill("Skor Bola E2E");
  const baris = page.locator(".tabulator-row").filter({ hasText: "Skor Bola E2E" });
  await expect(baris).toContainText("Lengkap", { timeout: 30_000 });
  await expect(baris.locator(".bi-star-fill").first()).toBeVisible();
  await expect(baris).toContainText("3 IKTP");
});

test("admin menonaktifkan rombel untuk semester aktif; guru tidak lagi melihatnya", async ({ page, masuk }) => {
  test.setTimeout(120_000);
  await masuk("admin");
  await page.goto("/dashboard/master-kelas");
  const baris = page.locator(".tabulator-row").filter({ hasText: "5A" });
  await expect(baris).toContainText("Aktif", { timeout: 60_000 });

  await baris.locator("[data-aktif-kelas] input").click();
  await expect(page.locator(".swal2-popup")).toContainText("tidak diubah");
  await page.getByRole("button", { name: "Ya, nonaktifkan" }).click();
  await expect(baris).toContainText("Tidak aktif", { timeout: 30_000 });
  await page.locator(".tabulator").screenshot({ path: test.info().outputPath("kelas-semester-aktif.png") });

  // Guru pengampu tidak lagi melihat rombel nonaktif di pilihan kelas
  const guru = await masukApi("guru");
  const kelas = await api(guru, "/classes");
  expect(kelas.data.map((k) => k.id_kelas)).not.toContain("KLS-E5A");

  // Aktifkan lagi agar spec lain tidak terpengaruh
  await baris.locator("[data-aktif-kelas] input").click();
  await page.getByRole("button", { name: "Ya, aktifkan" }).click();
  await expect(baris).not.toContainText("Tidak aktif", { timeout: 30_000 });
});

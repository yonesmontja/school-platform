// Notebook AI Pustaka Dokumen: guru membuka dokumen, membuat ringkasan & data dengan AI (respons ditiru lewat page.route),
// bertanya ke dokumen dan melihat bagian yang dirujuk, lalu mengunduh hasilnya.
const path = require("path");
const { test, expect, unggahApi } = require("../bantu");

const BERKAS = { nama: "berkas", path: path.join(__dirname, "../data/cp-bahasa-inggris.txt"), tipe: "text/plain" };
const JAWABAN = {
  RINGKAS: { ringkasan: "CP Bahasa Inggris Fase A untuk menyimak dan berbicara.", poin: ["Menyimak instruksi sederhana", "Memperkenalkan diri"] },
  EKSTRAK: { data: [{ jenis: "ATURAN", nilai: "Fase A", keterangan: "Kelas 1-2" }], tabel: [{ judul: "Elemen", kolom: ["Elemen", "Isi"], baris: [["Menyimak", "Instruksi sederhana"]] }] },
};

test("guru meneliti dokumen dengan Notebook AI dan bertanya ke dokumen", async ({ page, masuk }) => {
  test.setTimeout(120_000);
  const admin = await masuk("admin");
  await unggahApi(admin, "/dokumen-rujukan", { judul: "CP Notebook E2E", jenis: "CP" }, BERKAS);

  let nomor = 0;
  await page.route(/\/api\/dokumen-rujukan\/[^/]+\/(riset|tanya)$/, async (route) => {
    const req = route.request();
    if (req.method() !== "POST") return route.fallback();
    nomor += 1;
    const sekarang = new Date().toISOString();
    if (req.url().endsWith("/tanya")) {
      return route.fulfill({ json: { success: true, data: { id: 9000 + nomor, jenis: "TANYA", pertanyaan: req.postDataJSON().pertanyaan, dibuat_oleh: null,
        hasil: { jawaban: "Peserta didik menyapa dan memperkenalkan diri dengan kalimat pendek [B1].", cukup: true },
        rujukan: [{ no: 1, teks: "Elemen Berbicara: peserta didik menyapa dan memperkenalkan diri dengan kalimat pendek." }],
        created_at: sekarang, pembuat: { name: "Guru E2E" } } } });
    }
    const jenis = req.postDataJSON().jenis;
    return route.fulfill({ json: { success: true, message: "Hasil riset disimpan.", data: { id: 8000 + nomor, jenis, hasil: JAWABAN[jenis], ai_mode: "GEMINI",
      versi_dokumen: 1, created_at: sekarang, pembuat: { name: "Guru E2E" } } } });
  });

  await masuk("guru");
  await page.goto("/dashboard/pustaka-dokumen");
  const baris = page.locator("tr", { hasText: "CP Notebook E2E" }).first();
  await baris.getByRole("button", { name: "CP Notebook E2E", exact: true }).click({ timeout: 60_000 });
  await page.getByRole("dialog", { name: /Dokumen CP Notebook E2E/ }).getByRole("button", { name: "Notebook AI" }).click();

  const nb = page.getByRole("dialog", { name: "Notebook AI" });
  await expect(nb).toContainText("AI membaca seluruh dokumen");
  await nb.getByRole("button", { name: /Buat ringkasan dengan AI/ }).click();
  await expect(nb.locator("[data-riset=RINGKAS]")).toContainText("Memperkenalkan diri");

  await nb.getByRole("tab", { name: /Data & tabel/ }).click();
  await nb.getByRole("button", { name: /Buat data & tabel dengan AI/ }).click();
  await expect(nb.locator("[data-riset=EKSTRAK]")).toContainText("Instruksi sederhana");

  await nb.getByLabel("Pertanyaan untuk dokumen").fill("Bagaimana siswa memperkenalkan diri?");
  await nb.getByRole("button", { name: /^\W*Tanya$/ }).click();
  const jawab = nb.locator("[data-tanya]").first();
  await expect(jawab).toContainText("kalimat pendek [B1]");
  await jawab.getByText("Bagian B1 yang dirujuk").click();
  await expect(jawab.locator("pre")).toContainText("Elemen Berbicara");
  await nb.screenshot({ path: test.info().outputPath("notebook-ai.png") });

  const [unduhan] = await Promise.all([page.waitForEvent("download"), nb.getByRole("button", { name: /Unduh \(\.md\)/ }).click()]);
  expect(unduhan.suggestedFilename()).toContain("CP Notebook E2E");
});

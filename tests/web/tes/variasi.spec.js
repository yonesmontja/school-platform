// Variasi bank soal (Fase 24): guru membuat varian AI dari soal yang sudah disetujui (respons AI ditiru lewat page.route),
// melihat cakupan soal per TP & level, dan memeriksa soal kembar.
const { test, expect, api, masukApi, API } = require("../bantu");

async function kirim(sesi, method, path, body) {
  const res = await fetch(`${API}/api${path}`, { method, headers: { Authorization: `Bearer ${sesi.access_token}`, Accept: "application/json", "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`${path} gagal: ${res.status} ${await res.text()}`);
  return res.json();
}

test("guru membuat varian soal dengan AI dan melihat cakupan per TP", async ({ page, masuk }) => {
  test.setTimeout(120_000);
  const guru = await masukApi("guru");
  const kepsek = await masukApi("kepsek");
  const ref = await api(guru, "/bank-soal/referensi");
  const materi = ref.materi.find((m) => m.indikator?.length);
  const tp = materi.indikator[0];
  const pertanyaan = `Varian E2E ${Date.now()}: Rina punya 2/5 pita lalu diberi 1/5 lagi. Berapa pita Rina?`;
  const soal = (await kirim(guru, "POST", "/bank-soal", { id_mapel: materi.id_mapel, id_materi: materi.id_materi, id_indikator: tp.id_indikator,
    bentuk: "PG", level_kognitif: "C2", tingkat_kesulitan: "SEDANG", pertanyaan, isi: { pilihan: ["3/5", "3/10", "1/5", "2/5"] }, kunci: { jawaban: 0 } })).data;
  await kirim(guru, "POST", "/bank-soal/ajukan", { id_soal: [soal.id_soal] });
  await kirim(kepsek, "POST", "/bank-soal/setujui", { id_soal: [soal.id_soal] });

  await page.route(/\/api\/bank-soal\/[^/]+\/varian$/, async (route) => {
    await new Promise((ok) => setTimeout(ok, 800));
    route.fulfill({ json: { success: true, message: "2 varian soal dibuat sebagai draf. Periksa lalu ajukan ke kepala sekolah.", data: [{ id_soal: "x" }, { id_soal: "y" }] } });
  });

  await masuk("guru");
  await page.goto("/dashboard/bank-soal");
  await page.getByLabel("Cari soal").fill("Varian E2E");
  const kartu = page.locator(".kartu-soal", { hasText: pertanyaan }).first();
  await kartu.getByRole("button", { name: "Aksi soal" }).click();
  await page.getByRole("menuitem", { name: /Buat varian dengan AI/ }).click();
  const dlg = page.getByRole("dialog", { name: "Buat varian soal" });
  await expect(dlg).toContainText("Rina punya 2/5 pita");
  await dlg.getByText("Ubah level kognitif", { exact: true }).click();
  await expect(dlg.getByLabel("Level tujuan")).toHaveValue("C3");
  await dlg.getByRole("button", { name: /Buat varian/ }).click();
  await expect(page.locator("[data-kunci-ai]")).toBeVisible();
  await expect(page.locator(".swal2-popup")).toContainText("2 varian soal dibuat sebagai draf");
  await page.getByRole("button", { name: "Lihat draf" }).click();
  await expect(dlg).toHaveCount(0);

  // Cakupan per TP & level, lalu periksa soal kembar
  await page.getByRole("button", { name: /Cakupan/ }).click();
  await page.getByLabel("Mata pelajaran").selectOption(materi.id_mapel);
  const baris = page.locator(`tr[data-tp="${tp.id_indikator}"]`);
  await expect(baris).toContainText(tp.deskripsi);
  await expect(baris.locator("td").nth(2)).not.toHaveText("·"); // kolom C2 terisi soal yang disetujui
  await page.getByRole("button", { name: /Periksa soal kembar/ }).click();
  await expect(page.getByText(/Tidak ada soal kembar di antara|pasangan soal kembar dari/)).toBeVisible();
  await page.screenshot({ path: test.info().outputPath("cakupan-soal.png"), fullPage: true });
});

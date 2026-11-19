// Notebook AI Tahap B: guru membuat notebook dari dua dokumen Pustaka, bertanya ke semua dokumen (respons AI ditiru),
// menulis catatan sendiri, lalu Jadikan… ATP membuka Perangkat Ajar dengan catatan itu terpilih sebagai bahan AI.
const path = require("path");
const { test, expect, unggahApi, API } = require("../bantu");

test.describe.configure({ timeout: 180000 });

const BERKAS = { nama: "berkas", path: path.join(__dirname, "../data/cp-bahasa-inggris.txt"), tipe: "text/plain" };
const JUDUL = `Notebook E2E ${Date.now()}`;

test("guru menggabungkan dua dokumen dalam notebook, bertanya, mencatat, dan menjadikannya bahan ATP", async ({ page, masuk }) => {
  const admin = await masuk("admin");
  await unggahApi(admin, "/dokumen-rujukan", { judul: "CP Riset Satu E2E", jenis: "CP" }, BERKAS);
  await unggahApi(admin, "/dokumen-rujukan", { judul: "Panduan Riset Dua E2E", jenis: "PANDUAN" }, BERKAS);

  const guru = await masuk("guru");
  await page.goto("/dashboard/pustaka-dokumen");
  const kartu = page.locator("[data-daftar-notebook]");
  await kartu.getByRole("button", { name: /Notebook baru/ }).click();
  const form = page.getByRole("dialog", { name: "Notebook baru" });
  await form.getByLabel("Judul notebook").fill(JUDUL);
  await form.getByPlaceholder("Cari dokumen…").fill("Riset");
  await form.getByRole("checkbox", { name: "CP Riset Satu E2E" }).first().check();
  await form.getByRole("checkbox", { name: "Panduan Riset Dua E2E" }).first().check();
  await form.getByRole("button", { name: "Simpan notebook" }).click();

  const nb = page.locator("#notebook-riset");
  await expect(nb.locator("[data-dokumen-notebook]")).toContainText("CP Riset Satu E2E");
  await expect(nb.locator("[data-dokumen-notebook]")).toContainText("Panduan Riset Dua E2E");

  // Tanya lintas dokumen: jawaban AI ditiru, bentuknya sama dengan respons server
  await page.route(/\/api\/notebook\/\d+\/tanya$/, (route) => route.fulfill({ json: { success: true, cukup: true, data: {
    id: 999999, jenis: "TANYA", judul: "Bagaimana memperkenalkan diri?", isi: "Siswa menyebut nama dan asal [B1], dinilai lewat pengamatan [B2].",
    rujukan: [{ no: 1, judul: "CP Riset Satu E2E", bagian: 1, teks: "Memperkenalkan diri." }, { no: 2, judul: "Panduan Riset Dua E2E", bagian: 3, teks: "Asesmen lewat pengamatan." }],
    updated_at: new Date().toISOString() } } }));
  await nb.getByLabel("Pertanyaan untuk notebook").fill("Bagaimana memperkenalkan diri?");
  await nb.getByRole("button", { name: /Tanya/ }).click();
  const jawaban = nb.locator("[data-catatan='999999']");
  await expect(jawaban).toContainText("Jawaban AI");
  await jawaban.getByText("2 bagian dokumen dirujuk").click();
  await expect(jawaban).toContainText("B2 · Panduan Riset Dua E2E");
  await page.unroute(/\/api\/notebook\/\d+\/tanya$/);

  // Catatan sendiri tersimpan di server
  await nb.getByRole("button", { name: /Catatan baru/ }).click();
  await nb.getByLabel("Judul catatan").fill("Rencana perkenalan");
  await nb.getByLabel("Isi catatan").fill("Mulai dengan lagu perkenalan, lalu siswa menyebut nama dan kampungnya.");
  await nb.getByRole("button", { name: "Simpan catatan" }).click();
  const catatan = nb.locator("[data-catatan]").filter({ hasText: "Rencana perkenalan" });
  await expect(catatan).toContainText("Catatan saya");

  // Jadikan… ATP membuka tab Perangkat Ajar dengan ?notebook=<id catatan>
  const [tab] = await Promise.all([page.context().waitForEvent("page"), (async () => {
    await catatan.getByRole("button", { name: /Jadikan/ }).click();
    await page.getByRole("menuitem", { name: "ATP" }).click();
  })()]);
  await tab.waitForLoadState("domcontentloaded");
  const tujuan = new URL(tab.url());
  await tab.close();
  expect(tujuan.pathname).toBe("/dashboard/perangkat-ajar");
  // Tab baru tidak memakai penyadap API tes, jadi tujuan dibuka di tab ini
  await page.goto(tujuan.pathname + tujuan.search);
  await expect(page.locator("[data-bahan-notebook]")).toContainText("Rencana perkenalan", { timeout: 60_000 });
  await expect(page.locator("[data-bahan-notebook]")).toContainText(JUDUL);

  // Hapus notebook dari halaman Pustaka
  await page.goto("/dashboard/pustaka-dokumen");
  await page.locator("[data-daftar-notebook]").getByRole("button", { name: new RegExp(JUDUL) }).click();
  await nb.getByRole("button", { name: "Hapus notebook" }).click();
  await page.locator(".swal2-confirm").click();
  await expect(nb).toBeHidden();
  await expect(page.locator("[data-daftar-notebook]")).not.toContainText(JUDUL);
  const sisa = await (await fetch(`${API}/api/notebook`, { headers: { Authorization: `Bearer ${guru.access_token}`, Accept: "application/json" } })).json();
  expect(sisa.data.some((n) => n.judul === JUDUL)).toBe(false);
});

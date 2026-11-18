// CBT Tahap B: guru membuat stimulus AKM bersama dan soal yang memakainya; siswa membaca stimulus di samping soal
// saat tes online; analisis paket menampilkan level kompetensi per siswa dan per domain.
const { test, expect, masukApi, API } = require("../bantu");

test.describe.configure({ mode: "serial", timeout: 180000 });

const JUDUL = "Kebun Mama Yuliana";

async function kirim(sesi, method, path, body) {
  const res = await fetch(`${API}/api${path}`, { method, headers: { Authorization: `Bearer ${sesi.access_token}`, Accept: "application/json", "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json();
  if (!res.ok) throw new Error(`${path}: ${res.status} ${JSON.stringify(data)}`);
  return data;
}

test("guru membuat stimulus AKM, dua soal memakainya, dan paket dibuka online", async ({ page, masuk }) => {
  await masuk("guru");
  await page.goto("/dashboard/bank-soal");
  await page.getByRole("button", { name: /Stimulus AKM/ }).click();
  await page.getByRole("button", { name: "Stimulus baru" }).click({ timeout: 60_000 });
  const form = page.getByRole("dialog", { name: "Stimulus baru" });
  await form.getByLabel("Mata pelajaran").selectOption({ label: "Matematika" });
  await form.getByLabel("Judul", { exact: true }).fill(JUDUL);
  await form.getByLabel("Jenis", { exact: true }).selectOption("NUMERASI");
  await form.getByRole("textbox", { name: "Isi stimulus" }).fill("Mama Yuliana memanen 12 karung ubi pada bulan Mei dan 8 karung pada bulan Juni.");
  await form.getByLabel("Sumber teks").fill("Karangan guru");
  await form.getByRole("button", { name: "Simpan" }).click();
  await expect(page.locator(".swal2-toast")).toContainText("Stimulus disimpan");
  const baris = page.locator(`[data-stimulus="${JUDUL}"]`);
  await expect(baris.locator("[data-jumlah-soal-stimulus]")).toHaveText("0 soal");

  // Tombol Soal membuka editor soal dengan stimulus sudah terpilih
  await baris.getByRole("button", { name: "Soal baru" }).click();
  const editor = page.getByRole("dialog", { name: "Soal baru" });
  await expect(editor.locator("#sStimulus option:checked")).toContainText(JUDUL);
  await editor.getByRole("button", { name: "Batal" }).click();

  // Dua soal memakai stimulus (lewat API agar ringkas), disetujui kepala sekolah, lalu paket dibuka online dengan soal diacak
  const guru = await masukApi("guru");
  const st = (await kirim(guru, "GET", `/stimulus?cari=${encodeURIComponent(JUDUL)}`)).data[0];
  const soal = [];
  for (const [tanya, pilihan] of [["Berapa karung ubi dipanen pada bulan Mei dan Juni?", ["20 karung", "4 karung", "12 karung"]], ["Berapa selisih panen Mei dan Juni?", ["4 karung", "20 karung", "8 karung"]]]) {
    soal.push((await kirim(guru, "POST", "/bank-soal", { id_mapel: "MPL-EMTK", id_kelas: "KLS-E4A", bentuk: "PG", level_kognitif: "C3", tingkat_kesulitan: "SEDANG",
      pertanyaan: tanya, isi: { pilihan }, kunci: { jawaban: 0 }, id_stimulus: st.id_stimulus })).data.id_soal);
  }
  await kirim(guru, "POST", "/bank-soal/ajukan", { id_soal: soal });
  await kirim(await masukApi("kepsek"), "POST", "/bank-soal/setujui", { id_soal: soal });
  const paket = (await kirim(guru, "POST", "/paket-soal", { judul: "AKM Numerasi E2E", id_mapel: "MPL-EMTK", id_kelas: "KLS-E4A", id_jenis: "JNS-UH", tanggal: "2026-01-06" })).data.id_paket;
  await kirim(guru, "POST", `/paket-soal/${paket}/butir`, { id_soal: soal });
  await kirim(guru, "PUT", `/paket-soal/${paket}/online`, { online: true, durasi_menit: 30, acak_soal: true });

  await page.reload();
  await page.getByRole("button", { name: /Stimulus AKM/ }).click();
  await expect(page.locator(`[data-stimulus="${JUDUL}"] [data-jumlah-soal-stimulus]`)).toHaveText("2 soal");
});

test("siswa membaca stimulus di samping soal dan menjawab", async ({ page, masuk }) => {
  await masuk("siswa");
  await page.goto("/dashboard/ujian");
  await page.locator(".kartu-ujian", { hasText: "AKM Numerasi E2E" }).getByRole("link", { name: /Mulai/ }).click({ timeout: 60_000 });
  await page.getByRole("button", { name: "Mulai mengerjakan" }).click();
  const panel = page.locator("[data-stimulus-ujian]");
  await expect(panel).toContainText(JUDUL);
  await expect(panel).toContainText("12 karung ubi");
  await expect(panel).toContainText("untuk soal 1–2");

  // Jawab benar kedua soal, apa pun urutannya
  for (let i = 0; i < 2; i++) {
    const tanya = await page.locator(".card-body .fs-5").first().innerText();
    await page.getByRole("radio", { name: tanya.includes("selisih") ? /(^|[^0-9])4 karung$/ : /20 karung$/ }).click();
    await expect(page.getByText("tersimpan")).toBeVisible();
    if (i === 0) {
      await page.getByRole("button", { name: /Berikutnya/ }).click();
      await expect(panel).toContainText(JUDUL); // stimulus tetap tampil di soal berikutnya
    }
  }
  await page.getByRole("button", { name: "Kumpulkan" }).last().click();
  await page.locator(".swal2-confirm").click();
  await expect(page.getByText("Jawabanmu sudah terkumpul")).toBeVisible();
});

test("analisis paket menampilkan level kompetensi siswa", async ({ page, masuk }) => {
  await masuk("guru");
  await page.goto("/dashboard/bank-soal");
  await page.getByRole("button", { name: /Paket Soal/ }).click();
  await page.locator(".kartu-paket", { hasText: "AKM Numerasi E2E" }).getByRole("button").first().click({ timeout: 60_000 });
  await page.getByRole("button", { name: "Analisis" }).click();
  const kartu = page.locator("[data-level-kompetensi]");
  await expect(kartu).toBeVisible({ timeout: 30_000 });
  await expect(kartu.locator('[data-sebaran-level="MAHIR"]')).toContainText("1");
  await expect(kartu.locator('[data-domain="NUMERASI"]')).toContainText("100%");
  await expect(kartu.locator('[data-siswa-kompetensi="Natan Murib"]')).toContainText("Mahir");
});

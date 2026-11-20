// CBT/ANBK Tahap A: kepala sekolah menjadwalkan sesi ujian lintas kelas dengan token sesi, mencetak kartu peserta;
// siswa mengerjakan dalam mode ujian (log keluar halaman, kunci setelah batas pelanggaran, simpan saat offline);
// pengawas memantau langsung dan mengizinkan masuk ulang.
const { test, expect, masukApi, API } = require("../bantu");

test.describe.configure({ mode: "serial" });

async function kirim(sesi, method, path, body) {
  const res = await fetch(`${API}/api${path}`, { method, headers: { Authorization: `Bearer ${sesi.access_token}`, Accept: "application/json", "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json();
  if (!res.ok) throw new Error(`${path}: ${data.message}`);
  return data;
}

// Siswa keluar dari halaman ujian (tab disembunyikan)
const keluarHalaman = (page) => page.evaluate(() => {
  Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
  document.dispatchEvent(new Event("visibilitychange"));
  Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
  document.dispatchEvent(new Event("visibilitychange"));
});

test("sesi ujian lintas kelas: token, kartu peserta, mode ujian terkunci, pengawas mengizinkan masuk ulang", async ({ page, masuk, context, browser }) => {
  test.setTimeout(240_000);
  // Paket soal milik guru (lewat API agar tes ini mandiri)
  const guru = await masukApi("guru");
  const paket = (await kirim(guru, "POST", "/paket-soal", { judul: "PTS CBT E2E", id_mapel: "MPL-EMTK", id_kelas: "KLS-E4A", id_jenis: "JNS-UH", tanggal: "2026-01-06", durasi_menit: 60 })).data.id_paket;
  await kirim(guru, "POST", `/paket-soal/${paket}/butir`, { id_soal: ["SOAL-E2E-CBT"] });

  // Kepala sekolah (proktor) membuat sesi untuk kelas 4A dan 5A
  await masuk("kepsek");
  await page.goto("/dashboard/sesi-ujian");
  await page.getByRole("button", { name: "Sesi baru" }).click({ timeout: 60_000 });
  const form = page.getByRole("dialog", { name: "Sesi ujian baru" });
  await form.getByLabel("Paket soal").selectOption({ label: "PTS CBT E2E · Matematika · 1 soal" });
  await expect(form.getByLabel("Nama sesi")).toHaveValue("PTS CBT E2E Sesi 1");
  await form.getByRole("group", { name: "Kelas peserta" }).getByText("5A").click();
  const mulai = new Date(Date.now() - 10 * 60000);
  const lokal = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  await form.getByLabel("Dibuka").fill(lokal(mulai));
  await form.getByLabel("Token sesi").fill("CBT777");
  await form.getByLabel("Kunci setelah pelanggaran ke-").fill("2");
  await form.getByLabel("Ruang").fill("Lab 1");
  await form.getByLabel("Wajib layar penuh").uncheck(); // peramban tes tanpa layar penuh
  await form.getByRole("button", { name: "Simpan sesi" }).click();

  const detail = page.locator(".detail-sesi");
  await expect(detail).toContainText("PTS CBT E2E Sesi 1", { timeout: 30_000 });
  await expect(detail.locator("[data-token-sesi]")).toContainText("CBT777");
  await expect(detail.locator(".pantau-sesi")).toContainText("Natan Murib", { timeout: 30_000 });
  await expect(detail.locator(".pantau-sesi")).toContainText("Simon Wonda"); // kelas 5A ikut

  // Kartu peserta
  const [jendela] = await Promise.all([context.waitForEvent("page"), detail.getByRole("button", { name: "Kartu peserta" }).click()]);
  await jendela.evaluate(() => { window.print = () => {}; });
  await expect(jendela.locator("body")).toContainText("KARTU PESERTA UJIAN", { timeout: 20_000 });
  await expect(jendela.locator("body")).toContainText("siswa.e2e");
  await expect(jendela.locator("[data-kartu-ujian] .qr svg").first()).toBeVisible(); // QR ke halaman masuk
  await jendela.close();

  // Siswa: mulai dengan token, jawab, lalu keluar halaman 2 kali → terkunci
  await masuk("siswa");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/dashboard/ujian");
  const kartu = page.locator(".kartu-ujian", { hasText: "PTS CBT E2E" });
  await expect(kartu).toContainText("Lab 1", { timeout: 30_000 });
  await kartu.getByRole("link", { name: /Mulai/ }).click();
  await expect(page.getByText(/Ujian hanya bisa dikerjakan di/)).toBeVisible({ timeout: 60_000 }); // halaman dinamis pertama kali dikompilasi
  await page.getByLabel("Token dari pengawas").fill("cbt777");
  await page.getByRole("button", { name: "Mulai mengerjakan" }).click();
  await expect(page.getByText("Pecahan yang senilai dengan 1/2")).toBeVisible();

  // Offline: jawaban disimpan di perangkat lalu terkirim saat sinyal kembali
  await context.setOffline(true);
  await page.getByRole("radio", { name: /2\/4/ }).click();
  await expect(page.locator("[data-offline]")).toBeVisible();
  await context.setOffline(false);
  await expect(page.getByText("tersimpan")).toBeVisible({ timeout: 20_000 });

  await keluarHalaman(page);
  await page.waitForTimeout(1500);
  await keluarHalaman(page);
  await expect(page.locator("[data-ujian-terkunci]")).toContainText("Keluar dari halaman ujian 2 kali", { timeout: 20_000 });

  // Pengawas melihatnya terkunci dan mengizinkan masuk ulang
  const siswaPage = page;
  // Pengawas di peramban lain (localStorage terpisah dari HP siswa)
  const ctxPengawas = await browser.newContext({ baseURL: test.info().project.use.baseURL });
  const sesiKepsek = await masukApi("kepsek");
  await ctxPengawas.addInitScript(([token, user]) => { localStorage.setItem("token", token); localStorage.setItem("user", user); }, [sesiKepsek.access_token, JSON.stringify(sesiKepsek.data)]);
  // Seperti fixture page: semua /api diteruskan ke API tes
  await ctxPengawas.route((url) => url.pathname.includes("/api/"), async (route) => {
    const asal = new URL(route.request().url());
    try { await route.fulfill({ response: await route.fetch({ url: API + asal.pathname + asal.search, maxRedirects: 0 }) }); }
    catch (e) { if (!/closed|disposed/.test(String(e))) throw e; }
  });
  const pengawas = await ctxPengawas.newPage();
  await pengawas.goto("/dashboard/sesi-ujian");
  await pengawas.locator(".kartu-sesi", { hasText: "PTS CBT E2E Sesi 1" }).click({ timeout: 60_000 });
  const baris = pengawas.locator(".pantau-sesi tr", { hasText: "Natan Murib" });
  await expect(baris).toContainText("Terkunci", { timeout: 30_000 });
  await baris.getByRole("button", { name: "Izinkan masuk" }).click();
  await pengawas.locator("#tambahMenit").fill("5");
  await pengawas.locator(".swal2-confirm").click();
  await expect(baris).toContainText("Mengerjakan", { timeout: 20_000 });
  await expect(baris).toContainText("+5m");

  // Halaman siswa terbuka sendiri, jawaban tetap ada, lalu kumpulkan
  await expect(siswaPage.getByText("Pecahan yang senilai dengan 1/2")).toBeVisible({ timeout: 20_000 });
  await expect(siswaPage.getByRole("radio", { name: /2\/4/ })).toBeChecked();
  await siswaPage.getByRole("button", { name: "Kumpulkan" }).last().click();
  await siswaPage.locator(".swal2-confirm").click();
  await expect(siswaPage.getByText("Jawabanmu sudah terkumpul")).toBeVisible();

  await expect(pengawas.locator(".pantau-sesi tr", { hasText: "Natan Murib" })).toContainText("Selesai", { timeout: 30_000 });
  await pengawas.locator(".pantau-sesi tr", { hasText: "Natan Murib" }).getByRole("button", { name: "Log Natan Murib" }).click();
  await expect(pengawas.locator(".swal2-popup")).toContainText("Diizinkan masuk ulang");
  await expect(pengawas.locator(".swal2-popup")).toContainText("Keluar dari halaman");
  await ctxPengawas.close();
});

// Surat akun berkop sekolah: admin membuat akun massal, lalu mencetak surat (1 akun per halaman dan ringkas).
// Setiap halaman berformat sama: kop, salam pembuka, kartu akun, tanda tangan kepala sekolah, kaki halaman bernomor.
const path = require("path");
const { test, expect } = require("../bantu");

async function bukaSurat(page) {
  const [jendela] = await Promise.all([
    page.waitForEvent("popup"),
    page.getByRole("button", { name: "Cetak Surat Akun (PDF)" }).click(),
  ]);
  await jendela.waitForSelector("section.lembar");
  return jendela;
}

test("admin mencetak surat akun berkop sekolah untuk akun siswa baru", async ({ page, masuk }) => {
  await masuk("admin");
  await page.goto("/dashboard/pengguna");
  await page.getByRole("button", { name: "Buat Akun Massal" }).click();
  await page.getByRole("button", { name: /Semua siswa/ }).click();
  await page.getByRole("button", { name: "Buat akun" }).click();

  const modal = page.locator(".modal-dialog").filter({ hasText: "akun dibuat" });
  await expect(modal).toBeVisible();
  const jumlah = await modal.locator("tbody tr").count();
  expect(jumlah).toBeGreaterThan(1);

  // Satu akun per halaman: sapaan pribadi, jumlah halaman = jumlah akun
  await modal.locator("select").selectOption("pribadi");
  const pribadi = await bukaSurat(page);
  const lembar = pribadi.locator("section.lembar");
  await expect(lembar).toHaveCount(jumlah);
  const pertama = lembar.first();
  await expect(pertama.locator(".kop-nama")).toHaveText("SD Uji Coba Nusantara");
  await expect(pertama.locator(".kop-alamat")).toContainText("Jalan Contoh 1, Nabire");
  await expect(pertama).toContainText("Yth. Ananda");
  await expect(pertama).toContainText("Ganti kata sandi saat pertama kali masuk");
  await expect(pertama.locator(".ttd-resmi")).toContainText("Kepala Uji");
  await expect(pertama.locator(".kaki-resmi")).toContainText(`Halaman 1 dari ${jumlah}`);
  await expect(lembar.last().locator(".kaki-resmi")).toContainText(`Halaman ${jumlah} dari ${jumlah}`);
  await pribadi.emulateMedia({ media: "print" });
  await pertama.screenshot({ path: path.join(__dirname, "../hasil/surat-akun-pribadi.png") });
  await pribadi.pdf({ path: path.join(__dirname, "../hasil/surat-akun-pribadi.pdf"), format: "A4", printBackground: true, preferCSSPageSize: true });
  await pribadi.close();

  // Ringkas: beberapa akun per halaman, sapaan kelompok
  await modal.locator("select").selectOption("ringkas");
  const ringkas = await bukaSurat(page);
  await expect(ringkas.locator("section.lembar")).toHaveCount(Math.ceil(jumlah / 4));
  await expect(ringkas.locator(".kartu")).toHaveCount(jumlah);
  await expect(ringkas.locator("section.lembar").first()).toContainText("Yth. Ananda Siswa");
  await ringkas.emulateMedia({ media: "print" });
  await ringkas.locator("section.lembar").first().screenshot({ path: path.join(__dirname, "../hasil/surat-akun-ringkas.png") });
  await ringkas.pdf({ path: path.join(__dirname, "../hasil/surat-akun-ringkas.pdf"), format: "A4", printBackground: true, preferCSSPageSize: true });
});

test("akun peninjau (yayasan) melihat semua menu tetapi perubahan ditolak", async ({ page, masuk }) => {
  // Admin membuat akun yayasan lewat API tes, lalu masuk sebagai akun itu
  const { API } = require("../bantu");
  const admin = await masuk("admin");
  const res = await fetch(`${API}/api/users`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: `Bearer ${admin.access_token}` },
    body: JSON.stringify({ name: "Pengurus Yayasan Uji", role: "yayasan", username: `yayasan.e2e.${Date.now()}`, password: "Yayasan-2026", aktif: true, wajib_ganti_password: false }),
  });
  expect(res.status).toBe(201);
  const akun = (await res.json()).data;
  const login = await (await fetch(`${API}/api/login`, {
    method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ login: akun.username, password: "Yayasan-2026" }),
  })).json();
  await page.addInitScript(([t, u]) => { localStorage.setItem("token", t); localStorage.setItem("user", u); }, [login.access_token, JSON.stringify(login.data)]);

  await page.goto("/dashboard");
  await expect(page.getByText("Mode peninjau (Yayasan).")).toBeVisible();
  // Menu milik admin & kepala sekolah ikut tampil dan bisa dibuka
  for (const menu of ["Master Siswa", "Manajemen Pengguna", "Pemakaian Aplikasi"]) {
    await expect(page.getByRole("link", { name: menu }).first()).toBeVisible();
  }
  await page.goto("/dashboard/hari-libur");
  await expect(page).toHaveURL(/hari-libur/);

  // Perubahan ditolak server dengan pesan yang jelas
  const tolak = await page.evaluate(async () => {
    const r = await fetch("/api/hari-libur", { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: `Bearer ${localStorage.getItem("token")}` }, body: JSON.stringify({ tanggal: "2030-01-07", nama: "Uji" }) });
    return [r.status, (await r.json()).message];
  });
  expect(tolak).toEqual([403, "Akun peninjau hanya dapat melihat data. Perubahan tidak disimpan."]);
});

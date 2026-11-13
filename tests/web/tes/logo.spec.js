// Logo resmi sekolah: admin mengunggah di Pengaturan Sekolah, lalu kop modul ajar (cetak & Word) memakai logo itu.
const fs = require("fs");
const zlib = require("zlib");
const { test, expect, API } = require("../bantu");

test.describe.configure({ mode: "serial" });

// PNG 120×120 biru polos, disusun tanpa pustaka gambar
function pngBiru(sisi = 120) {
  const crcTabel = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (b) => { let c = 0xffffffff; for (const x of b) c = crcTabel[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const potong = (jenis, isi) => {
    const panjang = Buffer.alloc(4); panjang.writeUInt32BE(isi.length);
    const badan = Buffer.concat([Buffer.from(jenis), isi]);
    const c = Buffer.alloc(4); c.writeUInt32BE(crc(badan));
    return Buffer.concat([panjang, badan, c]);
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(sisi, 0); ihdr.writeUInt32BE(sisi, 4); ihdr[8] = 8; ihdr[9] = 2;
  const baris = Buffer.concat([Buffer.from([0]), Buffer.from(Array(sisi).fill([30, 58, 138]).flat())]);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), potong("IHDR", ihdr),
    potong("IDAT", zlib.deflateSync(Buffer.concat(Array(sisi).fill(baris)))), potong("IEND", Buffer.alloc(0))]);
}

test("admin mengunggah logo; kop modul ajar (cetak & Word) memakai logo resmi", async ({ page, masuk, context }) => {
  test.setTimeout(150_000);
  await masuk("admin");
  await page.goto("/dashboard/pengaturan");
  await page.getByLabel("Logo Resmi Sekolah").setInputFiles({ name: "logo.png", mimeType: "image/png", buffer: pngBiru() });
  await expect(page.getByAltText("Logo sekolah")).toBeVisible();
  await page.getByRole("button", { name: "Simpan Pengaturan" }).click();
  await expect(page.locator(".swal2-toast")).toContainText("Pengaturan Disimpan", { timeout: 30_000 });
  await page.reload();
  await expect(page.getByAltText("Logo sekolah")).toBeVisible({ timeout: 60_000 });
  expect((await fetch(`${API}/api/logo-sekolah`)).status).toBe(200);

  // Guru membuat modul ajar lalu mengunduh Word dan mencetak
  const sesi = await masuk("guru");
  const res = await fetch(`${API}/api/perangkat-ajar/modul`, {
    method: "POST", headers: { Authorization: `Bearer ${sesi.access_token}`, Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ judul: "Modul Logo E2E", id_mapel: "MPL-EMTK", id_kelas: "KLS-E4A", jumlah_pertemuan: 1 }),
  });
  expect(res.ok).toBeTruthy();
  await page.goto("/dashboard/perangkat-ajar?tab=modul");
  await page.locator(".kartu-modul", { hasText: "Modul Logo E2E" }).click({ timeout: 60_000 });

  const [word] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Word" }).click()]);
  expect(word.suggestedFilename()).toBe("Modul Logo E2E.doc");
  const isi = fs.readFileSync(await word.path(), "utf8");
  expect(isi).toContain("multipart/related");
  expect(isi).toContain("Content-Location: file:///C:/dokumen_files/logo");
  expect(isi).toContain("Content-Type: image/png");

  const [jendela] = await Promise.all([context.waitForEvent("page"), page.getByRole("button", { name: "Cetak" }).click()]);
  await jendela.evaluate(() => { window.print = () => {}; });
  await expect(jendela.locator(".kop-logo img").first()).toBeVisible({ timeout: 20_000 });
  await jendela.close();
});

test("admin menghapus logo; kop kembali ke lambang inisial", async ({ page, masuk }) => {
  await masuk("admin");
  await page.goto("/dashboard/pengaturan");
  await page.getByRole("button", { name: "Hapus Logo" }).click({ timeout: 60_000 });
  await page.getByRole("button", { name: "Simpan Pengaturan" }).click();
  await expect(page.locator(".swal2-toast")).toContainText("Pengaturan Disimpan", { timeout: 30_000 });
  expect((await fetch(`${API}/api/logo-sekolah`)).status).toBe(404);
});

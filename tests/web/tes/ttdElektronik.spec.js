// Tanda tangan kepala sekolah tidak publik: cetak staf memuat gambarnya dengan akun staf, rapor di profil siswa memakai
// tanda pengesahan elektronik, dan halaman verifikasi publik menampilkan kop, status bertingkat, serta nilai setelah huruf awal nama.
const path = require("path");
const { test, expect, masukApi, API } = require("../bantu");

// PNG 40×40 polos (tanpa pustaka gambar)
function pngDataUrl() {
  const zlib = require("zlib");
  const crcTabel = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (b) => { let c = 0xffffffff; for (const x of b) c = crcTabel[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const potong = (jenis, isi) => { const p = Buffer.alloc(4); p.writeUInt32BE(isi.length); const j = Buffer.from(jenis); const c = Buffer.alloc(4); c.writeUInt32BE(crc(Buffer.concat([j, isi]))); return Buffer.concat([p, j, isi, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(40, 0); ihdr.writeUInt32BE(40, 4); ihdr.set([8, 2, 0, 0, 0], 8);
  const baris = Buffer.concat([Buffer.from([0]), Buffer.alloc(120, 0x20)]);
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), potong("IHDR", ihdr), potong("IDAT", zlib.deflateSync(Buffer.concat(Array(40).fill(baris)))), potong("IEND", Buffer.alloc(0))]);
  return `data:image/png;base64,${png.toString("base64")}`;
}
const kirim = async (sesi, metode, p, isi) => {
  const res = await fetch(`${API}/api${p}`, { method: metode, headers: { Authorization: `Bearer ${sesi.access_token}`, Accept: "application/json", "Content-Type": "application/json" }, body: JSON.stringify(isi) });
  if (!res.ok) throw new Error(`${p} gagal: ${res.status} ${await res.text()}`);
  return res.json();
};

test("tanda tangan kepala sekolah: cetak staf, rapor profil siswa elektronik, verifikasi publik", async ({ page, masuk }) => {
  test.setTimeout(180_000);
  // Persiapan lewat API: tanda tangan kepala sekolah, rapor Natan (akun siswa uji) diterbitkan wali kelas lalu disahkan
  const admin = await masukApi("admin");
  const ttd = (await kirim(admin, "POST", "/settings", { ttd_kepsek_base64: pngDataUrl() })).data.ttd_kepsek_url;
  const nama = ttd.split("/").pop();
  expect((await fetch(`${API}/api/signature/${nama}`)).status).toBe(401); // tanpa login ditolak
  expect((await fetch(`${API}/storage/signatures/${nama}`)).ok).toBe(false); // tidak ada di /storage publik
  const siswa = await masukApi("siswa");
  expect((await fetch(`${API}/api/signature/${nama}`, { headers: { Authorization: `Bearer ${siswa.access_token}`, Accept: "application/json" } })).status).toBe(403);

  const guru = await masukApi("guru");
  await kirim(guru, "POST", "/rapor/terbit", {
    id_kelas: "KLS-E4A", id_periode: "PER-E2E", mode_kalkulasi: "1", tanggal_rapor: "2026-11-20",
    siswa: [{ id_siswa: "SIS-E3", rata_umum: 81, mapel: [{ nama: "Matematika", kkm: 75, nilai: 81 }] }],
  });
  const kepsek = await masukApi("kepsek");
  await kirim(kepsek, "POST", "/rapor/terbit/sahkan", { id_kelas: "KLS-E4A", id_periode: "PER-E2E" });

  // Cetak rapor oleh admin: gambar tanda tangan dimuat dengan akun staf
  await masuk("admin");
  await page.goto("/dashboard/rapor");
  await page.locator('xpath=//label[contains(normalize-space(.), "Kelas")]/following::select[1]').first().selectOption("KLS-E4A");
  await page.locator('xpath=//label[contains(normalize-space(.), "Peserta Didik")]/following::select[1]').first().selectOption("SIS-E1");
  const gambar = page.locator(".rapor-preview .rp-ttd-space img").first();
  await expect(gambar).toBeVisible({ timeout: 30_000 });
  await expect.poll(() => gambar.evaluate((img) => img.naturalWidth)).toBeGreaterThan(0);
  await expect(page.locator(".rapor-preview [data-tte-kepsek]")).toHaveCount(0);

  // Rapor di profil siswa: tanda pengesahan elektronik, tanpa gambar tanda tangan
  await masuk("siswa");
  await page.goto("/dashboard/portal");
  await page.locator("ul.nav-pills .nav-link").filter({ hasText: "Rapor" }).click();
  const tte = page.locator('.rapor-preview [data-tte-kepsek="disahkan"]').first();
  await expect(tte).toBeVisible({ timeout: 30_000 });
  await expect(tte).toContainText("Disahkan secara elektronik");
  await expect(page.locator(".rapor-preview .rp-ttd-space img")).toHaveCount(0);
  await page.locator(".rapor-preview .rp-page").nth(1).screenshot({ path: path.join(__dirname, "../hasil/ttd-elektronik-portal.png") });
  const kode = (await tte.textContent()).match(/Kode ([A-Z0-9]+)/)[1];

  // Halaman verifikasi publik: kop, status sah, pengesahan, nilai setelah huruf awal nama
  await page.goto(`/verifikasi/rapor/${kode}`);
  await expect(page.locator('[data-pita-status="sah"]')).toContainText("Rapor sah dan berlaku");
  await expect(page.locator(".vr-kop")).toContainText("NPSN 000000");
  await expect(page.locator('[data-ttd="kepsek"]')).toContainText("Kepala Uji");
  await expect(page.locator("[data-tabel-nilai]")).toHaveCount(0);
  await page.locator("#vr-inisial").fill("ZZ");
  await page.getByRole("button", { name: "Tampilkan nilai" }).click();
  await expect(page.locator("#vr-inisial-ket")).toContainText("tidak cocok");
  await page.locator("#vr-inisial").fill("NA");
  await page.getByRole("button", { name: "Tampilkan nilai" }).click();
  await expect(page.locator("[data-tabel-nilai]")).toContainText("Matematika");
  await page.screenshot({ path: path.join(__dirname, "../hasil/verifikasi-rapor.png"), fullPage: true });
});

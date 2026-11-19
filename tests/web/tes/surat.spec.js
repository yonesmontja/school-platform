// Surat & Arsip (Administrasi Tahap D): templat → draf → tanda tangan kepala sekolah → verifikasi publik; surat masuk → disposisi → tindak lanjut; dokumen legal.
const { test, expect, masukApi, API } = require("../bantu");

test.describe.configure({ mode: "serial", timeout: 180000 });

const tahun = () => new Date(Date.now() + 9 * 3600000).getUTCFullYear();
const hari = (n) => new Date(Date.now() + 9 * 3600000 + n * 86400000).toISOString().slice(0, 10);

async function ambil(sesi, path) {
  const res = await fetch(`${API}/api${path}`, { headers: { Authorization: `Bearer ${sesi.access_token}`, Accept: "application/json" } });
  return res.json();
}

test("admin mengatur nomor, memakai templat contoh, dan mengajukan surat untuk ditandatangani", async ({ page, masuk }) => {
  await masuk("admin");
  await page.goto("/dashboard/administrasi/surat?tab=templat");
  await page.locator("#nSingkatan").fill("SAP");
  await page.getByRole("button", { name: "Simpan format" }).click();
  await expect(page.locator(".swal2-toast")).toContainText("Format nomor surat disimpan");
  await page.getByRole("button", { name: "Tambah contoh templat" }).click();
  await expect(page.locator('[data-templat="Surat Keterangan Aktif Sekolah"]')).toBeVisible();

  await page.getByRole("tab", { name: "Surat Keluar" }).click();
  await page.getByRole("button", { name: "Surat baru" }).click();
  const templat = await page.locator("#sTemplat option", { hasText: "Surat Keterangan Aktif Sekolah" }).getAttribute("value");
  await page.locator("#sTemplat").selectOption(templat);
  await page.locator("#sSiswa").selectOption("SIS-E1");
  await page.getByRole("button", { name: "Isi dari templat" }).click();
  await expect(page.locator("[data-editor-surat] .editor-kaya-tulis")).toContainText("Abner Kogoya");
  await expect(page.locator("#sPerihal")).toHaveValue("Surat Keterangan Aktif");
  await page.locator("#sTujuan").fill("Yth. Kepala Dinas Pendidikan\ndi Nabire");
  await page.getByRole("button", { name: "Simpan draf" }).click();
  await expect(page.locator(".swal2-toast")).toContainText("Draf surat disimpan");

  const baris = page.locator('[data-surat-keluar="Surat Keterangan Aktif"]');
  await expect(baris.locator("[data-status-surat]")).toHaveText("Draf");
  await baris.getByRole("button", { name: "Aksi untuk Surat Keterangan Aktif" }).click();
  await page.getByRole("menuitem", { name: "Ajukan tanda tangan ke kepala sekolah" }).click();
  await expect(baris.locator("[data-status-surat]")).toHaveText("Menunggu tanda tangan");
});

test("kepala sekolah menandatangani; surat tercetak bernomor dan terverifikasi di halaman publik", async ({ page, masuk }) => {
  await masuk("kepsek");
  await page.goto("/dashboard/administrasi/surat?tab=keluar&status=DIAJUKAN");
  const baris = page.locator('[data-surat-keluar="Surat Keterangan Aktif"]');
  await baris.getByRole("button", { name: "Aksi untuk Surat Keterangan Aktif" }).click();
  await page.getByRole("menuitem", { name: "Tandatangani & terbitkan" }).click();
  await page.getByRole("button", { name: "Tandatangani", exact: true }).click();
  await expect(page.locator(".swal2-toast")).toContainText("Ditandatangani secara digital");
  await page.locator("select[aria-label='Saring status surat']").selectOption("");
  const nomor = `001/421.2/SAP/`;
  await expect(baris.locator("[data-nomor-surat]")).toContainText(nomor);

  const popup = page.waitForEvent("popup");
  await baris.getByTitle("Lihat / cetak").click();
  const cetak = await popup;
  await expect(cetak.locator("body")).toContainText(`${nomor}`);
  await expect(cetak.locator("body")).toContainText("Ditandatangani secara elektronik");
  await expect(cetak.locator("body")).toContainText("Abner Kogoya");
  // Kode QR verifikasi tercetak sebagai SVG di samping tautannya
  await expect(cetak.locator("[data-qr-verifikasi] svg")).toBeVisible();
  await expect(cetak.locator(".verifikasi")).toContainText("/verifikasi/");
  await cetak.close();

  const sesi = await masukApi("kepsek");
  const surat = (await ambil(sesi, "/administrasi/surat/keluar?status=TERBIT")).data[0];
  const { kode_verifikasi: kode } = (await ambil(sesi, `/administrasi/surat/keluar/${surat.id}`)).data;
  // Halaman verifikasi publik (tanpa login pun bisa dibuka)
  await page.goto(`/verifikasi/${kode}`, { waitUntil: "domcontentloaded" });
  await expect(page.locator('[data-verifikasi="asli"]')).toContainText(nomor);
  await expect(page.locator('[data-verifikasi="asli"]')).toContainText("Ditandatangani elektronik");
  await page.goto("/verifikasi/TIDAKADA00", { waitUntil: "domcontentloaded" });
  await expect(page.locator('[data-verifikasi="tidak-ditemukan"]')).toBeVisible();
});

test("surat masuk didisposisikan ke guru; guru mencatat tindak lanjut", async ({ page, masuk }) => {
  await masuk("admin");
  await page.goto("/dashboard/administrasi/surat?tab=masuk");
  await page.getByRole("button", { name: "Catat surat masuk" }).click();
  await page.locator("#mPengirim").fill("Dinas Pendidikan Nabire");
  await page.locator("#mNomor").fill("421/77/DISDIK");
  await page.locator("#mPerihal").fill("Undangan pelatihan guru");
  await page.getByRole("button", { name: "Simpan", exact: true }).click();
  await expect(page.locator(".swal2-toast")).toContainText(`nomor agenda 1/${tahun()}`);

  const baris = page.locator('[data-surat-masuk="Undangan pelatihan guru"]');
  await baris.getByRole("button", { name: "Disposisi" }).click();
  const guru = await page.locator("#dKepada option", { hasText: "Yakobus Wenda" }).getAttribute("value");
  await page.locator("#dKepada").selectOption(guru);
  await page.locator("#dInstruksi").fill("Hadiri dan laporkan");
  await page.getByRole("button", { name: "Kirim disposisi" }).click();
  await expect(baris.locator("[data-status-masuk]")).toHaveText("Didisposisi");

  await masuk("guru");
  await page.goto("/dashboard/disposisi");
  const d = page.locator('[data-disposisi="Undangan pelatihan guru"]');
  await expect(d).toContainText("Hadiri dan laporkan");
  await d.getByRole("button", { name: "Selesai" }).click();
  await page.locator(".swal2-textarea").fill("Sudah hadir; materi dibagikan di rapat guru");
  await page.getByRole("button", { name: "Simpan", exact: true }).click();
  await expect(d.locator("[data-status-disposisi]")).toHaveText("Selesai");

  await masuk("admin");
  await page.goto("/dashboard/administrasi/surat?tab=masuk");
  await expect(page.locator('[data-surat-masuk="Undangan pelatihan guru"] [data-status-masuk]')).toHaveText("Selesai");
  await expect(page.locator('[data-surat-masuk="Undangan pelatihan guru"]')).toContainText("materi dibagikan");
});

test("dokumen legal menampilkan sisa masa berlaku", async ({ page, masuk }) => {
  await masuk("admin");
  await page.goto("/dashboard/administrasi/surat?tab=legal");
  await page.getByRole("button", { name: "Dokumen legal baru" }).click();
  await page.locator("#aJudul").fill("Izin operasional sekolah");
  await page.locator("#aNomor").fill("421/123/2024");
  await page.locator("#aBerlaku").fill(hari(30));
  await page.getByRole("button", { name: "Simpan", exact: true }).click();
  await expect(page.locator('[data-arsip="Izin operasional sekolah"] [data-masa-berlaku]')).toHaveText("Habis dalam 30 hari");
});

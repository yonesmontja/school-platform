// Inventaris (Administrasi Tahap E): aset → peminjaman & pengembalian → stok habis pakai → pengadaan disetujui kepala sekolah → barang diterima.
const { test, expect } = require("../bantu");

test.describe.configure({ mode: "serial", timeout: 180000 });

test("admin mencatat aset, mencetak KIR, dan meminjamkannya", async ({ page, masuk }) => {
  await masuk("admin");
  await page.goto("/dashboard/administrasi/inventaris");
  await page.getByRole("button", { name: "Aset baru" }).click();
  await page.locator("#iNama").fill("Proyektor Uji");
  await page.locator("#iKategori").fill("Elektronik");
  await page.locator("#iJumlah").fill("2");
  await page.locator("#iHarga").fill("4000000");
  await page.locator("#iUmur").fill("4");
  await page.locator("#iTanggal").fill(new Date(Date.now() - 365 * 86400000).toISOString().slice(0, 10));
  await page.getByRole("button", { name: "Simpan", exact: true }).click();
  await expect(page.locator(".swal2-toast")).toContainText("dicatat dengan kode INV-");
  const baris = page.locator('[data-aset="Proyektor Uji"]');
  await expect(baris).toContainText("2 unit");

  const popup = page.waitForEvent("popup");
  await page.getByRole("button", { name: "Cetak KIR" }).click();
  const kir = await popup;
  await expect(kir.locator("body")).toContainText("KARTU INVENTARIS RUANGAN");
  await expect(kir.locator("body")).toContainText("Proyektor Uji");
  await kir.close();

  await page.getByRole("tab", { name: "Peminjaman" }).click();
  await page.getByRole("button", { name: "Catat peminjaman" }).click();
  await page.locator("#jPeminjam").fill("Yakobus Wenda");
  await page.locator("#jKeperluan").fill("Presentasi kelas 4A");
  await page.getByRole("button", { name: "Simpan", exact: true }).click();
  await expect(page.locator(".swal2-toast")).toContainText("Peminjaman dicatat");
  const pinjam = page.locator('[data-pinjam="Proyektor Uji · Yakobus Wenda"]');
  await expect(pinjam).toContainText("Dipinjam");

  await pinjam.getByRole("button", { name: "Kembalikan" }).click();
  await page.locator("#kKondisi").selectOption("RUSAK_RINGAN");
  await page.locator("#kCatatan").fill("Kabel HDMI longgar");
  await page.getByRole("button", { name: "Simpan", exact: true }).click();
  await expect(page.locator(".swal2-toast")).toContainText("Pengembalian dicatat");

  await page.getByRole("tab", { name: "Aset" }).click();
  await expect(page.locator('[data-aset="Proyektor Uji"] [data-kondisi]')).toHaveText("Rusak ringan");
  await page.locator('[data-aset="Proyektor Uji"]').getByRole("button", { name: "Proyektor Uji", exact: true }).click();
  await expect(page.locator('[data-detail-aset="Proyektor Uji"]')).toContainText("Kabel HDMI longgar");
});

test("stok habis pakai berkurang dan menandai batas minimum", async ({ page, masuk }) => {
  await masuk("admin");
  await page.goto("/dashboard/administrasi/inventaris?tab=stok");
  await page.getByRole("button", { name: "Barang baru" }).click();
  await page.locator("#sNama").fill("Spidol papan");
  await page.locator("#sAwal").fill("12");
  await page.locator("#sMin").fill("5");
  await page.getByRole("button", { name: "Simpan", exact: true }).click();
  const stok = page.locator('[data-stok="Spidol papan"]');
  await expect(stok.locator("[data-jumlah-stok]")).toHaveText("12 pcs");
  await stok.getByRole("button", { name: "Barang keluar Spidol papan" }).click();
  await page.locator("#mJumlah").fill("8");
  await page.locator("#mKet").fill("Kelas 4A dan 5A");
  await page.getByRole("button", { name: "Simpan", exact: true }).click();
  await expect(page.locator(".swal2-toast")).toContainText("batas minimum");
  await expect(stok.locator("[data-jumlah-stok]")).toHaveText("4 pcs");
});

test("pengadaan: diajukan admin, disetujui kepala sekolah, diterima masuk stok dan kas", async ({ page, masuk }) => {
  await masuk("admin");
  await page.goto("/dashboard/administrasi/inventaris?tab=pengadaan");
  await page.getByRole("button", { name: "Ajukan pengadaan" }).click();
  await page.locator("#aJudul").fill("ATK semester ganjil");
  await page.locator(".r-nama").first().fill("Spidol papan");
  await page.locator(".r-jumlah").first().fill("20");
  await page.locator(".r-harga").first().fill("7500");
  await page.getByRole("button", { name: "Ajukan", exact: true }).click();
  const p = page.locator('[data-pengadaan="ATK semester ganjil"]');
  await expect(p.locator("[data-status-pengadaan]")).toHaveText("Menunggu keputusan");
  await expect(p).toContainText("Rp150.000");

  await masuk("kepsek");
  await page.goto("/dashboard/administrasi/inventaris?tab=pengadaan");
  await p.getByRole("button", { name: "Setujui" }).click();
  await page.locator(".swal2-confirm").click();
  await expect(p.locator("[data-status-pengadaan]")).toHaveText("Disetujui");

  await masuk("admin");
  await page.goto("/dashboard/administrasi/inventaris?tab=pengadaan");
  await p.getByRole("button", { name: "Barang diterima" }).click();
  await page.getByLabel("Tujuan Spidol papan").selectOption("STOK");
  await page.getByRole("button", { name: "Selesaikan" }).click();
  await expect(page.locator(".swal2-toast")).toContainText("1 barang masuk ke stok. Pengeluaran dicatat di kas.");
  await expect(p.locator("[data-status-pengadaan]")).toHaveText("Selesai");

  await page.getByRole("tab", { name: "Stok Habis Pakai" }).click();
  await expect(page.locator('[data-stok="Spidol papan"] [data-jumlah-stok]')).toHaveText("24 pcs");
});

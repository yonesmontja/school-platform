// Keuangan (Administrasi Tahap C): jenis biaya → tagihan massal → pembayaran + kuitansi → tunggakan → kas → portal orang tua.
const { test, expect, masukApi, API } = require("../bantu");

test.describe.configure({ mode: "serial", timeout: 180000 });

const zona = () => new Date(Date.now() + 9 * 3600000); // WIT
const bulan = (geser = 0) => { const d = zona(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + geser); return d.toISOString().slice(0, 7); };
const NAMA_BULAN = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
const judul = (kode) => `SPP Uji ${NAMA_BULAN[Number(kode.slice(5)) - 1]} ${kode.slice(0, 4)}`;

async function kirim(sesi, method, path, body) {
  const res = await fetch(`${API}/api${path}`, { method, headers: { Authorization: `Bearer ${sesi.access_token}`, Accept: "application/json", "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json();
  if (!res.ok) throw new Error(`${path}: ${res.status} ${JSON.stringify(data)}`);
  return data;
}

test("admin membuat jenis biaya dan tagihan bulanan untuk semua siswa", async ({ page, masuk }) => {
  await masuk("admin");
  await page.goto("/dashboard/administrasi/keuangan");
  await expect(page.getByText("Mulai di sini:")).toBeVisible();
  await page.getByRole("button", { name: "Atur jenis biaya" }).click();
  await page.getByRole("button", { name: "Jenis biaya baru" }).click();
  await page.locator("#jNama").fill("SPP Uji");
  await page.locator("#jNominal").fill("100000");
  await page.getByRole("button", { name: "Simpan", exact: true }).click();
  await expect(page.locator(".swal2-toast")).toContainText("dibuat");
  await expect(page.locator('[data-jenis-biaya="SPP Uji"]')).toContainText("Rp100.000");

  await page.getByRole("tab", { name: "Tagihan" }).click();
  await page.getByRole("button", { name: "Buat tagihan" }).click();
  await expect(page.locator("#tNominal")).toHaveValue("100000");
  await page.locator(".swal2-confirm").click();
  await expect(page.locator(".swal2-toast")).toContainText("tagihan dibuat");
  await expect(page.locator(`[data-baris-tagihan="Abner Kogoya · ${judul(bulan())}"]`)).toBeVisible();

  // Diulang: tidak ada tagihan ganda
  await page.getByRole("button", { name: "Buat tagihan" }).click();
  await page.locator(".swal2-confirm").click();
  await expect(page.locator(".swal2-toast")).toContainText("Tidak ada tagihan baru");
});

test("admin mencatat pembayaran sebagian dan mencetak kuitansi", async ({ page, masuk }) => {
  await masuk("admin");
  await page.goto("/dashboard/administrasi/keuangan?siswa=SIS-E1");
  const detail = page.locator('[data-detail-siswa="SIS-E1"]');
  await expect(detail).toContainText("Maria Kogoya (081200000001)");
  await detail.getByRole("checkbox", { name: `Bayar ${judul(bulan())}` }).check();
  await detail.getByLabel(`Jumlah ${judul(bulan())}`).fill("60000");
  await page.locator("#bayarMetode").selectOption("TRANSFER");
  await page.locator("#bayarPenyetor").fill("Maria Kogoya");
  await expect(detail.locator("[data-total-bayar]")).toHaveText("Rp60.000");
  await detail.getByRole("button", { name: "Catat pembayaran" }).click();
  await expect(page.locator(".swal2-popup")).toContainText("Pembayaran dicatat");

  const popup = page.waitForEvent("popup");
  await page.getByRole("button", { name: "Cetak kuitansi" }).click();
  const jendela = await popup;
  await expect(jendela.locator("body")).toContainText("KUITANSI PEMBAYARAN");
  await expect(jendela.locator("body")).toContainText("enam puluh ribu rupiah");
  await jendela.close();

  await expect(detail.locator('[data-kuitansi^="KW-"]')).toContainText("Rp60.000");
  await expect(detail.locator(`[data-tagihan="${judul(bulan())}"]`)).toContainText("Rp40.000");
});

test("tunggakan tampil dengan tombol Chat WA dan tercatat setelah diingatkan", async ({ page, masuk }) => {
  const sesi = await masukApi("admin");
  const pilihan = await kirim(sesi, "GET", "/administrasi/keuangan/pilihan");
  const spp = pilihan.data.jenis_biaya.find((j) => j.nama === "SPP Uji").id;
  await kirim(sesi, "POST", "/administrasi/keuangan/tagihan/buat", { id_jenis_biaya: spp, bulan: [bulan(-2)], sasaran: "SISWA", id_siswa: ["SIS-E1", "SIS-E2"] });

  await masuk("admin");
  await page.goto("/dashboard/administrasi/keuangan?tab=tunggakan");
  const abner = page.locator('[data-tunggakan="Abner Kogoya"]');
  await expect(abner).toContainText(judul(bulan(-2)));
  await expect(page.locator('[data-tunggakan="Debora Tabuni"]').getByRole("button", { name: "Chat WA" })).toBeDisabled();

  const popup = page.waitForEvent("popup");
  await abner.getByRole("button", { name: "Chat WA" }).click();
  const wa = await popup;
  await expect.poll(() => wa.url()).toContain("6281200000001");
  await wa.close();
  await expect(abner.locator("[data-diingatkan]")).toBeVisible();
});

test("kas: pengeluaran mengurangi saldo; pembayaran siswa ikut masuk", async ({ page, masuk }) => {
  await masuk("admin");
  await page.goto("/dashboard/administrasi/keuangan?tab=kas");
  await expect(page.locator("[data-saldo-akhir]")).toHaveText("Rp60.000");
  await page.getByRole("button", { name: "Catat pengeluaran" }).click();
  await page.locator("#kKategori").fill("ATK & bahan ajar");
  await page.locator("#kJumlah").fill("15000");
  await page.locator("#kKet").fill("Kertas ujian");
  await page.getByRole("button", { name: "Simpan", exact: true }).click();
  await expect(page.locator(".swal2-toast")).toContainText("Pengeluaran dicatat");
  await expect(page.locator("[data-saldo-akhir]")).toHaveText("Rp45.000");
  await expect(page.getByText("Kertas ujian")).toBeVisible();
});

test("admin mengisi tujuan pembayaran GoPay", async ({ page, masuk }) => {
  await masuk("admin");
  await page.goto("/dashboard/administrasi/keuangan?tab=pengaturan");
  await page.getByRole("button", { name: "Tujuan baru" }).click();
  await page.locator("#tbJenis").selectOption("EWALLET");
  await page.locator("#tbPenyedia").fill("GoPay");
  await page.locator("#tbNomor").fill("081299990000");
  await page.locator("#tbNama").fill("Bendahara Sekolah");
  await page.getByRole("button", { name: "Simpan", exact: true }).click();
  await expect(page.locator('[data-tujuan-bayar="GoPay"]')).toContainText("081299990000");
});

test("orang tua melihat tagihan anak di Portal", async ({ page, masuk }) => {
  await masuk("ortu");
  await page.goto("/dashboard/portal");
  const kartu = page.locator("[data-tagihan-portal]");
  await expect(kartu).toContainText("belum dibayar Rp140.000");
  await kartu.getByRole("button").first().click();
  await expect(kartu).toContainText(judul(bulan(-2)));
  await expect(kartu).toContainText("Pembayaran terakhir: Rp60.000");
  await expect(kartu.locator("[data-tujuan-portal]")).toContainText("GoPay 081299990000 a.n. Bendahara Sekolah");
});

// Kirim akses via WhatsApp (Admin): kata sandi salah ditolak, pesan berisi salam, username, kata sandi, dan alamat aplikasi,
// lalu tercatat di Riwayat Kirim Akses tanpa kata sandi. Jam efektif dibuka selalu di API tes (AKSES_WA_SELALU_BUKA).
const path = require("path");
const { test, expect, SANDI } = require("../bantu");

test("admin menyiapkan pesan akses WhatsApp dan riwayatnya tercatat", async ({ page, masuk }) => {
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await masuk("admin");
  await page.goto("/dashboard/pengguna");
  await page.getByPlaceholder(/Cari nama, username/).fill("guru2.e2e");
  await page.getByRole("button", { name: "Aksi untuk Ester Rumbiak" }).click();
  await page.getByRole("menuitem", { name: "Kirim akses via WhatsApp" }).click();

  const modal = page.locator("[data-kirim-akses]");
  await expect(modal.locator("[data-jam-kirim]")).toHaveAttribute("data-jam-kirim", "buka");
  await modal.getByLabel("Nomor WhatsApp").fill("0812 0000 0099");

  // Kata sandi salah → ditolak, belum tercatat
  await modal.getByLabel("Kata sandi akun").fill("bukan-sandinya");
  await page.getByRole("button", { name: "Siapkan pesan" }).click();
  await expect(page.locator(".swal2-popup")).toContainText("tidak cocok");
  await page.locator(".swal2-confirm").click();

  await modal.getByLabel("Kata sandi akun").fill(SANDI);
  await page.getByRole("button", { name: "Siapkan pesan" }).click();
  const teks = modal.locator("[data-teks-akses]");
  await expect(teks).toHaveValue(/Salam hormat, Bapak\/Ibu \*Ester Rumbiak\*/);
  await expect(teks).toHaveValue(/Username: \*guru2\.e2e\*/);
  await expect(teks).toHaveValue(new RegExp(`Kata sandi: \\*${SANDI.replace(/[-]/g, "\\-")}\\*`));
  await expect(teks).toHaveValue(/web\.saprapor\.com/);
  await expect(modal).toContainText("+6281200000099");
  await page.locator(".modal-content").screenshot({ path: path.join(__dirname, "../hasil/akses-wa-pesan.png") });

  await page.locator("[data-salin-akses]").click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain("guru2.e2e");
  await page.getByRole("button", { name: "Selesai" }).click();

  // Riwayat: tercatat, tindakan Disalin, tanpa kata sandi
  const riwayat = page.locator("[data-riwayat-akses]");
  const baris = riwayat.locator("tbody tr", { hasText: "Ester Rumbiak" }).first();
  await expect(baris).toContainText("Disalin");
  await expect(baris).toContainText("Sandi dicocokkan");
  await expect(baris).toContainText("+6281200000099");
  await expect(riwayat).not.toContainText(SANDI);
  await riwayat.screenshot({ path: path.join(__dirname, "../hasil/akses-wa-riwayat.png") });
});

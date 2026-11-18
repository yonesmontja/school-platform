// Administrasi Sekolah Tahap A: kepala sekolah menunjuk operator dan memilih submodulnya; operator hanya melihat menu Administrasi.
const { test, expect } = require("../bantu");

test.describe.configure({ mode: "serial" });

test("akun operator tanpa penunjukan tidak bisa membuka menu pembelajaran", async ({ page, masuk }) => {
  await masuk("operator");
  await page.goto("/dashboard");
  // Halaman awal operator = Administrasi; tanpa submodul tampil pesan dari server
  await expect(page).toHaveURL(/\/dashboard\/administrasi$/);
  await expect(page.getByText("belum diberikan kepada akun Anda")).toBeVisible();
  await page.goto("/dashboard/jadwal");
  await expect(page).toHaveURL(/\/dashboard\/administrasi$/);
  await expect(page.locator(".app-sidebar")).not.toContainText("Jadwal");
});

test("kepsek menunjuk operator; operator melihat submodul yang dicentang saja", async ({ page, masuk }) => {
  await masuk("kepsek");
  await page.goto("/dashboard/administrasi");
  await expect(page.locator("[data-submodul]")).toHaveCount(4);
  await page.getByRole("button", { name: "Tunjuk operator" }).click();
  await page.locator("#opAkun").selectOption({ label: "Maria Yeimo · Operator Sekolah · operator.e2e" });
  await page.getByLabel(/^Surat & Arsip/).check();
  await page.getByLabel(/^Inventaris/).check();
  await page.locator("#opCatatan").fill("Staf tata usaha");
  await page.getByRole("button", { name: "Tunjuk", exact: true }).click();
  await expect(page.locator(".swal2-toast")).toContainText("ditunjuk sebagai operator");
  const baris = page.locator('[data-operator="operator.e2e"]');
  await expect(baris).toContainText("Surat & Arsip");
  await expect(baris).toContainText("Inventaris");

  // Ubah submodul lewat menu ⋮: tambah SPMB
  await page.getByRole("button", { name: "Aksi untuk Maria Yeimo" }).click();
  await page.getByRole("menuitem", { name: "Ubah submodul" }).click();
  await page.getByLabel(/^SPMB/).check();
  await page.getByRole("button", { name: "Simpan", exact: true }).click();
  await expect(baris).toContainText("SPMB");

  await masuk("operator");
  await page.goto("/dashboard/administrasi");
  await expect(page.locator("[data-penunjukan]")).toContainText("SPMB, Surat & Arsip, Inventaris");
  await expect(page.locator("[data-submodul]")).toHaveCount(3);
  await expect(page.locator('[data-submodul="KEUANGAN"]')).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Tunjuk operator" })).toHaveCount(0);
  await expect(page.locator(".app-sidebar")).toContainText("Administrasi");
});

test("admin melihat daftar operator tanpa bisa menunjuk; kepsek mencabut", async ({ page, masuk }) => {
  await masuk("admin");
  await page.goto("/dashboard/administrasi");
  await expect(page.locator('[data-operator="operator.e2e"]')).toBeVisible();
  await expect(page.getByRole("button", { name: "Tunjuk operator" })).toHaveCount(0);
  await expect(page.getByText("Hanya kepala sekolah yang dapat menunjuk")).toBeVisible();

  await masuk("kepsek");
  await page.goto("/dashboard/administrasi");
  await page.getByRole("button", { name: "Aksi untuk Maria Yeimo" }).click();
  await page.getByRole("menuitem", { name: "Cabut penunjukan" }).click();
  await page.getByRole("button", { name: "Cabut", exact: true }).click();
  await expect(page.getByText("Belum ada operator.")).toBeVisible();
});

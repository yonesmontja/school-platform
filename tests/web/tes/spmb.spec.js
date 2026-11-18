// SPMB (Administrasi Tahap B): gelombang → formulir publik → verifikasi → pengumuman → daftar ulang → menjadi siswa.
const { test, expect, api, API } = require("../bantu");

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64");
const hari = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const NAMA = `Yohana Uji ${Date.now() % 100000}`;
const akses = {};

test.describe.configure({ mode: "serial" });

/** Unggah berkas pendaftar langsung ke API publik (Chromium tidak meneruskan isi berkas ke permintaan yang disadap tes). */
async function unggahPublik(jenis) {
  const form = new FormData();
  form.append("nomor_daftar", akses.nomor_daftar); form.append("kode_akses", akses.kode_akses); form.append("jenis", jenis);
  form.append("berkas", new Blob([PNG], { type: "image/png" }), `${jenis.toLowerCase()}.png`);
  const res = await fetch(`${API}/api/spmb/berkas`, { method: "POST", headers: { Accept: "application/json" }, body: form });
  expect(res.status, await res.clone().text()).toBe(201);
}

test("admin membuka gelombang pendaftaran", async ({ page, masuk }) => {
  await masuk("admin");
  await page.goto("/dashboard/administrasi/spmb");
  await expect(page.getByText("Belum ada gelombang pendaftaran.")).toBeVisible();
  await page.getByRole("button", { name: "Gelombang baru" }).click();
  await page.locator("#gNama").fill("Gelombang Uji");
  await page.locator("#gTahun").fill("2030/2031");
  await page.locator("#gBuka").fill(hari(-2));
  await page.locator("#gTutup").fill(hari(7));
  await page.locator("#gBFOTO").uncheck();
  await page.getByRole("button", { name: "Simpan", exact: true }).click();
  await expect(page.locator(".swal2-toast")).toContainText("dibuat");
  await expect(page.getByText("Formulir dibuka")).toBeVisible();
});

test("calon murid mendaftar dari halaman publik dan mengunggah berkas", async ({ page }) => {
  await page.goto("/spmb");
  await expect(page.getByText("Gelombang Uji · Tahun ajaran 2030/2031")).toBeVisible();
  await page.getByRole("button", { name: "Kirim pendaftaran" }).click();
  await expect(page.locator("#nama_siswa.is-invalid")).toBeVisible();

  await page.locator("#nama_siswa").fill(NAMA);
  await page.locator("#jenis_kelamin").selectOption("P");
  await page.locator("#tempat_lahir").fill("Nabire");
  await page.locator("#tgl_lahir").fill("2020-03-04");
  await page.locator("#alamat").fill("Jl. Merdeka 1, Nabire");
  await page.locator("#nama_ibu").fill("Maria Uji");
  await page.locator("#no_wa").fill("081234560000");
  await page.getByRole("button", { name: "Kirim pendaftaran" }).click();
  await expect(page.locator("[data-spmb-terdaftar]")).toBeVisible();
  akses.nomor_daftar = (await page.locator("[data-nomor]").textContent()).trim();
  akses.kode_akses = (await page.locator("[data-kode]").textContent()).trim();
  expect(akses.nomor_daftar).toMatch(/^SPMB-2030-\d{4}$/);

  await unggahPublik("AKTA");
  await unggahPublik("KK");
  await page.getByRole("button", { name: "Lanjut unggah berkas" }).click();
  await expect(page.locator("[data-status-label]")).toHaveText("Menunggu verifikasi");
  await expect(page.locator('[data-berkas="AKTA"]')).toContainText("menunggu diperiksa");
  await expect(page.locator('[data-berkas="KK"]')).toContainText("menunggu diperiksa");
});

test("admin memverifikasi, menerima, dan mengumumkan hasil", async ({ page, masuk }) => {
  await masuk("admin");
  await page.goto("/dashboard/administrasi/spmb");
  await page.locator(`[data-pendaftar="${akses.nomor_daftar}"]`).click();
  const detail = page.locator(`[data-detail="${akses.nomor_daftar}"]`);
  await detail.getByLabel("Status Akta kelahiran").selectOption("SAH");
  await detail.getByLabel("Status Kartu Keluarga").selectOption("SAH");
  await detail.getByRole("button", { name: "Tandai terverifikasi" }).click();
  await expect(detail.locator("[data-status-detail]")).toHaveText("Terverifikasi");

  await detail.getByRole("button", { name: "Diterima", exact: true }).click();
  await page.locator("#hCatatan").fill("Daftar ulang membawa berkas asli.");
  await page.getByRole("button", { name: "Simpan", exact: true }).click();
  await expect(detail.locator("[data-status-detail]")).toHaveText("Diterima");

  await page.getByRole("button", { name: "Umumkan hasil" }).click();
  await page.getByRole("button", { name: "Umumkan", exact: true }).click();
  await expect(page.locator("[data-diumumkan]")).toBeVisible();
});

test("pendaftar melihat hasil dan mengonfirmasi daftar ulang", async ({ page }) => {
  await page.goto("/spmb?cek=1");
  await page.locator("#cekNomor").fill(akses.nomor_daftar);
  await page.locator("#cekKode").fill(akses.kode_akses.toLowerCase());
  await page.getByRole("button", { name: "Lihat status" }).click();
  await expect(page.locator("[data-status-label]")).toHaveText("Diterima");
  await expect(page.getByText("Daftar ulang membawa berkas asli.")).toBeVisible();
  await page.getByRole("button", { name: "Konfirmasi daftar ulang" }).click();
  await expect(page.locator("[data-status-label]")).toHaveText("Sudah daftar ulang");
});

test("admin menyelesaikan daftar ulang: pendaftar menjadi siswa", async ({ page, masuk }) => {
  const sesi = await masuk("admin");
  await page.goto("/dashboard/administrasi/spmb?status=DAFTAR_ULANG");
  await page.locator(`[data-pendaftar="${akses.nomor_daftar}"]`).click();
  const detail = page.locator(`[data-detail="${akses.nomor_daftar}"]`);
  await detail.getByRole("button", { name: "Selesaikan daftar ulang" }).click();
  await page.locator("#sKelas").selectOption({ index: 1 });
  await page.getByRole("button", { name: "Jadikan siswa" }).click();
  await expect(page.locator(".swal2-toast")).toContainText("kini tercatat sebagai siswa");
  await expect(detail.locator("[data-status-detail]")).toHaveText("Menjadi siswa");

  const siswa = await api(sesi, `/students?search=${encodeURIComponent(NAMA)}`);
  expect(siswa.data.map((s) => s.nama_siswa)).toContain(NAMA);
});

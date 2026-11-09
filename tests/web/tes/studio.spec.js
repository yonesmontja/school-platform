// Studio Rakit Video (D1): admin menunjuk satu pembuat video; pembuat merakit adegan (tambah teks, ubah isi,
// geser di kanvas, undo), mengganti rasio, lalu mengirim naskah ke antrean render.
const { test, expect, api } = require("../bantu");

test.describe.configure({ mode: "serial" });

test("admin menunjuk pembuat video; pembuat merakit adegan dan mengirim ke antrean render", async ({ page, masuk }) => {
  const admin = await masuk("admin");
  await page.goto("/dashboard/studio-video");
  await expect(page.getByText("hanya dipakai oleh pembuat video yang ditunjuk admin")).toBeVisible();
  const pembuat = page.getByLabel("Pembuat video motion graphic (1 pengguna)");
  await pembuat.selectOption({ label: "Yakobus Wenda (guru)" });
  await expect(page.locator(".swal2-toast")).toContainText("Pengaturan Studio disimpan");

  await masuk("guru");
  await page.goto("/dashboard/studio-video");
  await expect(page.getByLabel("Kanvas adegan")).toBeVisible();
  await expect(page.getByRole("button", { name: "Adegan 1" })).toBeVisible();
  const kotak = page.locator(".studio-kotak");
  const awal = await kotak.count();

  // Tambah teks, ubah isinya, geser di kanvas, lalu batalkan penggeseran
  await page.getByRole("toolbar", { name: "Tambah elemen" }).getByRole("button", { name: /Teks/ }).click();
  await expect(kotak).toHaveCount(awal + 1);
  await page.getByLabel("Isi teks").fill("Ayo daftar sekarang");
  const dipilih = page.locator(".studio-kotak.dipilih");
  const b = await dipilih.boundingBox();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2 + 40, b.y + b.height / 2 + 60, { steps: 5 });
  await page.mouse.up();
  const sesudah = await dipilih.boundingBox();
  expect(sesudah.y).toBeGreaterThan(b.y + 30);
  await page.getByRole("button", { name: "Batalkan" }).click();
  await expect.poll(async () => (await page.locator(".studio-kotak.dipilih").boundingBox())?.y ?? b.y).toBeLessThan(b.y + 5);

  // Adegan baru & rasio
  await page.getByRole("button", { name: "Tambah adegan" }).click();
  await expect(page.getByRole("button", { name: "Adegan 4" })).toBeVisible();
  await page.getByLabel("Narasi (dibacakan suara AI & jadi subtitle)").fill("Terima kasih sudah menonton.");
  await page.getByRole("group", { name: "Rasio aspek" }).getByRole("button", { name: "16:9" }).click();

  await page.getByRole("button", { name: /Render video/ }).click();
  const modal = page.getByRole("dialog", { name: "Render video" });
  await modal.getByLabel("Judul di pustaka video").fill("Promosi Studio E2E");
  await modal.getByRole("button", { name: /Kirim ke antrean/ }).click();
  await expect(page.locator(".swal2-popup")).toContainText("antrean");

  const daftar = await api(admin, "/video-belajar");
  const v = daftar.data.find((x) => x.judul === "Promosi Studio E2E");
  expect(v.templat).toBe("Rakitan");
  expect(v.rasio).toBe("16:9");
  expect(v.props.adegan).toHaveLength(4);
  expect(v.props.adegan[0].elemen.some((e) => e.isi === "Ayo daftar sekarang")).toBeTruthy();
});

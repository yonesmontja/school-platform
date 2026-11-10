// Studio Rakit Video (D1): admin menunjuk satu pembuat video; pembuat merakit adegan (tambah teks, ubah isi,
// geser di kanvas, undo), mengganti rasio, lalu mengirim naskah ke antrean render.
const { test, expect, api } = require("../bantu");

test.describe.configure({ mode: "serial" });

test("admin menunjuk pembuat video; pembuat merakit adegan dan mengirim ke antrean render", async ({ page, masuk }) => {
  test.setTimeout(240_000); // alur panjang: menunjuk, merakit, timeline, templat, render
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

  // Timeline: elemen adegan tampil sebagai batang; klik penggaris memindahkan kepala waktu
  await page.getByRole("button", { name: "Adegan 1" }).click();
  const timeline = page.locator(".studio-timeline");
  await expect(timeline.locator(".studio-tl-batang")).toHaveCount(awal + 1);
  const penggaris = page.getByRole("slider", { name: "Waktu dalam adegan" });
  const pb = await penggaris.boundingBox();
  await page.mouse.click(pb.x + pb.width * 0.25, pb.y + pb.height / 2);
  await expect(timeline.locator(".studio-tl-kepala").first()).toBeVisible();
  await timeline.getByRole("button", { name: "Tampilan akhir" }).click();

  // Templat sekolah: simpan naskah ini, lalu muncul di daftar
  await page.getByRole("button", { name: /Templat/ }).click();
  const mt = page.getByRole("dialog", { name: "Templat video" });
  await mt.getByLabel("Judul templat").fill("Templat PPDB E2E");
  await mt.getByRole("button", { name: /Simpan sebagai templat/ }).click();
  await expect(mt).toContainText("Templat PPDB E2E");
  await mt.getByRole("button", { name: "Tutup" }).click();

  await page.getByRole("button", { name: /Render video/ }).click();
  const modal = page.getByRole("dialog", { name: "Render video" });
  await modal.getByLabel("Tujuan video").selectOption("PROMOSI");
  await expect(modal).toContainText("tidak tampil di Portal Siswa");
  await modal.getByLabel("Judul di pustaka video").fill("Promosi Studio E2E");
  await modal.getByRole("button", { name: /Kirim ke antrean/ }).click();
  await expect(page.locator(".swal2-popup")).toContainText("antrean");

  const daftar = await api(admin, "/video-belajar");
  const v = daftar.data.find((x) => x.judul === "Promosi Studio E2E");
  expect(v.templat).toBe("Rakitan");
  expect(v.rasio).toBe("16:9");
  expect(v.tujuan).toBe("PROMOSI");
  expect(v.props.adegan).toHaveLength(4);
  expect(v.props.adegan[0].elemen.some((e) => e.isi === "Ayo daftar sekarang")).toBeTruthy();
});

test("papan cerita AI mengisi naskah, lalu dirender ke dua rasio sekaligus", async ({ page, masuk }) => {
  test.setTimeout(240_000);
  const admin = await masuk("admin");
  await masuk("guru");
  // Respons AI ditiru (database tes tanpa API key); penyusunan tata letak dari papan cerita diuji di backend
  const naskah = { rasio: "9:16", judul: "PPDB E2E", subtitle: true, musik: null,
    merek: { logo: null, posisi_logo: "kanan-atas", huruf: "Nunito", warna: ["#2563eb"] },
    adegan: ["Ayo Sekolah", "Kegiatan Seru", "Daftar Sekarang"].map((j, i) => ({
      narasi: `Narasi adegan ${i + 1}.`, durasi: 4, transisi: "pudar", latar: { tipe: "gradien", warna: "#2563eb", warna2: "#93c5fd", gambar: null, redup: 0 },
      elemen: [{ id: `x${i}`, tipe: "teks", isi: j, x: 50, y: 50, w: 80, h: 12, rot: 0, gerak: "tidak", keluar: { preset: "tidak", pada: null },
        gaya: { ukuran: 70, warna: "#ffffff", tebal: true, rata: "tengah", sudut: 0, buram: 1 }, masuk: { preset: "pop", mulai: 0.2, durasi: 0.6 } }],
    })) };
  await page.route(/\/api\/video-belajar\/papan-cerita/, (route) => route.fulfill({ json: { success: true, message: "Papan cerita 3 adegan tersusun.", naskah, rujukan: [] } }));

  await page.goto("/dashboard/studio-video");
  await page.getByRole("button", { name: /Papan cerita AI/ }).click();
  const pc = page.getByRole("dialog", { name: "Papan cerita AI" });
  await pc.getByLabel("Tujuan video").selectOption("PROMOSI");
  await pc.getByLabel("Video seperti apa yang Anda inginkan?").fill("Video promosi PPDB sekolah ramah anak");
  await pc.getByRole("button", { name: /Susun papan cerita/ }).click();
  await expect(page.locator(".swal2-popup")).toContainText("Papan cerita siap");
  await page.locator(".swal2-confirm").click();
  await expect(page.getByRole("button", { name: /^Adegan \d/ })).toHaveCount(3);
  await expect(page.getByRole("button", { name: "Adegan 3" })).toContainText("Narasi adegan 3");

  await page.getByRole("button", { name: /Render video/ }).click();
  const modal = page.getByRole("dialog", { name: "Render video" });
  await expect(modal.getByLabel("Tujuan video")).toHaveValue("PROMOSI");
  await modal.getByLabel("Judul di pustaka video").fill("PPDB Dua Rasio E2E");
  await modal.getByLabel("16:9").check();
  await modal.getByRole("button", { name: /Kirim ke antrean/ }).click();
  await expect(page.locator(".swal2-popup")).toContainText("2 video");

  const daftar = (await api(admin, "/video-belajar")).data.filter((x) => x.judul.startsWith("PPDB Dua Rasio E2E"));
  expect(daftar.map((v) => v.rasio).sort()).toEqual(["16:9", "9:16"]);
});

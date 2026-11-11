// Studio Rakit Video (D1): admin menunjuk satu pembuat video; pembuat merakit adegan (tambah teks, ubah isi,
// geser di kanvas, undo), mengganti rasio, lalu mengirim naskah ke antrean render.
const { test, expect, api, unggahApi } = require("../bantu");
const path = require("node:path");

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
  const guru = await masuk("guru");
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

  // E1: terapkan gaya visual Elegan ke seluruh naskah (lewat server), lalu periksa kamera & hiasan adegan
  await page.getByRole("button", { name: /Gaya visual/ }).click();
  const gy = page.getByRole("dialog", { name: "Gaya visual" });
  await gy.getByRole("radio", { name: /Elegan/ }).click();
  await gy.getByRole("button", { name: /Terapkan/ }).click();
  await expect(page.locator(".swal2-popup")).toContainText("Gaya Elegan diterapkan ke 3 adegan");
  await expect(gy).toBeHidden();
  await expect(page.getByLabel("Gerak kamera")).toHaveValue("zoom-masuk");
  await expect(page.getByLabel("Hiasan bergerak")).toHaveValue("gumpalan");
  await expect(page.getByRole("button", { name: /^Adegan \d/ })).toHaveCount(3);
  await expect(page.getByRole("button", { name: "Adegan 3" })).toContainText("Narasi adegan 3");

  // E2: pustaka aset — cari dengan kata Indonesia, tambah emoji 3D dan ikon, lalu ganti ikonnya
  await page.getByRole("button", { name: /Pustaka aset/ }).click();
  const pk = page.getByRole("dialog", { name: "Pustaka aset" });
  await pk.getByLabel("Cari aset").fill("guru");
  await pk.getByRole("button", { name: "Emoji teacher" }).click();
  await expect(pk).toBeHidden();
  await expect(page.getByLabel("Tampilan emoji")).toHaveValue("3d");
  await page.getByRole("button", { name: /Pustaka aset/ }).click();
  await pk.getByRole("tab", { name: /Ikon/ }).click();
  await pk.getByLabel("Cari aset").fill("roket");
  await pk.getByRole("button", { name: "Ikon rocket", exact: true }).click();
  await expect(page.getByRole("button", { name: "Ganti ikon" })).toBeVisible();
  await page.getByRole("button", { name: "Ganti ikon" }).click();
  const gp = page.getByRole("dialog", { name: "Ganti dari pustaka" });
  await gp.getByLabel("Cari aset").fill("piala");
  await gp.getByRole("button", { name: "Ikon trophy", exact: true }).click();
  await expect(gp).toBeHidden();
  await expect(page.locator(".studio-tl-label").filter({ hasText: "trophy" })).toHaveCount(1);

  // E3: unggah SVG & animasi Lottie milik sekolah lewat tab Unggahan; tab Canva memberi tahu bila belum diatur admin
  await page.getByRole("button", { name: /Pustaka aset/ }).click();
  await pk.getByRole("tab", { name: /Unggahan sekolah/ }).click();
  let pilihBerkas = page.waitForEvent("filechooser");
  await pk.getByRole("button", { name: /Unggah gambar \/ SVG/ }).click();
  await (await pilihBerkas).setFiles({ name: "logo-uji.svg", mimeType: "image/svg+xml", buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" fill="#22c55e"/></svg>') });
  await expect(pk).toBeHidden();
  await expect(page.locator(".studio-tl-label").filter({ hasText: "Gambar" })).not.toHaveCount(0);
  const lottieUji = { v: "5.7.0", fr: 30, ip: 0, op: 30, w: 100, h: 100, assets: [], layers: [{ ty: 4, ip: 0, op: 30, st: 0, ks: { o: { a: 0, k: 100 }, r: { a: 0, k: 0 }, p: { a: 0, k: [50, 50, 0] }, a: { a: 0, k: [0, 0, 0] }, s: { a: 0, k: [100, 100, 100] } },
    shapes: [{ ty: "gr", it: [{ ty: "rc", d: 1, s: { a: 0, k: [60, 60] }, p: { a: 0, k: [0, 0] }, r: { a: 0, k: 8 } }, { ty: "fl", c: { a: 0, k: [1, 0.7, 0.1, 1] }, o: { a: 0, k: 100 } }, { ty: "tr", p: { a: 0, k: [0, 0] }, a: { a: 0, k: [0, 0] }, s: { a: 0, k: [100, 100] }, r: { a: 0, k: 0 }, o: { a: 0, k: 100 } }] }] }] };
  await page.getByRole("button", { name: /Pustaka aset/ }).click();
  await pk.getByRole("tab", { name: /Unggahan sekolah/ }).click();
  await expect(pk.getByRole("button", { name: /SVG logo-uji\.svg/ })).toBeVisible();
  pilihBerkas = page.waitForEvent("filechooser");
  await pk.getByRole("button", { name: /Unggah animasi Lottie/ }).click();
  await (await pilihBerkas).setFiles({ name: "animasi-uji.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(lottieUji)) });
  await expect(pk).toBeHidden();
  await expect(page.getByText("Animasi Lottie", { exact: true }).first()).toBeVisible();
  await expect(page.getByLabel("Putar berulang (mati = berhenti di akhir)")).toBeChecked();
  await expect(page.locator("canvas").first()).toBeVisible(); // lottie-web menggambar di kanvas pratinjau
  // E4: klip video (WebM; Chromium Playwright tanpa H.264) diunggah lewat API tes (isi berkas biner tidak ikut pada
  // permintaan yang disadap, lihat unggahApi), lalu dipilih dari Unggahan sekolah menjadi elemen video bisu & berulang
  await unggahApi(guru, "/video-belajar/aset", { foto_siswa: "0" }, { nama: "video", path: path.join(__dirname, "..", "data", "klip.webm"), tipe: "video/webm" });
  await page.getByRole("button", { name: /Pustaka aset/ }).click();
  await pk.getByRole("tab", { name: /Unggahan sekolah/ }).click();
  await expect(pk.getByRole("button", { name: /Unggah video/ })).toBeVisible();
  await pk.getByRole("button", { name: /^Video klip\.webm/ }).click();
  await expect(pk).toBeHidden();
  await expect(page.getByText("Klip video (2 detik)")).toBeVisible();
  await expect(page.getByLabel("Bisukan suara klip")).toBeChecked();
  await expect(page.locator(".studio-tl-label").filter({ hasText: "Video" })).toHaveCount(1);
  await expect(page.locator(".studio-pratinjau video, video").first()).toBeAttached();
  await page.getByRole("button", { name: /Pustaka aset/ }).click();
  await pk.getByRole("tab", { name: /Canva/ }).click();
  await expect(pk).toContainText("Integrasi Canva belum diatur");
  await pk.getByRole("button", { name: "Tutup", exact: true }).first().click();

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

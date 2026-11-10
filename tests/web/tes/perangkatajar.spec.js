// Perangkat ajar (Fase 17 Tahap A): guru mengisi CP, menyusun ATP (TP lama + TP baru), mengajukan;
// kepala sekolah menyetujui dari Perlu Tindakan dan TP baru masuk ke Referensi Penilaian. Draf AI diuji di backend.
const { test, expect, pilih } = require("../bantu");

test.describe.configure({ mode: "serial" });

test("guru mengisi CP lalu menyusun dan mengajukan ATP", async ({ page, masuk }) => {
  await masuk("guru");
  await page.goto("/dashboard/perangkat-ajar");
  await page.getByRole("button", { name: /Capaian Pembelajaran/ }).click();
  await page.getByRole("button", { name: "Tambah elemen" }).click();
  const cp = page.getByRole("dialog", { name: "Elemen CP baru" });
  await pilih(cp.getByLabel("Fase"), "Fase B");
  await cp.getByLabel("Elemen").fill("Bilangan");
  await cp.getByLabel("Capaian pembelajaran").fill("Peserta didik dapat membandingkan dan mengurutkan pecahan sederhana.");
  await cp.getByRole("button", { name: "Simpan" }).click();
  await expect(page.locator(".kartu-cp", { hasText: "Bilangan" })).toBeVisible();

  await page.getByRole("button", { name: /^\W*ATP$/ }).click();
  await page.getByRole("button", { name: "ATP baru" }).click();
  const baru = page.getByRole("dialog", { name: "ATP baru" });
  await pilih(baru.getByLabel("Kelas"), "4A");
  await baru.getByLabel("JP per minggu").fill("5");
  await baru.getByRole("button", { name: "Buat ATP" }).click();
  await expect(page.locator(".editor-atp")).toContainText("Fase B");

  // Baris 1: TP yang sudah ada; baris 2: TP baru
  // Klik bisa kalah cepat dengan pemuatan data editor (baris tertimpa); ulangi sampai baris 1 benar-benar ada
  await expect(async () => {
    await page.getByRole("button", { name: "tambah baris" }).click();
    await expect(page.getByLabel("Elemen CP baris 1")).toBeVisible({ timeout: 2000 });
  }).toPass();
  await pilih(page.getByLabel("Elemen CP baris 1"), "Bilangan");
  await pilih(page.getByLabel("Materi baris 1"), "Pecahan Sederhana");
  await pilih(page.getByLabel("Pilih TP yang ada baris 1"), "Membandingkan dua pecahan");
  await page.getByLabel("JP baris 1").fill("6");
  await page.getByRole("button", { name: "Tambah baris" }).click();
  await pilih(page.getByLabel("Materi baris 2"), "Pecahan Sederhana");
  await page.getByLabel("TP baru baris 2").fill("Mengurutkan tiga pecahan berpenyebut sama");
  await page.getByLabel("JP baris 2").fill("4");
  await expect(page.locator(".editor-atp")).toContainText("Total 10 JP");
  await page.locator(".editor-atp").getByRole("button", { name: /Simpan$/ }).first().click();
  await expect(page.locator(".swal2-toast")).toContainText("ATP disimpan");

  await page.getByRole("button", { name: "Ajukan" }).click();
  await page.locator(".swal2-confirm").click();
  await expect(page.locator(".editor-atp")).toContainText("Menunggu persetujuan");
});

test("kepala sekolah menyetujui ATP dan TP baru masuk ke referensi", async ({ page, masuk }) => {
  await masuk("kepsek");
  await page.goto("/dashboard/notifikasi");
  await page.locator(".notif-kartu", { hasText: "ATP menunggu persetujuan" }).getByRole("link", { name: /Buka/ }).click();
  await expect(page).toHaveURL(/perangkat-ajar\?status=DIAJUKAN/);
  // Menu ⋮ di kartu: aksi cepat tanpa membuka editor; Esc menutup tanpa membuka kartu
  await page.locator(".kartu-atp", { hasText: "ATP Matematika" }).getByRole("button", { name: /^Aksi untuk/ }).click();
  await expect(page.getByRole("menuitem", { name: "Buka" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator(".menu-aksi")).toHaveCount(0);
  await page.locator(".kartu-atp", { hasText: "ATP Matematika" }).click();
  await page.getByRole("button", { name: "Setujui" }).click();
  await page.locator(".swal2-confirm").click();
  await expect(page.locator(".editor-atp")).toContainText("Disetujui");

  // TP baru kini menjadi TP yang ada (tidak lagi bertanda usulan)
  await expect(page.getByLabel("TP baru baris 2")).toHaveCount(0);
  await expect(page.locator(".baris-atp").nth(1)).toContainText("Mengurutkan tiga pecahan berpenyebut sama");
});

test("guru membuat modul ajar RPM dari ATP, kepala sekolah menyetujui", async ({ page, masuk }) => {
  test.setTimeout(150_000);
  await masuk("guru");
  await page.goto("/dashboard/perangkat-ajar");
  await page.locator(".kartu-atp", { hasText: "ATP Matematika" }).click();
  await page.getByRole("button", { name: "Buat modul ajar" }).click();
  const baru = page.getByRole("dialog", { name: "Modul ajar baru" });
  await baru.getByLabel(/Membandingkan dua pecahan/).check();
  await baru.getByLabel("Jumlah pertemuan").fill("2");
  await baru.getByLabel("JP per pertemuan").fill("2");
  await baru.getByRole("button", { name: "Buat modul" }).click();

  const editor = page.locator(".editor-modul");
  await expect(editor).toContainText("Membandingkan dua pecahan");
  await expect(editor.locator(".pertemuan-modul")).toHaveCount(2);
  // Belum lengkap: belum bisa diajukan
  await editor.getByRole("button", { name: "Ajukan" }).click();
  await page.locator(".swal2-confirm").click();
  await expect(page.locator(".swal2-popup")).toContainText("Lengkapi tujuan");
  await page.locator(".swal2-confirm").click();

  await editor.getByLabel("Tujuan pembelajaran").fill("Siswa membandingkan dua pecahan dengan benda nyata.");
  await editor.locator(".pertemuan-modul").first().getByLabel("Inti: memahami").fill("Siswa melipat kertas menjadi 2 dan 4 bagian.");
  await editor.getByRole("button", { name: /Simpan$/ }).first().click();
  await expect(page.locator(".swal2-toast")).toContainText("Modul disimpan");
  await editor.getByRole("button", { name: "Ajukan" }).click();
  await page.locator(".swal2-confirm").click();
  await expect(editor).toContainText("Menunggu persetujuan");

  await masuk("kepsek");
  await page.goto("/dashboard/notifikasi");
  await page.locator(".notif-kartu", { hasText: "modul ajar menunggu persetujuan" }).getByRole("link", { name: /Buka/ }).click();
  await page.locator(".kartu-modul").first().click();
  await page.locator(".editor-modul").getByRole("button", { name: "Setujui" }).click();
  await page.locator(".swal2-confirm").click();
  await expect(page.locator(".editor-modul")).toContainText("Disetujui");
});

test("sesi jadwal menautkan pertemuan modul; rencananya tampil di formulir jurnal", async ({ page, masuk }) => {
  test.setTimeout(150_000);
  const { selectBerlabel } = require("../bantu");
  await masuk("guru");
  await page.goto("/dashboard/jadwal");
  await page.getByRole("button", { name: "Buat" }).first().click();
  const form = page.locator(".jadwal-form");
  await pilih(selectBerlabel(form, "Mata Pelajaran"), "Matematika");
  await pilih(selectBerlabel(form, "Kelas"), "4A");
  await pilih(form.getByLabel("Modul ajar"), "Membandingkan dua pecahan");
  await expect(form.getByLabel("Pertemuan ke")).toHaveValue("1");
  // Sesi hari ini (tombol Buat memakai tanggal awal minggu yang tampil di kalender)
  const hariIni = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Jayapura" });
  await form.locator('xpath=//label[contains(normalize-space(.), "Tanggal")]/following::input[1]').fill(hariIni);
  await form.locator('xpath=//label[normalize-space(.)="Mulai"]/following::input[1]').fill("13:00");
  await form.locator('xpath=//label[normalize-space(.)="Selesai"]/following::input[1]').fill("14:00");
  await form.locator("#wa_panel").uncheck();
  await form.getByRole("button", { name: /^\W*Simpan$/ }).click();
  await expect(page.locator(".swal2-popup")).toContainText(/disimpan/i);


  // Jurnal: rencana hari ini untuk kelas 4A
  await page.goto("/dashboard/jurnal");
  await pilih(page.locator('xpath=//label[contains(normalize-space(.), "Kelas *")]/following::select[1]'), "4A");
  await page.getByRole("button", { name: /Rencana pembelajaran hari ini/ }).click();
  await expect(page.locator(".rencana-hari")).toContainText("Membandingkan dua pecahan");
  await expect(page.locator(".rencana-hari")).toContainText("pertemuan 1 dari 2");
  await expect(page.locator(".rencana-hari")).toContainText("melipat kertas");
});

test("guru mengunggah video belajar, kepala sekolah menyetujui, siswa menontonnya di portal", async ({ page, masuk }) => {
  test.setTimeout(150_000);
  const path = require("path");
  const { unggahApi } = require("../bantu");
  const sesi = await masuk("guru");
  // Formulir unggah: berkas terbaca (durasi & sampul di browser)
  await page.goto("/dashboard/video-belajar");
  await page.getByRole("button", { name: "Unggah video" }).click();
  const form = page.getByRole("dialog", { name: "Unggah video belajar" });
  await form.locator("#vidBerkas").setInputFiles(path.join(__dirname, "..", "data", "pecahan.mp4"));
  // Sampul & durasi dibaca browser (Chromium uji tidak punya codec H.264, jadi cukup ukuran berkas)
  await expect(form).toContainText("0.8 MB");
  await expect(form.getByLabel("Judul")).toHaveValue("pecahan");
  await form.getByRole("button", { name: "Batal" }).click();
  // Unggah video hasil Remotion lewat API tes (lihat unggahApi)
  await unggahApi(sesi, "/video-belajar", { judul: "Pecahan seperempat (kue)", id_kelas: "KLS-E4A", sumber: "REMOTION", komposisi: "PecahanKue", durasi_detik: "11" },
    { nama: "video", path: path.join(__dirname, "..", "data", "pecahan.mp4"), tipe: "video/mp4" });
  await page.reload();
  await page.locator(".kartu-pustaka", { hasText: "Pecahan seperempat" }).click();
  const detail = page.getByRole("dialog", { name: /Video Pecahan seperempat/ });
  await expect(detail.locator("video")).toBeVisible();
  await detail.getByRole("button", { name: "Ajukan" }).click();
  await page.locator(".swal2-confirm").click();
  await expect(detail).toContainText("Menunggu persetujuan");

  await masuk("kepsek");
  await page.goto("/dashboard/notifikasi");
  await page.locator(".notif-kartu", { hasText: "video belajar menunggu persetujuan" }).getByRole("link", { name: /Buka/ }).click();
  await page.locator(".kartu-pustaka", { hasText: "Pecahan seperempat" }).click();
  const tinjau = page.getByRole("dialog", { name: /Video Pecahan seperempat/ });
  await tinjau.getByRole("button", { name: /Setujui/ }).click();
  await expect(page.locator(".swal2-popup")).toContainText("Setujui video ini");
  await page.locator(".swal2-confirm").click();
  await expect(tinjau).toContainText("Disetujui");

  await masuk("siswa");
  await page.goto("/dashboard/portal");
  await page.locator(".video-portal").getByRole("button").first().click();
  await expect(page.locator(".video-portal")).toContainText("Pecahan seperempat (kue)");
  await expect(page.locator(".video-portal video")).toHaveCount(1);
});

test("guru membuat video motion graphic dari templat dengan pratinjau langsung", async ({ page, masuk }) => {
  test.setTimeout(150_000);
  await masuk("guru");
  await page.goto("/dashboard/video-belajar");
  await page.getByRole("button", { name: "Buat video motion graphic" }).click();
  const jendela = page.getByRole("dialog", { name: "Buat video dari templat" });
  await jendela.locator(".pilih-templat", { hasText: "Berhitung dengan Benda" }).click();
  // Pratinjau Remotion Player tampil dan berisi contoh
  await expect(jendela.locator(".__remotion-player, [class*='remotion']").first()).toBeVisible({ timeout: 30_000 });
  await expect(jendela.locator(".adegan-templat")).toHaveCount(3);
  await jendela.getByLabel("Judul video").fill("Berhitung Pisang Kelas 1");
  await jendela.locator(".adegan-templat").first().getByLabel("Jumlah benda (1–10)").fill("4");
  await jendela.locator(".adegan-templat").first().getByLabel("Narasi yang dibacakan").fill("Mari kita hitung pisang. Satu, dua, tiga, empat.");
  await expect(jendela.getByLabel("Suara narasi")).toHaveValue("LOKAL");
  // Rasio tegak untuk Reels/Status WA: pratinjau ikut berubah bentuk
  await jendela.getByRole("button", { name: "9:16" }).click();
  await expect(jendela).toContainText("9:16 tegak");
  await jendela.getByRole("button", { name: "Buat video" }).click();
  await expect(page.locator(".swal2-popup")).toContainText("antrean render");
  await page.locator(".swal2-confirm").click();
  const detail = page.getByRole("dialog", { name: /Video Berhitung Pisang/ });
  await expect(detail).toContainText(/Menunggu giliran render|sedang membuat narasi/);
  await expect(detail.getByRole("button", { name: "Ajukan" })).toHaveCount(1); // tombol ada, server menolak sampai render selesai
});
